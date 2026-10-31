package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.application.Dtos.*;
import br.com.unionsolutions.portal.domain.*;
import br.com.unionsolutions.portal.domain.Types.*;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/** Produtos contratados: só registro e link. Senhas de outros produtos nunca são guardadas. */
@ApplicationScoped
public class ProductService {
    @Inject AccessPolicy policy;
    @Inject AuditService audit;
    @Inject DocumentService documents;
    @Inject EntityManager em;
    @ConfigProperty(name = "portal.products.allowed-link-hosts") Optional<String> allowedHosts;

    /** Só HTTPS, sem credenciais na URL, e apenas para os destinos autorizados na configuração. */
    public String validateLink(String url) {
        if (url == null || url.isBlank()) return null;
        URI uri;
        try {
            uri = new URI(url.trim());
        } catch (URISyntaxException e) {
            throw ApiException.badRequest("INVALID_LINK", "Informe um link válido.");
        }
        String host = uri.getHost();
        if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || uri.getUserInfo() != null) {
            throw ApiException.badRequest("INVALID_LINK", "O link deve usar HTTPS e não pode conter credenciais.");
        }
        String normalized = host.toLowerCase(Locale.ROOT);
        boolean allowed = Arrays.stream(allowedHosts.orElse("").split(",")).map(String::trim).filter(s -> !s.isEmpty())
                .anyMatch(h -> normalized.equals(h.toLowerCase(Locale.ROOT)) || normalized.endsWith("." + h.toLowerCase(Locale.ROOT)));
        if (!allowed) throw ApiException.badRequest("LINK_NOT_ALLOWED", "Este destino não está autorizado para links de produtos.");
        return uri.toString();
    }

    @Transactional
    public Page<ProductView> list(Actor actor, UUID organizationId, int page, int size) {
        Listing<ContractedProduct> listing = new Listing<>(ContractedProduct.class, "p").orderBy("lower(p.productName)");
        if (actor.isClient()) {
            listing.where("p.tenantId = :tenant", "tenant", actor.tenantId()).where("p.archivedAt is null");
        } else if (actor.isUnionStaff()) {
            listing.where("exists (select 1 from StaffAssignment a where a.tenantId = p.tenantId and a.userId = :actorId)", "actorId", actor.id());
        }
        if (organizationId != null) listing.where("p.tenantId = :org", "org", organizationId);
        return listing.page(page, size, p -> view(actor, p));
    }

    private ProductView view(Actor actor, ContractedProduct p) {
        @SuppressWarnings("unchecked")
        List<UUID> ids = em.createNativeQuery("SELECT document_id FROM contracted_product_document WHERE product_id = :id", UUID.class).setParameter("id", p.id).getResultList();
        List<DocumentRef> refs = ids.stream().map(id -> Document.<Document>findById(id)).filter(d -> policy.canReadDocument(actor, d)).map(d -> {
            DocumentVersion latest = DocumentVersion.find("documentId = ?1 and versionNo = ?2", d.id, d.currentVersion).firstResult();
            StoredFile file = StoredFile.findById(latest.fileId);
            return new DocumentRef(d.id, d.title, latest.id, file.scanStatus == ScanStatus.CLEAN);
        }).toList();
        return new ProductView(p.id, p.tenantId, Names.organization(p.tenantId), p.productName, p.commercialStatus, p.accessUrl, p.supportNotes, p.slaNote, p.archivedAt != null, refs, p.version, actor.isUnion());
    }

    @Transactional
    public ProductView create(Actor actor, ProductInput input) {
        policy.requireUnion(actor);
        policy.requireManageTenant(actor, input.organizationId());
        if (Organization.findById(input.organizationId()) == null) throw ApiException.notFound();
        ContractedProduct p = new ContractedProduct();
        p.id = UUID.randomUUID();
        p.tenantId = input.organizationId();
        p.productName = input.productName().trim();
        p.commercialStatus = input.commercialStatus();
        p.accessUrl = validateLink(input.accessUrl());
        p.supportNotes = input.supportNotes();
        p.slaNote = input.slaNote();
        p.createdBy = actor.id();
        p.createdAt = Instant.now();
        p.updatedAt = p.createdAt;
        p.persist();
        em.flush();
        linkDocuments(p, input.documentIds());
        audit.record(actor, "PRODUCT_REGISTERED", "product", p.id, p.tenantId, null, p.productName, true);
        return view(actor, p);
    }

    @Transactional
    public ProductView update(Actor actor, UUID id, ProductPatch patch) {
        policy.requireUnion(actor);
        ContractedProduct p = ContractedProduct.findById(id);
        if (p == null || !policy.canReachTenant(actor, p.tenantId)) throw ApiException.notFound();
        if (p.version != patch.version()) throw ApiException.conflict("STALE_VERSION", "Este produto foi alterado por outra pessoa. Recarregue a página.");
        if (patch.productName() != null) p.productName = patch.productName().trim();
        if (patch.commercialStatus() != null && patch.commercialStatus() != p.commercialStatus) {
            p.commercialStatus = patch.commercialStatus();
            audit.record(actor, "PRODUCT_STATUS_CHANGED", "product", p.id, p.tenantId, null, p.productName + ": " + p.commercialStatus, true);
        }
        if (patch.accessUrl() != null) p.accessUrl = validateLink(patch.accessUrl());
        if (patch.supportNotes() != null) p.supportNotes = patch.supportNotes();
        if (patch.slaNote() != null) p.slaNote = patch.slaNote().isBlank() ? null : patch.slaNote();
        if (patch.archived() != null) p.archivedAt = patch.archived() ? Instant.now() : null;
        if (patch.documentIds() != null) {
            em.createNativeQuery("DELETE FROM contracted_product_document WHERE product_id = :id").setParameter("id", p.id).executeUpdate();
            linkDocuments(p, patch.documentIds());
        }
        p.updatedAt = Instant.now();
        return view(actor, p);
    }

    private void linkDocuments(ContractedProduct p, List<UUID> documentIds) {
        if (documentIds == null) return;
        for (UUID documentId : documentIds.stream().distinct().toList()) {
            Document doc = Document.findById(documentId);
            if (doc == null || !doc.tenantId.equals(p.tenantId)) throw ApiException.badRequest("DOCUMENT_NOT_AVAILABLE", "Um dos documentos não pertence a esta organização.");
            em.createNativeQuery("INSERT INTO contracted_product_document (tenant_id, product_id, document_id) VALUES (:tenant, :product, :doc)")
                    .setParameter("tenant", p.tenantId).setParameter("product", p.id).setParameter("doc", documentId).executeUpdate();
        }
    }
}
