package br.com.unionsolutions.portal.infrastructure.identity;

import br.com.unionsolutions.portal.application.Ports;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.arc.DefaultBean;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/** Usa a API administrativa do Keycloak com uma conta de serviço restrita a gerenciar usuários do realm. */
@DefaultBean
@ApplicationScoped
public class KeycloakIdentityProvider implements Ports.IdentityProvider {
    private static final String MFA_ROLE = "portal-mfa";
    private static final Logger LOG = Logger.getLogger(KeycloakIdentityProvider.class);

    @Inject ObjectMapper json;
    @ConfigProperty(name = "portal.identity.base-url") String baseUrl;
    @ConfigProperty(name = "portal.identity.realm") String realm;
    @ConfigProperty(name = "portal.identity.admin-client-id") String adminClient;
    @ConfigProperty(name = "portal.identity.admin-client-secret") Optional<String> adminSecret;
    @ConfigProperty(name = "portal.identity.web-client-id") String webClient;
    @ConfigProperty(name = "portal.identity.action-lifespan-seconds") int lifespan;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private String adminToken() {
        String form = "grant_type=client_credentials&client_id=" + encode(adminClient) + "&client_secret=" + encode(adminSecret.orElse(""));
        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/realms/" + realm + "/protocol/openid-connect/token"))
                .timeout(Duration.ofSeconds(10)).header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form)).build();
        return readJson(send(request, 200)).get("access_token").asText();
    }

    private HttpResponse<String> send(HttpRequest request, int... expected) {
        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            for (int status : expected) {
                if (response.statusCode() == status) return response;
            }
            throw new IllegalStateException("Resposta inesperada do provedor de identidade: " + response.statusCode());
        } catch (IOException e) {
            throw new IllegalStateException("Provedor de identidade indisponível", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Chamada interrompida", e);
        }
    }

    private JsonNode readJson(HttpResponse<String> response) {
        try {
            return json.readTree(response.body());
        } catch (IOException e) {
            throw new IllegalStateException("Resposta inválida do provedor de identidade", e);
        }
    }

    private HttpRequest.Builder admin(String token, String path) {
        return HttpRequest.newBuilder(URI.create(baseUrl + "/admin/realms/" + realm + path)).timeout(Duration.ofSeconds(10)).header("Authorization", "Bearer " + token);
    }

    private HttpRequest.BodyPublisher body(Object value) {
        try {
            return HttpRequest.BodyPublishers.ofString(json.writeValueAsString(value));
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private Optional<String> findByEmail(String token, String email) {
        JsonNode users = readJson(send(admin(token, "/users?exact=true&email=" + encode(email)).GET().build(), 200));
        return users.isArray() && !users.isEmpty() ? Optional.of(users.get(0).get("id").asText()) : Optional.empty();
    }

    private String create(String token, Map<String, Object> representation, String email) {
        HttpResponse<String> response = send(admin(token, "/users").header("Content-Type", "application/json").POST(body(representation)).build(), 201, 409);
        if (response.statusCode() == 201) {
            String location = response.headers().firstValue("Location").orElseThrow();
            return location.substring(location.lastIndexOf('/') + 1);
        }
        return findByEmail(token, email).orElseThrow(() -> new IllegalStateException("Conta não encontrada após conflito"));
    }

    /** O fluxo de login do provedor exige TOTP de quem tem este papel, e cobra a configuração se ainda não houver. */
    private void assignRole(String token, String userId, String role) {
        JsonNode representation = readJson(send(admin(token, "/roles/" + encode(role)).GET().build(), 200));
        send(admin(token, "/users/" + userId + "/role-mappings/realm").header("Content-Type", "application/json").POST(body(List.of(representation))).build(), 204);
    }

    @Override
    public void ensureUserAndSendSetup(String email, String redirectUri, boolean requireMfa) {
        String token = adminToken();
        String id = findByEmail(token, email).orElseGet(() -> create(token, Map.of("username", email, "email", email, "enabled", true, "emailVerified", false), email));
        if (requireMfa) assignRole(token, id, MFA_ROLE);
        String path = "/users/" + id + "/execute-actions-email?lifespan=" + lifespan + "&client_id=" + encode(webClient) + "&redirect_uri=" + encode(redirectUri);
        send(admin(token, path).header("Content-Type", "application/json").PUT(body(List.of("UPDATE_PASSWORD", "UPDATE_PROFILE", "VERIFY_EMAIL"))).build(), 200, 204);
    }

    @Override
    public boolean disable(String subject) {
        try {
            String token = adminToken();
            send(admin(token, "/users/" + subject).header("Content-Type", "application/json").PUT(body(Map.of("enabled", false))).build(), 204);
            send(admin(token, "/users/" + subject + "/logout").POST(HttpRequest.BodyPublishers.noBody()).build(), 204);
            return true;
        } catch (RuntimeException e) {
            LOG.warnf("Não foi possível desativar a conta no provedor: %s", e.getClass().getSimpleName());
            return false;
        }
    }

    @Override
    public boolean enable(String subject) {
        try {
            String token = adminToken();
            send(admin(token, "/users/" + subject).header("Content-Type", "application/json").PUT(body(Map.of("enabled", true))).build(), 204);
            return true;
        } catch (RuntimeException e) {
            LOG.warnf("Não foi possível reativar a conta no provedor: %s", e.getClass().getSimpleName());
            return false;
        }
    }

    @Override
    public String createDemoUser(String email, String name, String password) {
        String token = adminToken();
        int space = name.indexOf(' ');
        return create(token, Map.of("username", email, "email", email, "enabled", true, "emailVerified", true,
                "firstName", name.substring(0, space), "lastName", name.substring(space + 1),
                "credentials", List.of(Map.of("type", "password", "value", password, "temporary", false))), email);
    }
}
