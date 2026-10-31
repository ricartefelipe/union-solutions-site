package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.domain.AppUser;
import br.com.unionsolutions.portal.domain.Types.UserStatus;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.Locale;
import org.eclipse.microprofile.jwt.JsonWebToken;

/**
 * Resolve a conta a cada requisição, consultando o banco. Por isso a desativação tem efeito imediato,
 * mesmo com um token ainda válido.
 */
@RequestScoped
public class CurrentActor {
    @Inject JsonWebToken token;
    @Inject EntityManager em;

    private Actor cached;

    public String subject() {
        String sub = token.getSubject();
        if (sub == null || sub.isBlank()) throw new ApiException(401, "UNAUTHENTICATED", "Autenticação necessária.");
        return sub;
    }

    public String verifiedEmail() {
        Object verified = token.getClaim("email_verified");
        String email = token.getClaim("email");
        if (email == null || !Boolean.parseBoolean(String.valueOf(verified))) return null;
        return email.toLowerCase(Locale.ROOT);
    }

    public String tokenName() {
        return token.getClaim("name");
    }

    @Transactional
    public Actor require() {
        if (cached != null) return cached;
        String sub = subject();
        AppUser user = AppUser.find("keycloakSub", sub).firstResult();
        if (user == null) user = bindPreprovisioned(sub);
        if (user == null || user.status != UserStatus.ACTIVE) throw ApiException.noAccess();
        if (user.displayName == null && tokenName() != null) {
            // Atualização direta: requisições simultâneas não devem conflitar por causa do nome.
            em.createNativeQuery("UPDATE app_user SET display_name = :name WHERE id = :id AND display_name IS NULL")
                    .setParameter("name", tokenName()).setParameter("id", user.id).executeUpdate();
            em.refresh(user);
        }
        cached = new Actor(user.id, user.email, user.displayName, user.role, user.tenantId);
        return cached;
    }

    /**
     * O primeiro administrador é pré-cadastrado por e-mail e vinculado no primeiro login com e-mail verificado.
     * A atualização é atômica: a primeira tela faz requisições simultâneas, e só uma delas efetua o vínculo.
     */
    private AppUser bindPreprovisioned(String sub) {
        String email = verifiedEmail();
        if (email == null) return null;
        em.createNativeQuery("""
                UPDATE app_user SET keycloak_sub = :sub, display_name = COALESCE(display_name, :name), updated_at = :now
                WHERE email = :email AND keycloak_sub IS NULL""")
                .setParameter("sub", sub).setParameter("name", tokenName()).setParameter("now", Instant.now()).setParameter("email", email)
                .executeUpdate();
        return AppUser.find("keycloakSub", sub).firstResult();
    }
}
