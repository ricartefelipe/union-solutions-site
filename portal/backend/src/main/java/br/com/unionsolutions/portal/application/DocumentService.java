package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.application.Dtos.*;
import br.com.unionsolutions.portal.domain.*;
import br.com.unionsolutions.portal.domain.Types.*;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class DocumentService {
    @Inject AccessPolicy policy;
    @Inject AuditService audit;
    @Inject FileService files;

    public record NewDocument(UUID organizationId, UUID projectId, String title, DocCategory category, DocVisibility visibility, String note) {}

    @Transactional
    public Page<DocumentView> list(Actor actor, UUID projectId, UUID organizationId, DocCategory category, String q, int page, int size) {
        Listing<Document> listing = new Listing<>(Document.class, "d").orderBy("d.updatedAt desc");
        String memberOfProject = "exists (select 1 from ProjectMember m where m.projectId = d.projectId and m.userId = :actorId)";
        if (actor.isUnionAdmin()) {
            if (organizationId != null) listing.where("d.tenantId = :org", "org", organizationId);
        } else if (actor.isUnionStaff()) {
            listing.where("((d.projectId is not null and " + memberOfProject + ") or (d.projectId is null and "
                    + "exists (select 1 from StaffAssignment a where a.tenantId = d.tenantId and a.userId = :actorId)))", "actorId", actor.id());
            if (organizationId != null) listing.where("d.tenantId = :org", "org", organizationId);
        } else {
            listing.where("d.tenantId = :tenant", "tenant", actor.tenantId())
                    .where("d.status = :active", "active", RecordStatus.ACTIVE)
                    .where("d.visibility <> :internal", "internal", DocVisibility.INTERNAL);
            // Para o cliente, o documento só existe depois de ter ao menos uma versão verificada e limpa.
            listing.where("exists (select 1 from DocumentVersion v, StoredFile f where v.documentId = d.id and f.id = v.fileId and f.scanStatus = :clean)", "clean", ScanStatus.CLEAN);
            if (actor.isClientMember()) {
                listing.where("d.visibility = :participants", "participants", DocVisibility.PARTICIPANTS)
                        .where("(d.projectId is null or " + memberOfProject + ")", "actorId", actor.id());
            }
        }
        if (projectId != null) listing.where("d.projectId = :project", "project", projectId);
        if (category != null) listing.where("d.category = :category", "category", category);
        if (q != null && !q.isBlank()) listing.where("lower(d.title) like :q", "q", "%" + ProjectService.escapeLike(q.toLowerCase()) + "%");
        return listing.page(page, size, d -> view(actor, d));
    }

    @Transactional
    public DocumentDetail get(Actor actor, UUID id) {
        Document doc = policy.requireDocument(actor, id);
        List<DocumentVersionView> versions = DocumentVersion.<DocumentVersion>list("documentId = ?1 order by versionNo desc", id).stream()
                .filter(v -> actor.isUnion() || isClean(v)).map(this::view).toList();
        return new DocumentDetail(view(actor, doc), versions);
    }

    private static boolean isClean(DocumentVersion version) {
        return StoredFile.<StoredFile>findById(version.fileId).scanStatus == ScanStatus.CLEAN;
    }

    @Transactional
    public DocumentView create(Actor actor, NewDocument input, FileService.Upload upload) {
        policy.requireUnion(actor);
        UUID tenantId;
        if (input.projectId() != null) {
            Project project = policy.requireManageProject(actor, input.projectId());
            tenantId = project.tenantId;
            if (input.organizationId() != null && !input.organizationId().equals(tenantId)) throw ApiException.notFound();
        } else {
            if (input.organizationId() == null) throw ApiException.badRequest("ORGANIZATION_REQUIRED", "Informe a organização ou o projeto do documento.");
            policy.requireManageTenant(actor, input.organizationId());
            if (Organization.findById(input.organizationId()) == null) throw ApiException.notFound();
            tenantId = input.organizationId();
        }
        Document doc = new Document();
        doc.id = UUID.randomUUID();
        doc.tenantId = tenantId;
        doc.projectId = input.projectId();
        doc.title = input.title().trim();
        doc.category = input.category();
        doc.visibility = input.visibility();
        doc.status = RecordStatus.ACTIVE;
        doc.currentVersion = 1;
        doc.createdBy = actor.id();
        doc.createdAt = Instant.now();
        doc.updatedAt = doc.createdAt;
        doc.persist();
        addVersion(actor, doc, 1, input.note(), upload);
        // O cliente só é avisado quando a verificação libera o arquivo (FileService.markClean).
        audit.record(actor, "DOCUMENT_UPLOADED", "document", doc.id, tenantId, doc.projectId, doc.title, false);
        return view(actor, doc);
    }

    @Transactional
    public DocumentView addVersion(Actor actor, UUID documentId, String note, FileService.Upload upload) {
        policy.requireUnion(actor);
        Document doc = policy.requireDocument(actor, documentId);
        if (doc.status != RecordStatus.ACTIVE) throw ApiException.conflict("DOCUMENT_ARCHIVED", "Este documento está arquivado.");
        doc.currentVersion += 1;
        doc.updatedAt = Instant.now();
        addVersion(actor, doc, doc.currentVersion, note, upload);
        audit.record(actor, "DOCUMENT_VERSION_UPLOADED", "document", doc.id, doc.tenantId, doc.projectId, doc.title + " v" + doc.currentVersion, false);
        return view(actor, doc);
    }

    private void addVersion(Actor actor, Document doc, int number, String note, FileService.Upload upload) {
        StoredFile file = files.store(actor, doc.tenantId, upload);
        DocumentVersion version = new DocumentVersion();
        version.id = UUID.randomUUID();
        version.tenantId = doc.tenantId;
        version.documentId = doc.id;
        version.versionNo = number;
        version.fileId = file.id;
        version.authorId = actor.id();
        version.note = note;
        version.createdAt = Instant.now();
        version.persist();
    }

    @Transactional
    public DocumentView update(Actor actor, UUID id, DocumentPatch patch) {
        policy.requireUnion(actor);
        Document doc = policy.requireDocument(actor, id);
        if (doc.version != patch.version()) throw ApiException.conflict("STALE_VERSION", "Este documento foi alterado por outra pessoa. Recarregue a página.");
        if (patch.title() != null) doc.title = patch.title().trim();
        if (patch.category() != null) doc.category = patch.category();
        if (patch.visibility() != null && patch.visibility() != doc.visibility) {
            audit.record(actor, "DOCUMENT_VISIBILITY_CHANGED", "document", doc.id, doc.tenantId, doc.projectId, doc.visibility + " para " + patch.visibility(), false);
            doc.visibility = patch.visibility();
        }
        if (patch.status() != null && patch.status() != doc.status) {
            doc.status = patch.status();
            audit.record(actor, "DOCUMENT_STATUS_CHANGED", "document", doc.id, doc.tenantId, doc.projectId, "Situação " + doc.status, false);
        }
        doc.updatedAt = Instant.now();
        return view(actor, doc);
    }

    /** Autoriza pelo documento, registra na auditoria e só então abre o arquivo. */
    @Transactional
    public FileService.Download download(Actor actor, UUID documentId, UUID versionId) {
        Document doc = policy.requireDocument(actor, documentId);
        DocumentVersion version = DocumentVersion.findById(versionId);
        if (version == null || !version.documentId.equals(doc.id)) throw ApiException.notFound();
        StoredFile file = StoredFile.findById(version.fileId);
        FileService.Download download = files.openClean(file);
        audit.record(actor, "DOCUMENT_DOWNLOADED", "document", doc.id, doc.tenantId, doc.projectId, doc.title + " v" + version.versionNo, false);
        return download;
    }

    /** A equipe vê a versão mais recente em qualquer estado. O cliente vê a mais recente já liberada. */
    DocumentView view(Actor actor, Document d) {
        DocumentVersion latest = DocumentVersion.<DocumentVersion>list("documentId = ?1 order by versionNo desc", d.id).stream()
                .filter(v -> actor.isUnion() || isClean(v)).findFirst().orElse(null);
        return new DocumentView(d.id, d.tenantId, d.projectId, Names.project(d.projectId), d.title, d.category, d.visibility, d.status, latest == null ? d.currentVersion : latest.versionNo,
                Names.user(d.createdBy), d.createdAt, latest == null ? null : view(latest), d.version);
    }

    DocumentVersionView view(DocumentVersion v) {
        StoredFile file = StoredFile.findById(v.fileId);
        return new DocumentVersionView(v.id, v.versionNo, FileService.view(file), Names.user(v.authorId), v.note, v.createdAt);
    }
}
