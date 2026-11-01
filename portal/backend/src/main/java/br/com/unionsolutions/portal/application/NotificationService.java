package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.application.Dtos.*;
import br.com.unionsolutions.portal.domain.*;
import br.com.unionsolutions.portal.domain.Types.*;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Central de notificações e fila de e-mails.
 *
 * O aviso e o e-mail são gravados na mesma transação do fato (MANDATORY): se o fato não for confirmado, nada é enviado;
 * se for, o aviso existe mesmo que o servidor de e-mail esteja fora do ar. O envio acontece depois, por uma tarefa
 * que tenta de novo com espera crescente e desiste depois de um limite, deixando o registro para a administração.
 *
 * O e-mail nunca leva o conteúdo do fato (mensagens, documentos, decisões): só o título do aviso e o link para o portal.
 */
@ApplicationScoped
public class NotificationService {
    private static final Logger LOG = Logger.getLogger(NotificationService.class);
    private static final int MAX_ATTEMPTS = 12;

    @Inject EntityManager em;
    @Inject AuditService audit;
    @Inject AccessPolicy policy;
    @Inject Ports.MailSender mail;
    @Inject Instance<NotificationService> self;
    @ConfigProperty(name = "portal.public-url") String publicUrl;
    @ConfigProperty(name = "portal.outbox.batch-size") int batchSize;

    // ---------- Destinatários ----------

    /** Pessoas do cliente que acompanham o projeto: participantes e administração da organização. */
    public Set<UUID> clientSide(Project project) {
        Set<UUID> ids = new LinkedHashSet<>();
        for (ProjectMember m : ProjectMember.<ProjectMember>list("projectId", project.id)) {
            AppUser u = AppUser.findById(m.userId);
            if (u != null && u.role.isClient()) ids.add(u.id);
        }
        for (AppUser u : AppUser.<AppUser>list("tenantId = ?1 and role = ?2", project.tenantId, Role.CLIENT_ADMIN)) ids.add(u.id);
        return ids;
    }

    /** Pessoas da Union responsáveis: participantes do projeto e administração. */
    public Set<UUID> unionSide(Project project) {
        Set<UUID> ids = new LinkedHashSet<>();
        for (ProjectMember m : ProjectMember.<ProjectMember>list("projectId", project.id)) {
            AppUser u = AppUser.findById(m.userId);
            if (u != null && u.role.isUnion()) ids.add(u.id);
        }
        for (AppUser u : AppUser.<AppUser>list("role", Role.UNION_ADMIN)) ids.add(u.id);
        return ids;
    }

    /** Administração do cliente, para documentos restritos a ela. */
    public Set<UUID> clientAdmins(UUID tenantId) {
        Set<UUID> ids = new LinkedHashSet<>();
        for (AppUser u : AppUser.<AppUser>list("tenantId = ?1 and role = ?2", tenantId, Role.CLIENT_ADMIN)) ids.add(u.id);
        return ids;
    }

    /** O outro lado de uma solicitação: quem abriu e, do lado da Union, o responsável, os participantes e a administração. */
    public Set<UUID> ticketCounterpart(Actor actor, Ticket ticket) {
        Set<UUID> ids = new LinkedHashSet<>();
        Project project = ticket.projectId == null ? null : Project.findById(ticket.projectId);
        if (actor.isClient()) {
            if (ticket.assigneeId != null) ids.add(ticket.assigneeId);
            if (project != null) ids.addAll(unionSide(project));
            else for (AppUser u : AppUser.<AppUser>list("role", Role.UNION_ADMIN)) ids.add(u.id);
            for (StaffAssignment a : StaffAssignment.<StaffAssignment>list("tenantId", ticket.tenantId)) ids.add(a.userId);
        } else {
            ids.add(ticket.openedBy);
            if (project != null) ids.addAll(clientSide(project));
        }
        return ids;
    }

    // ---------- Gravação ----------

    /** Grava o aviso para cada destinatário ativo, exceto quem agiu, e enfileira o e-mail de quem optou por recebê-lo. */
    @Transactional(Transactional.TxType.MANDATORY)
    public int notify(UUID actorId, Collection<UUID> recipients, String kind, String title, String link, UUID tenantId, UUID projectId,
                      String resourceType, UUID resourceId) {
        int created = 0;
        String safeTitle = title.length() > 200 ? title.substring(0, 200) : title;
        for (UUID userId : new LinkedHashSet<>(recipients)) {
            if (userId == null || userId.equals(actorId)) continue;
            AppUser user = AppUser.findById(userId);
            if (user == null || user.status != UserStatus.ACTIVE) continue;
            Notification n = new Notification();
            n.id = UUID.randomUUID();
            n.userId = user.id;
            n.tenantId = tenantId;
            n.projectId = projectId;
            n.resourceType = resourceType;
            n.resourceId = resourceId;
            n.kind = kind;
            n.title = safeTitle;
            n.link = link;
            n.createdAt = Instant.now();
            n.persist();
            created++;
            if (user.emailNotifications && user.keycloakSub != null) {
                enqueue(user, "Portal Union Solutions: " + safeTitle, emailBody(user, safeTitle, link));
            }
        }
        return created;
    }

    private String emailBody(AppUser user, String title, String link) {
        String name = user.displayName == null || user.displayName.isBlank() ? "" : " " + user.displayName;
        return "Olá" + name + ",\n\n"
                + "Há uma nova atividade no portal do cliente da Union Solutions:\n\n"
                + "  " + title + "\n\n"
                + "Veja os detalhes no portal:\n" + publicUrl.replaceAll("/+$", "") + (link == null ? "/" : link) + "\n\n"
                + "Para deixar de receber estes avisos por e-mail, desative a opção em Notificações, no portal.\n";
    }

    /** Enfileira um e-mail avulso (por exemplo, convite). Gravado na transação do chamador. */
    @Transactional(Transactional.TxType.MANDATORY)
    public UUID enqueue(AppUser user, String subject, String body) {
        EmailOutbox e = new EmailOutbox();
        e.id = UUID.randomUUID();
        e.userId = user == null ? null : user.id;
        e.recipient = user == null ? null : user.email;
        e.subject = subject;
        e.body = body;
        e.status = EmailOutbox.PENDING;
        e.createdAt = Instant.now();
        e.nextAttemptAt = e.createdAt;
        e.persist();
        return e.id;
    }

    @Transactional(Transactional.TxType.MANDATORY)
    public UUID enqueueTo(String recipient, String subject, String body) {
        EmailOutbox e = new EmailOutbox();
        e.id = UUID.randomUUID();
        e.recipient = recipient;
        e.subject = subject;
        e.body = body;
        e.status = EmailOutbox.PENDING;
        e.createdAt = Instant.now();
        e.nextAttemptAt = e.createdAt;
        e.persist();
        return e.id;
    }

    // ---------- Envio ----------

    /** Processa a fila: reserva um lote, envia fora de transação e grava o desfecho de cada item. Repetível e seguro com várias instâncias. */
    public int dispatch() {
        NotificationService me = self.get();
        int sent = 0;
        // Esvazia a fila em lotes, com um teto por execução para a tarefa não ficar presa.
        for (int batch = 0; batch < 50; batch++) {
            List<UUID> ids = me.claim();
            if (ids.isEmpty()) break;
            for (UUID id : ids) {
                EmailOutbox item = me.load(id);
                if (item == null) continue;
                try {
                    mail.send(item.recipient, item.subject, item.body);
                    me.markSent(id);
                    sent++;
                } catch (RuntimeException e) {
                    LOG.warnf("E-mail não enviado (%s), nova tentativa adiante", e.getClass().getSimpleName());
                    me.markFailure(id, e.getClass().getSimpleName() + ": " + e.getMessage());
                }
            }
        }
        return sent;
    }

    @Transactional
    public List<UUID> claim() {
        @SuppressWarnings("unchecked")
        List<UUID> ids = em.createNativeQuery("""
                UPDATE email_outbox SET claimed_until = :until
                WHERE id IN (
                  SELECT id FROM email_outbox
                  WHERE status = 'PENDING' AND next_attempt_at <= :now AND (claimed_until IS NULL OR claimed_until < :now)
                  ORDER BY next_attempt_at LIMIT :limit FOR UPDATE SKIP LOCKED)
                RETURNING id""", UUID.class)
                .setParameter("until", Instant.now().plusSeconds(120))
                .setParameter("now", Instant.now())
                .setParameter("limit", batchSize)
                .getResultList();
        return ids;
    }

    @Transactional
    public EmailOutbox load(UUID id) {
        EmailOutbox e = EmailOutbox.findById(id);
        if (e != null) em.detach(e);
        return e;
    }

    @Transactional
    public void markSent(UUID id) {
        EmailOutbox e = EmailOutbox.findById(id);
        if (e == null) return;
        e.status = EmailOutbox.SENT;
        e.sentAt = Instant.now();
        e.attempts += 1;
        e.claimedUntil = null;
        e.body = null;
        e.lastError = null;
    }

    @Transactional
    public void markFailure(UUID id, String error) {
        EmailOutbox e = EmailOutbox.findById(id);
        if (e == null) return;
        e.attempts += 1;
        e.lastError = error.length() > 300 ? error.substring(0, 300) : error;
        e.claimedUntil = null;
        if (e.attempts >= MAX_ATTEMPTS) {
            e.status = EmailOutbox.FAILED;
            e.body = null;
            audit.record((UUID) null, "EMAIL_FAILED", "email", e.id, null, null, e.subject, false);
        } else {
            long waitSeconds = Math.min(3600L, 30L << Math.min(e.attempts - 1, 7));
            e.nextAttemptAt = Instant.now().plusSeconds(waitSeconds);
        }
    }

    // ---------- Consulta e preferências ----------

    @Transactional
    public Page<NotificationView> list(Actor actor, boolean onlyUnread, int page, int size) {
        Listing<Notification> listing = new Listing<>(Notification.class, "n").where("n.userId = :me", "me", actor.id()).orderBy("n.createdAt desc");
        if (onlyUnread) listing.where("n.readAt is null");
        return listing.page(page, size, NotificationService::view);
    }

    @Transactional
    public long unread(Actor actor) {
        return Notification.count("userId = ?1 and readAt is null", actor.id());
    }

    @Transactional
    public int markRead(Actor actor, List<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return Notification.update("readAt = ?1 where userId = ?2 and readAt is null", Instant.now(), actor.id());
        }
        return Notification.update("readAt = ?1 where userId = ?2 and readAt is null and id in ?3", Instant.now(), actor.id(), ids);
    }

    @Transactional
    public PreferencesView setPreferences(Actor actor, PreferencesInput input) {
        AppUser user = AppUser.findById(actor.id());
        if (input.emailNotifications() != null && user.emailNotifications != input.emailNotifications()) {
            user.emailNotifications = input.emailNotifications();
            audit.record(actor, "PREFERENCES_CHANGED", "user", user.id, user.tenantId, null, "e-mails " + (user.emailNotifications ? "ligados" : "desligados"), false);
        }
        return new PreferencesView(user.emailNotifications);
    }

    @Transactional
    public boolean emailNotifications(Actor actor) {
        AppUser user = AppUser.findById(actor.id());
        return user != null && user.emailNotifications;
    }

    static NotificationView view(Notification n) {
        return new NotificationView(n.id, n.kind, n.title, n.link, n.projectId, n.createdAt, n.readAt);
    }

    // ---------- Administração da fila ----------

    @Transactional
    public Page<OutboxView> outbox(Actor actor, String status, int page, int size) {
        policy.requireUnionAdmin(actor);
        Listing<EmailOutbox> listing = new Listing<>(EmailOutbox.class, "e").orderBy("e.createdAt desc");
        if (status != null && !status.isBlank()) listing.where("e.status = :status", "status", status);
        return listing.page(page, size, e -> new OutboxView(e.id, InvitationService.maskEmail(e.recipient), e.subject, e.status, e.attempts, e.createdAt, e.sentAt, e.nextAttemptAt, e.lastError));
    }

    @Transactional
    public long pendingCount() {
        return EmailOutbox.count("status", EmailOutbox.PENDING);
    }

    /** Recoloca um e-mail que desistiu na fila. Sem corpo, só o aviso genérico é reenviado. */
    @Transactional
    public OutboxView retry(Actor actor, UUID id) {
        policy.requireUnionAdmin(actor);
        EmailOutbox e = EmailOutbox.findById(id);
        if (e == null) throw ApiException.notFound();
        if (!EmailOutbox.FAILED.equals(e.status)) throw ApiException.conflict("NOT_FAILED", "Só e-mails que desistiram podem voltar à fila.");
        AppUser user = e.userId == null ? null : AppUser.findById(e.userId);
        e.body = user == null ? "Há uma nova atividade no portal do cliente da Union Solutions. Acesse: " + publicUrl + "\n"
                : emailBody(user, e.subject.replaceFirst("^Portal Union Solutions: ", ""), "/notificacoes");
        e.status = EmailOutbox.PENDING;
        e.attempts = 0;
        e.nextAttemptAt = Instant.now();
        e.lastError = null;
        audit.record(actor, "EMAIL_RETRY_REQUESTED", "email", e.id, null, null, e.subject, false);
        return new OutboxView(e.id, InvitationService.maskEmail(e.recipient), e.subject, e.status, e.attempts, e.createdAt, e.sentAt, e.nextAttemptAt, e.lastError);
    }
}
