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
public class TicketService {
    @Inject AccessPolicy policy;
    @Inject AuditService audit;
    @Inject NotificationService notifications;
    @Inject FileService files;

    /** Mesmo critério de AccessPolicy.canReadTicket, em forma de consulta, para listagens e contagens. */
    Listing<Ticket> visible(Actor actor) {
        Listing<Ticket> listing = new Listing<>(Ticket.class, "t");
        String member = "exists (select 1 from ProjectMember m where m.projectId = t.projectId and m.userId = :actorId)";
        if (actor.isUnionAdmin()) return listing;
        if (actor.isUnionStaff()) {
            return listing.where("((t.projectId is not null and " + member + ") or (t.projectId is null and "
                    + "exists (select 1 from StaffAssignment a where a.tenantId = t.tenantId and a.userId = :actorId)))", "actorId", actor.id());
        }
        listing.where("t.tenantId = :tenant", "tenant", actor.tenantId());
        if (actor.isClientMember()) {
            listing.where("(t.openedBy = :actorId or (t.projectId is not null and " + member + "))", "actorId", actor.id());
        }
        return listing;
    }

    @Transactional
    public Page<TicketSummary> list(Actor actor, TicketStatus status, boolean onlyOpen, UUID organizationId, int page, int size) {
        Listing<Ticket> listing = visible(actor).orderBy("t.updatedAt desc");
        if (status != null) listing.where("t.status = :status", "status", status);
        if (onlyOpen) listing.where("t.status not in (:closed)", "closed", List.of(TicketStatus.RESOLVED, TicketStatus.CLOSED));
        if (organizationId != null) listing.where("t.tenantId = :org", "org", organizationId);
        return listing.page(page, size, TicketService::summary);
    }

    static TicketSummary summary(Ticket t) {
        return new TicketSummary(t.id, t.tenantId, Names.organization(t.tenantId), t.projectId, Names.project(t.projectId), t.subject, t.category, t.priority, t.status, t.slaDueAt, t.createdAt, t.updatedAt);
    }

    @Transactional
    public TicketDetail get(Actor actor, UUID id) {
        return detail(actor, policy.requireTicket(actor, id));
    }

    private TicketDetail detail(Actor actor, Ticket t) {
        // Notas internas nunca saem da consulta para o cliente: o filtro está aqui, não na tela.
        String commentFilter = actor.isUnion() ? "ticketId = ?1 order by createdAt" : "ticketId = ?1 and internal = false order by createdAt";
        List<CommentView> comments = TicketComment.<TicketComment>list(commentFilter, t.id).stream().map(c -> {
            AppUser author = AppUser.findById(c.authorId);
            return new CommentView(c.id, c.body, c.internal, Names.user(c.authorId), author.role.isUnion(), c.createdAt);
        }).toList();
        String attachmentFilter = actor.isUnion() ? "ticketId = ?1 order by createdAt" : "ticketId = ?1 and internal = false order by createdAt";
        List<AttachmentView> attachments = TicketAttachment.<TicketAttachment>list(attachmentFilter, t.id).stream()
                .map(a -> new AttachmentView(a.id, FileService.view(StoredFile.findById(a.fileId)), a.internal, a.createdAt)).toList();
        // Histórico de situação a partir da auditoria do próprio recurso: só eventos visíveis ao cliente.
        List<TicketHistoryItem> history = AuditEvent.<AuditEvent>list("resourceType = 'ticket' and resourceId = ?1 and visibleToClient = true and action in ('TICKET_OPENED', 'TICKET_STATUS_CHANGED') order by createdAt", t.id)
                .stream().map(e -> new TicketHistoryItem(e.action, e.summary, e.actorId == null ? null : Names.user(e.actorId), e.createdAt)).toList();
        return new TicketDetail(summary(t), t.description, Names.user(t.openedBy), Names.user(t.assigneeId), t.assigneeId, t.version, actor.isUnion(), comments, attachments, history);
    }

    @Transactional
    public TicketDetail create(Actor actor, TicketInput input) {
        UUID tenantId;
        if (actor.isClient()) {
            if (input.organizationId() != null && !input.organizationId().equals(actor.tenantId())) throw ApiException.forbidden();
            tenantId = actor.tenantId();
        } else {
            if (input.organizationId() == null) throw ApiException.badRequest("ORGANIZATION_REQUIRED", "Informe a organização da solicitação.");
            policy.requireManageTenant(actor, input.organizationId());
            tenantId = input.organizationId();
        }
        if (input.projectId() != null) {
            Project project = policy.requireProject(actor, input.projectId());
            if (!project.tenantId.equals(tenantId)) throw ApiException.notFound();
        }
        Ticket t = new Ticket();
        t.id = UUID.randomUUID();
        t.tenantId = tenantId;
        t.projectId = input.projectId();
        t.subject = input.subject().trim();
        t.description = input.description().trim();
        t.category = input.category();
        t.priority = input.priority();
        t.status = TicketStatus.OPEN;
        t.openedBy = actor.id();
        t.createdAt = Instant.now();
        t.updatedAt = t.createdAt;
        t.persist();
        audit.record(actor, "TICKET_OPENED", "ticket", t.id, tenantId, t.projectId, t.subject, true);
        notifications.notify(actor.id(), notifications.ticketCounterpart(actor, t), "TICKET_OPENED", "Nova solicitação: " + t.subject, "/suporte/" + t.id, tenantId, t.projectId, "ticket", t.id);
        return detail(actor, t);
    }

    @Transactional
    public TicketDetail update(Actor actor, UUID id, TicketPatch patch) {
        policy.requireUnion(actor);
        Ticket t = policy.requireTicket(actor, id);
        if (t.version != patch.version()) throw ApiException.conflict("STALE_VERSION", "Esta solicitação foi alterada por outra pessoa. Recarregue a página.");
        if (patch.status() != null && patch.status() != t.status) {
            if (!t.status.canMoveTo(patch.status())) throw ApiException.conflict("INVALID_TRANSITION", "Esta mudança de situação não é permitida.");
            audit.record(actor, "TICKET_STATUS_CHANGED", "ticket", t.id, t.tenantId, t.projectId, t.subject + ": " + patch.status(), true);
            t.status = patch.status();
            notifications.notify(actor.id(), notifications.ticketCounterpart(actor, t), "TICKET_STATUS_CHANGED", "Solicitação atualizada: " + t.subject, "/suporte/" + t.id, t.tenantId, t.projectId, "ticket", t.id);
        }
        if (patch.priority() != null) t.priority = patch.priority();
        if (Boolean.TRUE.equals(patch.clearAssignee())) {
            t.assigneeId = null;
        } else if (patch.assigneeId() != null) {
            AppUser assignee = AppUser.findById(patch.assigneeId());
            if (assignee == null || !assignee.role.isUnion()) throw ApiException.badRequest("INVALID_USER", "Selecione um profissional da equipe Union.");
            t.assigneeId = assignee.id;
        }
        // O prazo só existe se for registrado explicitamente: não há cálculo automático de SLA.
        if (patch.slaDueAt() != null) t.slaDueAt = patch.slaDueAt();
        t.updatedAt = Instant.now();
        return detail(actor, t);
    }

    @Transactional
    public TicketDetail comment(Actor actor, UUID id, CommentInput input) {
        Ticket t = policy.requireTicket(actor, id);
        if (input.internal() && !actor.isUnion()) throw ApiException.forbidden();
        if (t.status == TicketStatus.CLOSED) throw ApiException.conflict("TICKET_CLOSED", "Esta solicitação está encerrada.");
        TicketComment comment = new TicketComment();
        comment.id = UUID.randomUUID();
        comment.tenantId = t.tenantId;
        comment.ticketId = t.id;
        comment.authorId = actor.id();
        comment.body = input.body().trim();
        comment.internal = input.internal();
        comment.createdAt = Instant.now();
        comment.persist();
        if (actor.isClient() && (t.status == TicketStatus.WAITING_CLIENT || t.status == TicketStatus.RESOLVED)) t.status = TicketStatus.IN_PROGRESS;
        t.updatedAt = Instant.now();
        audit.record(actor, input.internal() ? "TICKET_NOTE_ADDED" : "TICKET_COMMENTED", "ticket", t.id, t.tenantId, t.projectId,
                input.internal() ? null : t.subject, !input.internal());
        // Nota interna nunca gera aviso ao cliente: só comentários visíveis chegam ao outro lado.
        if (!input.internal()) {
            notifications.notify(actor.id(), notifications.ticketCounterpart(actor, t), "TICKET_COMMENTED", "Nova resposta em: " + t.subject, "/suporte/" + t.id, t.tenantId, t.projectId, "ticket", t.id);
        }
        return detail(actor, t);
    }

    @Transactional
    public TicketDetail attach(Actor actor, UUID id, boolean internal, FileService.Upload upload) {
        Ticket t = policy.requireTicket(actor, id);
        if (internal && !actor.isUnion()) throw ApiException.forbidden();
        if (t.status == TicketStatus.CLOSED) throw ApiException.conflict("TICKET_CLOSED", "Esta solicitação está encerrada.");
        StoredFile file = files.store(actor, t.tenantId, upload);
        TicketAttachment attachment = new TicketAttachment();
        attachment.id = UUID.randomUUID();
        attachment.tenantId = t.tenantId;
        attachment.ticketId = t.id;
        attachment.fileId = file.id;
        attachment.internal = internal;
        attachment.createdAt = Instant.now();
        attachment.persist();
        t.updatedAt = Instant.now();
        audit.record(actor, "TICKET_ATTACHMENT_ADDED", "ticket", t.id, t.tenantId, t.projectId, null, !internal);
        if (!internal) {
            notifications.notify(actor.id(), notifications.ticketCounterpart(actor, t), "TICKET_ATTACHMENT_ADDED", "Novo anexo em: " + t.subject, "/suporte/" + t.id, t.tenantId, t.projectId, "ticket", t.id);
        }
        return detail(actor, t);
    }

    @Transactional
    public FileService.Download download(Actor actor, UUID ticketId, UUID attachmentId) {
        Ticket t = policy.requireTicket(actor, ticketId);
        TicketAttachment attachment = TicketAttachment.findById(attachmentId);
        if (attachment == null || !attachment.ticketId.equals(t.id) || (attachment.internal && !actor.isUnion())) throw ApiException.notFound();
        FileService.Download download = files.openClean(StoredFile.findById(attachment.fileId));
        audit.record(actor, "TICKET_ATTACHMENT_DOWNLOADED", "ticket", t.id, t.tenantId, t.projectId, null, false);
        return download;
    }
}
