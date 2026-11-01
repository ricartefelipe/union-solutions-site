package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.application.Dtos.*;
import br.com.unionsolutions.portal.domain.*;
import br.com.unionsolutions.portal.domain.Types.*;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

@ApplicationScoped
public class InvitationService {
    private static final Logger LOG = Logger.getLogger(InvitationService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    @Inject AccessPolicy policy;
    @Inject AuditService audit;
    @Inject NotificationService notifications;
    @Inject EntityManager em;
    @Inject Ports.IdentityProvider identity;
    @Inject RateLimiter limiter;
    @ConfigProperty(name = "portal.public-url") String publicUrl;
    @ConfigProperty(name = "portal.invitation.ttl") Duration ttl;

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    @Transactional
    public InvitationView create(Actor actor, InvitationInput input) {
        limiter.check("invite:" + actor.id(), 30, 3600);
        String email = input.email().trim().toLowerCase(Locale.ROOT);
        UUID tenantId = resolveTenant(actor, input);

        AppUser existing = AppUser.find("email", email).firstResult();
        if (existing != null && (tenantId == null ? existing.tenantId == null : tenantId.equals(existing.tenantId))) {
            throw ApiException.conflict("ALREADY_MEMBER", "Esta pessoa já tem acesso.");
        }

        // Um novo convite substitui o pendente para o mesmo e-mail e organização.
        Invitation.<Invitation>list("email = ?1 and acceptedAt is null and revokedAt is null", email).stream()
                .filter(i -> tenantId == null ? i.tenantId == null : tenantId.equals(i.tenantId))
                .forEach(i -> i.revokedAt = Instant.now());
        em.flush();

        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);

        Invitation invitation = new Invitation();
        invitation.id = UUID.randomUUID();
        invitation.tenantId = tenantId;
        invitation.email = email;
        invitation.role = input.role();
        invitation.tokenHash = hash(token);
        invitation.expiresAt = Instant.now().plus(ttl);
        invitation.invitedBy = actor.id();
        invitation.createdAt = Instant.now();
        invitation.persist();

        audit.record(actor, "INVITATION_CREATED", "invitation", invitation.id, tenantId, null, "Papel " + input.role(), false);
        sendEmail(email, token, tenantId);
        return view(invitation);
    }

    private UUID resolveTenant(Actor actor, InvitationInput input) {
        if (actor.isClientAdmin()) {
            // O tenant vem da identidade. Papel interno ou outra organização são recusados, nunca ajustados em silêncio.
            if (input.role().isUnion()) throw ApiException.forbidden();
            if (input.organizationId() != null && !input.organizationId().equals(actor.tenantId())) throw ApiException.forbidden();
            return actor.tenantId();
        }
        if (!actor.isUnionAdmin()) throw ApiException.forbidden();
        if (input.role().isUnion()) {
            if (input.organizationId() != null) throw ApiException.badRequest("INVALID_ROLE", "Papéis da Union não pertencem a uma organização.");
            return null;
        }
        if (input.organizationId() == null) throw ApiException.badRequest("ORGANIZATION_REQUIRED", "Informe a organização do convite.");
        Organization org = Organization.findById(input.organizationId());
        if (org == null || org.status != OrgStatus.ACTIVE) throw ApiException.notFound();
        return org.id;
    }

    private void sendEmail(String email, String token, UUID tenantId) {
        String link = publicUrl.replaceAll("/+$", "") + "/convite#t=" + token;
        String org = tenantId == null ? "Union Solutions" : Names.organization(tenantId);
        String text = "Você recebeu um convite para o portal do cliente da Union Solutions (" + org + ").\n\n"
                + "Para aceitar, acesse:\n" + link + "\n\n"
                + "O link é pessoal, vale até " + ttl.toDays() + " dia(s) e só pode ser usado uma vez.\n"
                + "Se você não esperava este convite, ignore esta mensagem.\n";
        // Fila durável: gravado na transação do convite e enviado pela tarefa, com novas tentativas. O corpo (que leva o link) some depois do envio.
        notifications.enqueueTo(email, "Convite para o portal da Union Solutions", text);
    }

    @Transactional
    public InvitationPreview inspect(String token, String clientIp) {
        limiter.check("invite-public:" + clientIp, 30, 600);
        Invitation invitation = requirePending(token);
        String org = invitation.tenantId == null ? "Union Solutions" : Names.organization(invitation.tenantId);
        return new InvitationPreview(org, invitation.role, maskEmail(invitation.email), invitation.expiresAt);
    }

    /** Pede ao provedor de identidade o e-mail de definição de senha. A resposta é igual exista a conta ou não. */
    @Transactional
    public void setupAccess(String token, String clientIp) {
        limiter.check("invite-setup:" + clientIp, 10, 600);
        Invitation invitation = requirePending(token);
        limiter.check("invite-setup-token:" + invitation.id, 3, 3600);
        try {
            identity.ensureUserAndSendSetup(invitation.email, publicUrl.replaceAll("/+$", "") + "/convite/continuar", invitation.role.isUnion());
        } catch (RuntimeException e) {
            LOG.errorf("Falha ao solicitar definição de senha: %s", e.getClass().getSimpleName());
            throw new ApiException(502, "IDENTITY_FAILED", "Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.");
        }
    }

    private Invitation requirePending(String token) {
        Invitation invitation = Invitation.find("tokenHash", hash(token)).firstResult();
        if (invitation == null || invitation.acceptedAt != null || invitation.revokedAt != null || invitation.expiresAt.isBefore(Instant.now())) {
            throw ApiException.invalidInvitation();
        }
        return invitation;
    }

    /** Vincula a identidade autenticada ao convite. Destinatário, organização e papel vêm do convite, nunca do navegador. */
    @Transactional
    public void accept(String token, String subject, String verifiedEmail, String name) {
        limiter.check("invite-accept:" + subject, 20, 600);
        Invitation invitation = requirePending(token);
        if (verifiedEmail == null || !verifiedEmail.equals(invitation.email)) {
            audit.recordIndependent(null, "INVITATION_RECIPIENT_MISMATCH", "invitation", invitation.id, invitation.tenantId, null);
            throw new ApiException(403, "INVITATION_WRONG_ACCOUNT", "Este convite não pode ser aceito por esta conta.");
        }

        // Concorrência: só uma chamada consegue consumir o convite.
        int consumed = em.createNativeQuery("""
                UPDATE invitation SET accepted_at = :now
                WHERE id = :id AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > :now""")
                .setParameter("now", Instant.now()).setParameter("id", invitation.id).executeUpdate();
        if (consumed != 1) throw ApiException.invalidInvitation();

        AppUser user = AppUser.find("keycloakSub = ?1 or email = ?2", subject, verifiedEmail).firstResult();
        if (user != null) {
            boolean sameTenant = invitation.tenantId == null ? user.tenantId == null : invitation.tenantId.equals(user.tenantId);
            if (!sameTenant || user.status != UserStatus.ACTIVE || (user.keycloakSub != null && !user.keycloakSub.equals(subject))) {
                throw new ApiException(403, "INVITATION_WRONG_ACCOUNT", "Este convite não pode ser aceito por esta conta.");
            }
            user.keycloakSub = subject;
            user.role = invitation.role;
            user.updatedAt = Instant.now();
        } else {
            user = new AppUser();
            user.id = UUID.randomUUID();
            user.keycloakSub = subject;
            user.email = verifiedEmail;
            user.displayName = name;
            user.role = invitation.role;
            user.tenantId = invitation.tenantId;
            user.status = UserStatus.ACTIVE;
            user.createdAt = Instant.now();
            user.updatedAt = user.createdAt;
            user.persist();
        }
        em.flush();
        em.createNativeQuery("UPDATE invitation SET accepted_user_id = :user WHERE id = :id")
                .setParameter("user", user.id).setParameter("id", invitation.id).executeUpdate();
        audit.record(user.id, "INVITATION_ACCEPTED", "invitation", invitation.id, invitation.tenantId, null, "Papel " + invitation.role, false);
    }

    @Transactional
    public void revoke(Actor actor, UUID id) {
        Invitation invitation = Invitation.findById(id);
        if (invitation == null || !canManage(actor, invitation)) throw ApiException.notFound();
        if (invitation.acceptedAt != null) throw ApiException.conflict("INVITATION_ALREADY_ACCEPTED", "Este convite já foi aceito.");
        if (invitation.revokedAt == null) {
            invitation.revokedAt = Instant.now();
            audit.record(actor, "INVITATION_REVOKED", "invitation", invitation.id, invitation.tenantId, null, null, false);
        }
    }

    private boolean canManage(Actor actor, Invitation invitation) {
        if (actor.isUnionAdmin()) return true;
        return actor.isClientAdmin() && actor.tenantId().equals(invitation.tenantId);
    }

    @Transactional
    public Page<InvitationView> list(Actor actor, UUID organizationId, int page, int size) {
        Listing<Invitation> listing = new Listing<>(Invitation.class, "i").orderBy("i.createdAt desc");
        if (actor.isClientAdmin()) {
            listing.where("i.tenantId = :tenant", "tenant", actor.tenantId());
        } else {
            policy.requireUnionAdmin(actor);
            if (organizationId != null) listing.where("i.tenantId = :tenant", "tenant", organizationId);
        }
        return listing.page(page, size, this::view);
    }

    private InvitationView view(Invitation i) {
        String state = i.acceptedAt != null ? "ACCEPTED" : i.revokedAt != null ? "REVOKED" : i.expiresAt.isBefore(Instant.now()) ? "EXPIRED" : "PENDING";
        return new InvitationView(i.id, i.email, i.role, i.tenantId, Names.organization(i.tenantId), state, i.expiresAt, i.createdAt);
    }

    static String maskEmail(String email) {
        int at = email.indexOf('@');
        if (at <= 1) return "***" + email.substring(Math.max(at, 0));
        return email.charAt(0) + "***" + email.substring(at);
    }
}
