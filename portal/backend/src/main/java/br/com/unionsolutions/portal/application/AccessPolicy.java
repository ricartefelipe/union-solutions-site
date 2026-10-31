package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.domain.*;
import br.com.unionsolutions.portal.domain.Types.*;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;
import java.util.UUID;

/**
 * Único lugar que decide quem alcança o quê. Recursos fora do alcance respondem como inexistentes,
 * para que um ID conhecido não revele que o registro existe.
 */
@ApplicationScoped
public class AccessPolicy {

    public boolean isMember(UUID projectId, UUID userId) {
        return ProjectMember.count("projectId = ?1 and userId = ?2", projectId, userId) > 0;
    }

    public boolean isAssigned(UUID tenantId, UUID userId) {
        return StaffAssignment.count("tenantId = ?1 and userId = ?2", tenantId, userId) > 0;
    }

    // ---------- Organização ----------

    /** A organização, para quem administra ou está associado a ela. */
    public boolean canReachTenant(Actor actor, UUID tenantId) {
        if (actor.isUnionAdmin()) return true;
        if (actor.isUnionStaff()) return isAssigned(tenantId, actor.id());
        return tenantId.equals(actor.tenantId());
    }

    public void requireManageTenant(Actor actor, UUID tenantId) {
        if (actor.isUnionAdmin()) return;
        if (actor.isUnionStaff() && isAssigned(tenantId, actor.id())) return;
        throw actor.isUnion() ? ApiException.notFound() : ApiException.forbidden();
    }

    public void requireUnionAdmin(Actor actor) {
        if (!actor.isUnionAdmin()) throw ApiException.forbidden();
    }

    public void requireUnion(Actor actor) {
        if (!actor.isUnion()) throw ApiException.forbidden();
    }

    // ---------- Projeto ----------

    public boolean canReadProject(Actor actor, Project project) {
        if (actor.isUnionAdmin()) return true;
        if (actor.isUnionStaff()) return isMember(project.id, actor.id());
        if (!project.tenantId.equals(actor.tenantId())) return false;
        return actor.isClientAdmin() || isMember(project.id, actor.id());
    }

    public Project requireProject(Actor actor, UUID projectId) {
        Project project = Project.findById(projectId);
        if (project == null || !canReadProject(actor, project)) throw ApiException.notFound();
        return project;
    }

    /** Operar um projeto é da Union: administrador ou profissional associado a ele. */
    public Project requireManageProject(Actor actor, UUID projectId) {
        Project project = requireProject(actor, projectId);
        if (!actor.isUnion()) throw ApiException.forbidden();
        return project;
    }

    /** Filtro de projetos visíveis, usado em listagens e contagens. Parâmetros: :actorId e :tenantId, quando presentes. */
    public VisibleScope projectScope(Actor actor, String alias) {
        if (actor.isUnionAdmin()) return new VisibleScope("1 = 1", false, false);
        String member = "exists (select 1 from ProjectMember m where m.projectId = " + alias + ".id and m.userId = :actorId)";
        if (actor.isUnionStaff()) return new VisibleScope(member, true, false);
        if (actor.isClientAdmin()) return new VisibleScope(alias + ".tenantId = :tenantId", false, true);
        return new VisibleScope(alias + ".tenantId = :tenantId and " + member, true, true);
    }

    public record VisibleScope(String jpql, boolean usesActor, boolean usesTenant) {}

    public boolean canApprove(Actor actor, Project project) {
        if (!actor.isClient() || !project.tenantId.equals(actor.tenantId())) return false;
        if (actor.isClientAdmin()) return true;
        ProjectMember member = ProjectMember.find("projectId = ?1 and userId = ?2", project.id, actor.id()).firstResult();
        return member != null && member.canApprove;
    }

    // ---------- Documento ----------

    public boolean canReadDocument(Actor actor, Document doc) {
        if (actor.isUnionAdmin()) return true;
        if (actor.isUnionStaff()) {
            return doc.projectId != null ? isMember(doc.projectId, actor.id()) : isAssigned(doc.tenantId, actor.id());
        }
        if (!doc.tenantId.equals(actor.tenantId())) return false;
        if (doc.status != RecordStatus.ACTIVE || doc.visibility == DocVisibility.INTERNAL) return false;
        if (actor.isClientAdmin()) return true;
        if (doc.visibility == DocVisibility.CLIENT_ADMINS) return false;
        return doc.projectId == null || isMember(doc.projectId, actor.id());
    }

    public Document requireDocument(Actor actor, UUID documentId) {
        Document doc = Document.findById(documentId);
        if (doc == null || !canReadDocument(actor, doc)) throw ApiException.notFound();
        return doc;
    }

    // ---------- Suporte ----------

    public boolean canReadTicket(Actor actor, Ticket ticket) {
        if (actor.isUnionAdmin()) return true;
        if (actor.isUnionStaff()) {
            if (ticket.projectId != null && isMember(ticket.projectId, actor.id())) return true;
            return ticket.projectId == null && isAssigned(ticket.tenantId, actor.id());
        }
        if (!ticket.tenantId.equals(actor.tenantId())) return false;
        if (actor.isClientAdmin() || ticket.openedBy.equals(actor.id())) return true;
        return ticket.projectId != null && isMember(ticket.projectId, actor.id());
    }

    public Ticket requireTicket(Actor actor, UUID ticketId) {
        Ticket ticket = Ticket.findById(ticketId);
        if (ticket == null || !canReadTicket(actor, ticket)) throw ApiException.notFound();
        return ticket;
    }

    /** IDs de organização acessíveis pela equipe associada. */
    public List<UUID> assignedTenants(Actor actor) {
        return StaffAssignment.<StaffAssignment>list("userId", actor.id()).stream().map(a -> a.tenantId).toList();
    }
}
