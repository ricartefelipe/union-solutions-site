package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.application.Dtos.*;
import br.com.unionsolutions.portal.domain.*;
import br.com.unionsolutions.portal.domain.Types.*;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Entregas versionadas. A decisão fica presa à versão exata: cada versão aceita uma única decisão, e uma nova
 * versão começa sem aprovação. Bloqueio na ordem entrega, depois versão, para decisões e publicações concorrentes.
 */
@ApplicationScoped
public class DeliveryService {
    @Inject AccessPolicy policy;
    @Inject AuditService audit;
    @Inject EntityManager em;

    @Transactional
    public Page<DeliverySummary> listByProject(Actor actor, UUID projectId, int page, int size) {
        Project project = policy.requireProject(actor, projectId);
        return new Listing<>(Delivery.class, "d").where("d.projectId = :project", "project", project.id)
                .where("d.status = :active", "active", RecordStatus.ACTIVE).orderBy("d.updatedAt desc").page(page, size, this::summary);
    }

    private DeliverySummary summary(Delivery d) {
        DeliveryVersion current = DeliveryVersion.find("deliveryId = ?1 and versionNo = ?2", d.id, d.currentVersion).firstResult();
        return new DeliverySummary(d.id, d.projectId, Names.project(d.projectId), d.title, d.dueDate, d.currentVersion, current.status, d.updatedAt);
    }

    @Transactional
    public DeliveryDetail get(Actor actor, UUID deliveryId) {
        Delivery delivery = Delivery.findById(deliveryId);
        if (delivery == null) throw ApiException.notFound();
        Project project = policy.requireProject(actor, delivery.projectId);
        return detail(actor, delivery, project);
    }

    private DeliveryDetail detail(Actor actor, Delivery d, Project project) {
        List<DeliveryVersionView> versions = DeliveryVersion.<DeliveryVersion>list("deliveryId = ?1 order by versionNo desc", d.id).stream().map(v -> view(actor, v)).toList();
        return new DeliveryDetail(d.id, d.projectId, project.name, d.title, d.dueDate, d.currentVersion, actor.isUnion(), policy.canApprove(actor, project), versions);
    }

    private DeliveryVersionView view(Actor actor, DeliveryVersion v) {
        ApprovalDecision decision = ApprovalDecision.find("deliveryVersionId", v.id).firstResult();
        DecisionView decisionView = decision == null ? null : new DecisionView(decision.decision, decision.comment, Names.user(decision.decidedBy), decision.decidedAt);
        return new DeliveryVersionView(v.id, v.versionNo, v.description, v.status, Names.user(v.publishedBy), v.publishedAt, v.approvalRequestedAt, decisionView, documents(actor, v));
    }

    private List<DocumentVersionLink> documents(Actor actor, DeliveryVersion v) {
        @SuppressWarnings("unchecked")
        List<UUID> ids = em.createNativeQuery("SELECT document_version_id FROM delivery_version_document WHERE delivery_version_id = :id", UUID.class)
                .setParameter("id", v.id).getResultList();
        return ids.stream().map(id -> {
            DocumentVersion version = DocumentVersion.findById(id);
            Document doc = Document.findById(version.documentId);
            boolean readable = policy.canReadDocument(actor, doc);
            StoredFile file = StoredFile.findById(version.fileId);
            // Documento fora do alcance do usuário aparece sem título, para não revelar o conteúdo.
            return new DocumentVersionLink(readable ? doc.id : null, readable ? version.id : null, readable ? doc.title : "Documento restrito",
                    version.versionNo, readable, readable && file.scanStatus == ScanStatus.CLEAN);
        }).toList();
    }

    @Transactional
    public DeliveryDetail create(Actor actor, UUID projectId, DeliveryInput input) {
        Project project = policy.requireManageProject(actor, projectId);
        Delivery delivery = new Delivery();
        delivery.id = UUID.randomUUID();
        delivery.tenantId = project.tenantId;
        delivery.projectId = project.id;
        delivery.title = input.title().trim();
        delivery.dueDate = input.dueDate();
        delivery.currentVersion = 1;
        delivery.status = RecordStatus.ACTIVE;
        delivery.createdBy = actor.id();
        delivery.createdAt = Instant.now();
        delivery.updatedAt = delivery.createdAt;
        delivery.persist();
        DeliveryVersion version = publish(actor, delivery, 1, input.description(), input.documentVersionIds());
        audit.record(actor, "DELIVERY_PUBLISHED", "delivery_version", version.id, project.tenantId, project.id, delivery.title + " v1", true);
        return detail(actor, delivery, project);
    }

    /** Publica nova versão. A anterior deixa de ser decidível e sua decisão, se houver, permanece no histórico. */
    @Transactional
    public DeliveryDetail publishVersion(Actor actor, UUID deliveryId, DeliveryVersionInput input) {
        Delivery delivery = lockDelivery(deliveryId);
        Project project = policy.requireManageProject(actor, delivery.projectId);
        DeliveryVersion previous = DeliveryVersion.find("deliveryId = ?1 and versionNo = ?2", delivery.id, delivery.currentVersion)
                .withLock(LockModeType.PESSIMISTIC_WRITE).firstResult();
        if (previous.status.canMoveTo(DeliveryVersionStatus.SUPERSEDED)) previous.status = DeliveryVersionStatus.SUPERSEDED;
        delivery.currentVersion += 1;
        delivery.updatedAt = Instant.now();
        DeliveryVersion version = publish(actor, delivery, delivery.currentVersion, input.description(), input.documentVersionIds());
        audit.record(actor, "DELIVERY_VERSION_PUBLISHED", "delivery_version", version.id, project.tenantId, project.id, delivery.title + " v" + version.versionNo, true);
        project.updatedAt = Instant.now();
        return detail(actor, delivery, project);
    }

    private Delivery lockDelivery(UUID id) {
        Delivery delivery = Delivery.findById(id, LockModeType.PESSIMISTIC_WRITE);
        if (delivery == null) throw ApiException.notFound();
        return delivery;
    }

    private DeliveryVersion publish(Actor actor, Delivery delivery, int number, String description, List<UUID> documentVersionIds) {
        DeliveryVersion version = new DeliveryVersion();
        version.id = UUID.randomUUID();
        version.tenantId = delivery.tenantId;
        version.deliveryId = delivery.id;
        version.versionNo = number;
        version.description = description.trim();
        version.status = DeliveryVersionStatus.PUBLISHED;
        version.publishedBy = actor.id();
        version.publishedAt = Instant.now();
        version.persist();
        em.flush();
        if (documentVersionIds != null) {
            documentVersionIds.stream().distinct().forEach(id -> link(delivery, version, id));
        }
        return version;
    }

    private void link(Delivery delivery, DeliveryVersion version, UUID documentVersionId) {
        DocumentVersion docVersion = DocumentVersion.findById(documentVersionId);
        Document doc = docVersion == null ? null : Document.findById(docVersion.documentId);
        boolean sameScope = doc != null && doc.tenantId.equals(delivery.tenantId) && (doc.projectId == null || doc.projectId.equals(delivery.projectId));
        if (!sameScope) throw ApiException.badRequest("DOCUMENT_NOT_AVAILABLE", "Um dos documentos não pertence a este projeto.");
        if (doc.visibility == DocVisibility.INTERNAL) throw ApiException.badRequest("DOCUMENT_NOT_AVAILABLE", "Documento interno não pode compor uma entrega.");
        StoredFile file = StoredFile.findById(docVersion.fileId);
        if (file.scanStatus != ScanStatus.CLEAN) throw ApiException.badRequest("DOCUMENT_NOT_AVAILABLE", "Um dos documentos ainda não concluiu a verificação de segurança.");
        em.createNativeQuery("INSERT INTO delivery_version_document (tenant_id, delivery_version_id, document_version_id) VALUES (:tenant, :version, :doc)")
                .setParameter("tenant", delivery.tenantId).setParameter("version", version.id).setParameter("doc", documentVersionId).executeUpdate();
    }

    @Transactional
    public DeliveryDetail requestApproval(Actor actor, UUID deliveryVersionId) {
        DeliveryVersion lookup = DeliveryVersion.findById(deliveryVersionId);
        if (lookup == null) throw ApiException.notFound();
        Delivery delivery = lockDelivery(lookup.deliveryId);
        Project project = policy.requireManageProject(actor, delivery.projectId);
        DeliveryVersion version = DeliveryVersion.findById(deliveryVersionId, LockModeType.PESSIMISTIC_WRITE);
        em.refresh(version);
        if (version.versionNo != delivery.currentVersion || !version.status.canMoveTo(DeliveryVersionStatus.AWAITING_APPROVAL)) {
            throw ApiException.conflict("INVALID_TRANSITION", "Esta versão não pode ir para aprovação.");
        }
        version.status = DeliveryVersionStatus.AWAITING_APPROVAL;
        version.approvalRequestedAt = Instant.now();
        version.approvalRequestedBy = actor.id();
        audit.record(actor, "APPROVAL_REQUESTED", "delivery_version", version.id, project.tenantId, project.id, delivery.title + " v" + version.versionNo, true);
        return detail(actor, delivery, project);
    }

    @Transactional
    public DeliveryDetail decide(Actor actor, UUID deliveryVersionId, DecisionInput input) {
        DeliveryVersion lookup = DeliveryVersion.findById(deliveryVersionId);
        if (lookup == null) throw ApiException.notFound();
        Project scope = policy.requireProject(actor, Delivery.<Delivery>findById(lookup.deliveryId).projectId);
        if (!policy.canApprove(actor, scope)) throw ApiException.forbidden();
        String comment = input.comment() == null ? null : input.comment().trim();
        if (input.decision() == Decision.CHANGES_REQUESTED && (comment == null || comment.isEmpty())) {
            throw ApiException.badRequest("COMMENT_REQUIRED", "Descreva os ajustes solicitados.");
        }

        Delivery delivery = lockDelivery(lookup.deliveryId);
        DeliveryVersion version = DeliveryVersion.findById(deliveryVersionId, LockModeType.PESSIMISTIC_WRITE);
        em.refresh(version);
        if (version.versionNo != delivery.currentVersion) {
            throw ApiException.conflict("STALE_VERSION", "Esta versão foi substituída por outra. Revise a versão atual.");
        }
        if (version.status != DeliveryVersionStatus.AWAITING_APPROVAL) {
            throw ApiException.conflict("ALREADY_DECIDED", "Esta versão não está aguardando decisão.");
        }
        DeliveryVersionStatus target = input.decision() == Decision.APPROVED ? DeliveryVersionStatus.APPROVED : DeliveryVersionStatus.CHANGES_REQUESTED;
        version.status = target;
        ApprovalDecision decision = new ApprovalDecision();
        decision.id = UUID.randomUUID();
        decision.tenantId = version.tenantId;
        decision.deliveryVersionId = version.id;
        decision.decision = input.decision();
        decision.comment = comment;
        decision.decidedBy = actor.id();
        decision.decidedAt = Instant.now();
        decision.persist();
        delivery.updatedAt = Instant.now();
        audit.record(actor, target == DeliveryVersionStatus.APPROVED ? "DELIVERY_APPROVED" : "DELIVERY_CHANGES_REQUESTED", "delivery_version", version.id,
                version.tenantId, scope.id, delivery.title + " v" + version.versionNo, true);
        return detail(actor, delivery, scope);
    }

    /** Aprovações pendentes dentro do alcance do usuário. Para o cliente, só as que ele pode decidir. */
    @Transactional
    public List<PendingApproval> pending(Actor actor, int limit) {
        Listing<Project> projects = new Listing<>(Project.class, "p").scope(policy.projectScope(actor, "p"), actor).orderBy("p.updatedAt desc");
        return projects.top(200).stream()
                .filter(p -> actor.isUnion() || policy.canApprove(actor, p))
                .flatMap(p -> Delivery.<Delivery>list("projectId = ?1 and status = ?2", p.id, RecordStatus.ACTIVE).stream().map(d -> {
                    DeliveryVersion v = DeliveryVersion.find("deliveryId = ?1 and versionNo = ?2 and status = ?3", d.id, d.currentVersion, DeliveryVersionStatus.AWAITING_APPROVAL).firstResult();
                    return v == null ? null : new PendingApproval(d.id, v.id, p.id, p.name, d.title, v.versionNo, v.approvalRequestedAt);
                }))
                .filter(java.util.Objects::nonNull).limit(limit).toList();
    }
}
