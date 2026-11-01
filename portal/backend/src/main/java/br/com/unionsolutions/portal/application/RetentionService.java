package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.application.Dtos.*;
import br.com.unionsolutions.portal.domain.*;
import br.com.unionsolutions.portal.domain.Types.*;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Retenção: o que seria removido por categoria (simulação) e a remoção em si (execução).
 *
 * Os prazos vêm da configuração e valem 0 (nunca) até a empresa aprovar uma política. A execução só acontece com
 * `portal.retention.enabled=true` e uma referência à política aprovada; a simulação está sempre disponível à
 * administração da Union e roda todo dia, registrada. Nada aqui apaga o que ainda está em uso: só registros já
 * encerrados, arquivados, lidos ou enviados, e sempre com o objeto do armazenamento junto do registro.
 */
@ApplicationScoped
public class RetentionService {
    private static final Logger LOG = Logger.getLogger(RetentionService.class);

    @Inject EntityManager em;
    @Inject AuditService audit;
    @Inject AccessPolicy policy;
    @Inject Ports.ObjectStorage storage;
    @Inject Instance<RetentionService> self;
    @ConfigProperty(name = "portal.retention.enabled") boolean enabled;
    @ConfigProperty(name = "portal.retention.policy-reference") java.util.Optional<String> policyReference;
    @ConfigProperty(name = "portal.retention.notifications-days") int notificationsDays;
    @ConfigProperty(name = "portal.retention.emails-days") int emailsDays;
    @ConfigProperty(name = "portal.retention.invitations-days") int invitationsDays;
    @ConfigProperty(name = "portal.retention.closed-tickets-days") int closedTicketsDays;
    @ConfigProperty(name = "portal.retention.archived-documents-days") int archivedDocumentsDays;
    @ConfigProperty(name = "portal.retention.disabled-users-days") int disabledUsersDays;
    @ConfigProperty(name = "portal.retention.audit-days") int auditDays;

    public boolean enabled() {
        return enabled && policyReference.filter(v -> !v.isBlank()).isPresent();
    }

    private String policy() {
        return policyReference.orElse("");
    }

    private static Instant cutoff(int days) {
        return Instant.now().minus(Duration.ofDays(days));
    }

    // ---------- Simulação ----------

    @Transactional
    public RetentionReport simulate(Actor actor) {
        policy.requireUnionAdmin(actor);
        RetentionReport report = report();
        record(RetentionRun.SIMULATION, actor.id(), report, 0, null);
        audit.record(actor, "RETENTION_SIMULATED", "retention", null, null, null, summary(report), false);
        return report;
    }

    /** Relatório sem registro: consulta de leitura, sem efeito na auditoria. */
    @Transactional
    public RetentionReport preview(Actor actor) {
        policy.requireUnionAdmin(actor);
        return report();
    }

    @Transactional
    public RetentionReport report() {
        List<RetentionCategory> categories = new ArrayList<>();
        categories.add(category("notificacoes-lidas", notificationsDays,
                "select count(n) from Notification n where n.readAt is not null and n.readAt < :cutoff", "Avisos já lidos."));
        categories.add(category("emails-enviados", emailsDays,
                "select count(e) from EmailOutbox e where e.status <> 'PENDING' and e.createdAt < :cutoff", "Registros de e-mails enviados ou que desistiram; o corpo já não existe."));
        categories.add(category("convites-encerrados", invitationsDays,
                "select count(i) from Invitation i where (i.acceptedAt is not null or i.revokedAt is not null or i.expiresAt < :now) and i.createdAt < :cutoff",
                "Convites aceitos, revogados ou vencidos; só o hash do token é guardado."));
        categories.add(category("solicitacoes-encerradas", closedTicketsDays,
                "select count(t) from Ticket t where t.status = :closed and t.updatedAt < :cutoff", "Solicitações encerradas, com comentários, notas e anexos."));
        categories.add(archivedDocumentsDays <= 0
                ? new RetentionCategory("documentos-arquivados", 0, 0, "Sem prazo configurado: nada é contado nem removido. Documentos arquivados sem vínculo com entregas, com todas as versões e arquivos.")
                : new RetentionCategory("documentos-arquivados", archivedDocumentsDays, archivedDocumentsCount(cutoff(archivedDocumentsDays)),
                        "Documentos arquivados sem vínculo com entregas, com todas as versões e arquivos."));
        categories.add(category("contas-desativadas", disabledUsersDays,
                "select count(u) from AppUser u where u.status = :disabled and u.disabledAt < :cutoff", "Contas desativadas: só informado. A remoção depende de decisão sobre a autoria dos registros."));
        categories.add(category("auditoria", auditDays,
                "select count(a) from AuditEvent a where a.createdAt < :cutoff", "Eventos de auditoria: só informado. A tabela é protegida contra exclusão pela aplicação; a remoção é operação do banco."));
        return new RetentionReport(enabled(), policy(), Instant.now(), categories);
    }

    private RetentionCategory category(String name, int days, String jpql, String note) {
        if (days <= 0) return new RetentionCategory(name, days, 0, "Sem prazo configurado: nada é contado nem removido. " + note);
        var q = em.createQuery(jpql, Long.class).setParameter("cutoff", cutoff(days));
        if (jpql.contains(":now")) q.setParameter("now", Instant.now());
        if (jpql.contains(":closed")) q.setParameter("closed", TicketStatus.CLOSED);
        if (jpql.contains(":archived")) q.setParameter("archived", RecordStatus.ARCHIVED);
        if (jpql.contains(":disabled")) q.setParameter("disabled", UserStatus.DISABLED);
        return new RetentionCategory(name, days, q.getSingleResult(), note);
    }

    // ---------- Execução ----------

    /** Remove o que a simulação contou, categoria por categoria, cada uma na própria transação. Só com a retenção ligada. */
    public RetentionRunView execute(Actor actor) {
        policy.requireUnionAdmin(actor);
        if (!enabled()) throw ApiException.conflict("RETENTION_DISABLED", "A retenção está desligada: falta a política aprovada (portal.retention.enabled e portal.retention.policy-reference).");
        return run(actor.id());
    }

    /** Tarefa diária: simula sempre e executa só com a retenção ligada. */
    public void scheduled() {
        RetentionService me = self.get();
        try {
            if (enabled()) {
                me.run(null);
            } else {
                RetentionReport report = me.report();
                me.recordIndependent(RetentionRun.SIMULATION, null, report, 0, null);
            }
        } catch (RuntimeException e) {
            LOG.errorf("Rotina de retenção falhou: %s", e.getClass().getSimpleName());
        }
    }

    RetentionRunView run(UUID triggeredBy) {
        RetentionService me = self.get();
        Instant started = Instant.now();
        RetentionReport before = me.report();
        int removed = 0;
        String error = null;
        try {
            if (notificationsDays > 0) removed += me.purgeNotifications(cutoff(notificationsDays));
            if (emailsDays > 0) removed += me.purgeEmails(cutoff(emailsDays));
            if (invitationsDays > 0) removed += me.purgeInvitations(cutoff(invitationsDays));
            if (closedTicketsDays > 0) for (UUID id : me.closedTickets(cutoff(closedTicketsDays))) removed += me.purgeTicket(id);
            if (archivedDocumentsDays > 0) for (UUID id : me.archivedDocuments(cutoff(archivedDocumentsDays))) removed += me.purgeDocument(id);
        } catch (RuntimeException e) {
            error = e.getClass().getSimpleName() + ": " + e.getMessage();
            LOG.errorf("Execução de retenção interrompida: %s", e.getClass().getSimpleName());
        }
        RetentionRunView view = me.recordIndependent(RetentionRun.EXECUTION, triggeredBy, before, removed, error);
        me.auditExecution(triggeredBy, before, removed, error);
        return view;
    }

    @Transactional
    public void auditExecution(UUID triggeredBy, RetentionReport report, int removed, String error) {
        audit.record(triggeredBy, "RETENTION_EXECUTED", "retention", null, null, null, "removidos=" + removed + (error == null ? "" : "; erro") + "; " + summary(report), false);
    }

    @Transactional
    public int purgeNotifications(Instant cutoff) {
        return em.createQuery("delete from Notification n where n.readAt is not null and n.readAt < :cutoff").setParameter("cutoff", cutoff).executeUpdate();
    }

    @Transactional
    public int purgeEmails(Instant cutoff) {
        return em.createQuery("delete from EmailOutbox e where e.status <> 'PENDING' and e.createdAt < :cutoff").setParameter("cutoff", cutoff).executeUpdate();
    }

    @Transactional
    public int purgeInvitations(Instant cutoff) {
        return em.createQuery("delete from Invitation i where (i.acceptedAt is not null or i.revokedAt is not null or i.expiresAt < :now) and i.createdAt < :cutoff")
                .setParameter("cutoff", cutoff).setParameter("now", Instant.now()).executeUpdate();
    }

    @Transactional
    public List<UUID> closedTickets(Instant cutoff) {
        return em.createQuery("select t.id from Ticket t where t.status = :closed and t.updatedAt < :cutoff", UUID.class)
                .setParameter("closed", TicketStatus.CLOSED).setParameter("cutoff", cutoff).setMaxResults(500).getResultList();
    }

    /** Anexos saem do armazenamento antes do registro; se o armazenamento recusar, a solicitação fica para a próxima execução. */
    @Transactional
    public int purgeTicket(UUID ticketId) {
        int removed = 0;
        for (TicketAttachment a : TicketAttachment.<TicketAttachment>list("ticketId", ticketId)) {
            StoredFile f = StoredFile.findById(a.fileId);
            if (f != null && f.objectPresent) storage.delete(f.objectKey);
            a.delete();
            if (f != null) f.delete();
            removed++;
        }
        removed += TicketComment.delete("ticketId", ticketId);
        removed += Notification.delete("resourceType = ?1 and resourceId = ?2", "ticket", ticketId);
        Ticket t = Ticket.findById(ticketId);
        if (t != null) {
            t.delete();
            removed++;
        }
        return removed;
    }

    private static final String ARCHIVED_WITHOUT_DELIVERY = """
            FROM document d WHERE d.status = 'ARCHIVED' AND d.updated_at < :cutoff
              AND NOT EXISTS (SELECT 1 FROM delivery_version_document l JOIN document_version dv ON dv.id = l.document_version_id WHERE dv.document_id = d.id)""";

    long archivedDocumentsCount(Instant cutoff) {
        return ((Number) em.createNativeQuery("SELECT count(*) " + ARCHIVED_WITHOUT_DELIVERY).setParameter("cutoff", cutoff).getSingleResult()).longValue();
    }

    @Transactional
    @SuppressWarnings("unchecked")
    public List<UUID> archivedDocuments(Instant cutoff) {
        return em.createNativeQuery("SELECT d.id " + ARCHIVED_WITHOUT_DELIVERY + " LIMIT 500", UUID.class).setParameter("cutoff", cutoff).getResultList();
    }

    @Transactional
    public int purgeDocument(UUID documentId) {
        int removed = 0;
        for (DocumentVersion v : DocumentVersion.<DocumentVersion>list("documentId", documentId)) {
            StoredFile f = StoredFile.findById(v.fileId);
            if (f != null && f.objectPresent) storage.delete(f.objectKey);
            v.delete();
            if (f != null) f.delete();
            removed++;
        }
        removed += Notification.delete("resourceType = ?1 and resourceId = ?2", "document", documentId);
        Document d = Document.findById(documentId);
        if (d != null) {
            d.delete();
            removed++;
        }
        return removed;
    }

    // ---------- Registro ----------

    @Transactional
    public void record(String mode, UUID triggeredBy, RetentionReport report, int removed, String error) {
        persistRun(mode, triggeredBy, report, removed, error);
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public RetentionRunView recordIndependent(String mode, UUID triggeredBy, RetentionReport report, int removed, String error) {
        return persistRun(mode, triggeredBy, report, removed, error);
    }

    private RetentionRunView persistRun(String mode, UUID triggeredBy, RetentionReport report, int removed, String error) {
        RetentionRun run = new RetentionRun();
        run.id = UUID.randomUUID();
        run.mode = mode;
        run.triggeredBy = triggeredBy;
        run.startedAt = report.generatedAt();
        run.finishedAt = Instant.now();
        run.summary = summary(report);
        run.removed = removed;
        run.error = error == null ? null : error.substring(0, Math.min(error.length(), 300));
        run.persist();
        return view(run);
    }

    static String summary(RetentionReport report) {
        StringBuilder sb = new StringBuilder(report.enabled() ? "ligada" : "desligada");
        for (RetentionCategory c : report.categories()) sb.append("; ").append(c.category()).append('=').append(c.days() > 0 ? c.matching() : "-");
        return sb.toString();
    }

    @Transactional
    public List<RetentionRunView> runs(Actor actor, int limit) {
        policy.requireUnionAdmin(actor);
        return RetentionRun.<RetentionRun>find("order by startedAt desc").page(0, Math.min(limit, 50)).list().stream().map(RetentionService::view).toList();
    }

    static RetentionRunView view(RetentionRun r) {
        return new RetentionRunView(r.id, r.mode, r.startedAt, r.finishedAt, r.summary, r.removed, r.error);
    }
}
