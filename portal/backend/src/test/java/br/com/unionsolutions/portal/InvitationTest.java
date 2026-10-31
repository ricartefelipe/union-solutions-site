package br.com.unionsolutions.portal;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

import br.com.unionsolutions.portal.domain.AppUser;
import br.com.unionsolutions.portal.domain.Types.Role;
import io.quarkus.mailer.Mail;
import io.quarkus.mailer.MockMailbox;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.oidc.server.OidcWiremockTestResource;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

@QuarkusTest
@QuarkusTestResource(OidcWiremockTestResource.class)
class InvitationTest extends ApiTestBase {
    @Inject MockMailbox mailbox;

    @BeforeEach
    void clearMail() {
        mailbox.clear();
    }

    private String email() {
        return "convidado-" + UUID.randomUUID() + "@teste.invalid";
    }

    private String invite(AppUser by, String email, String role, UUID org) {
        var body = new java.util.HashMap<String, Object>(Map.of("email", email, "role", role));
        if (org != null) body.put("organizationId", org);
        json(by).body(body).post("/v1/invitations").then().statusCode(200);
        List<Mail> mails = mailbox.getMailsSentTo(email);
        assertEquals(1, mails.size(), "convite enviado por e-mail");
        Matcher m = Pattern.compile("#t=([A-Za-z0-9_-]+)").matcher(mails.get(0).getText());
        assertTrue(m.find(), "o link do convite traz o token no fragmento");
        return m.group(1);
    }

    private io.restassured.response.Response accept(String token, String subject, String email, boolean verified) {
        return given().header("Authorization", "Bearer " + TestSupport.token(subject, email, verified)).contentType(ContentType.JSON)
                .body(Map.of("token", token)).post("/v1/invitations/accept");
    }

    @Test
    void jornadaCompletaDoConvite() {
        String email = email();
        String token = invite(adminA, email, "CLIENT_MEMBER", null);
        given().contentType(ContentType.JSON).body(Map.of("token", token)).post("/v1/public/invitations/inspect").then().statusCode(200)
                .body("organizationName", equalTo(clientA.name)).body("emailHint", startsWith("c***@"));

        given().contentType(ContentType.JSON).body(Map.of("token", token)).post("/v1/public/invitations/setup-access").then().statusCode(204);
        assertTrue(identity.setupEmails.contains(email));

        String subject = UUID.randomUUID().toString();
        // Antes de aceitar, a conta não tem acesso.
        given().header("Authorization", "Bearer " + TestSupport.token(subject, email, true)).get("/v1/me").then().statusCode(403);
        accept(token, subject, email, true).then().statusCode(204);
        given().header("Authorization", "Bearer " + TestSupport.token(subject, email, true)).get("/v1/me").then().statusCode(200)
                .body("role", equalTo("CLIENT_MEMBER")).body("organization.id", equalTo(clientA.id.toString()));
    }

    @Test
    void convitesNaoAceitamOrganizacaoOuPapelVindosDoNavegador() {
        String email = email();
        String token = invite(adminA, email, "CLIENT_MEMBER", null);
        given().header("Authorization", "Bearer " + TestSupport.token(UUID.randomUUID().toString(), email, true)).contentType(ContentType.JSON)
                .body(Map.of("token", token, "role", "UNION_ADMIN", "organizationId", clientB.id)).post("/v1/invitations/accept").then().statusCode(400);
    }

    @Test
    void conviteExpiradoERejeitado() {
        String email = email();
        String token = invite(adminA, email, "CLIENT_MEMBER", null);
        fx.expireInvitations(email);
        accept(token, UUID.randomUUID().toString(), email, true).then().statusCode(404).body("code", equalTo("INVITATION_INVALID"));
        given().contentType(ContentType.JSON).body(Map.of("token", token)).post("/v1/public/invitations/inspect").then().statusCode(404);
        given().contentType(ContentType.JSON).body(Map.of("token", token)).post("/v1/public/invitations/setup-access").then().statusCode(404);
    }

    @Test
    void conviteReutilizadoERejeitado() {
        String email = email();
        String token = invite(adminA, email, "CLIENT_MEMBER", null);
        String subject = UUID.randomUUID().toString();
        accept(token, subject, email, true).then().statusCode(204);
        accept(token, subject, email, true).then().statusCode(404).body("code", equalTo("INVITATION_INVALID"));
        accept(token, UUID.randomUUID().toString(), email, true).then().statusCode(404);
    }

    @Test
    void aceitesSimultaneosConsomemOConviteUmaUnicaVez() throws Exception {
        String email = email();
        String token = invite(adminA, email, "CLIENT_MEMBER", null);
        var pool = java.util.concurrent.Executors.newFixedThreadPool(6);
        try {
            var calls = new java.util.ArrayList<java.util.concurrent.Callable<Integer>>();
            for (int i = 0; i < 6; i++) calls.add(() -> accept(token, UUID.randomUUID().toString(), email, true).statusCode());
            var statuses = new java.util.ArrayList<Integer>();
            for (var result : pool.invokeAll(calls)) statuses.add(result.get());
            assertEquals(1, statuses.stream().filter(s -> s == 204).count(), "resultados: " + statuses);
            assertTrue(statuses.stream().allMatch(s -> s < 500), "resultados: " + statuses);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void conviteDeOutroDestinatarioERejeitado() {
        String email = email();
        String token = invite(adminA, email, "CLIENT_MEMBER", null);
        accept(token, UUID.randomUUID().toString(), email(), true).then().statusCode(403).body("code", equalTo("INVITATION_WRONG_ACCOUNT"));
        // E-mail correto, mas não verificado pelo provedor.
        accept(token, UUID.randomUUID().toString(), email, false).then().statusCode(403);
        // A recusa não consome o convite.
        accept(token, UUID.randomUUID().toString(), email, true).then().statusCode(204);
    }

    @Test
    void contaDeOutroClienteNaoEPuxadaPorConvite() {
        String token = invite(adminA, adminB.email, "CLIENT_ADMIN", null);
        accept(token, adminB.keycloakSub, adminB.email, true).then().statusCode(403);
        as(adminB).get("/v1/me").then().body("organization.id", equalTo(clientB.id.toString()));
    }

    @Test
    void conviteRevogadoERejeitadoENovoConviteSubstituiOAnterior() {
        String email = email();
        String first = invite(adminA, email, "CLIENT_MEMBER", null);
        mailbox.clear();
        String second = invite(adminA, email, "CLIENT_MEMBER", null);
        accept(first, UUID.randomUUID().toString(), email, true).then().statusCode(404);

        UUID id = UUID.fromString(as(adminA).get("/v1/invitations").then().extract().path("items.find { it.email == '" + email + "' && it.state == 'PENDING' }.id"));
        as(adminB).delete("/v1/invitations/" + id).then().statusCode(404);
        as(adminA).delete("/v1/invitations/" + id).then().statusCode(204);
        accept(second, UUID.randomUUID().toString(), email, true).then().statusCode(404);
    }

    @Test
    void administradorDaUnionConvidaEquipeSemOrganizacaoEClienteComOrganizacao() {
        String staffEmail = email();
        String token = invite(unionAdmin, staffEmail, "UNION_STAFF", null);
        String subject = UUID.randomUUID().toString();
        accept(token, subject, staffEmail, true).then().statusCode(204);
        given().header("Authorization", "Bearer " + TestSupport.token(subject, staffEmail, true)).get("/v1/me").then().body("role", equalTo("UNION_STAFF")).body("organization", nullValue());

        json(unionAdmin).body(Map.of("email", email(), "role", "CLIENT_MEMBER")).post("/v1/invitations").then().statusCode(400);
        json(unionAdmin).body(Map.of("email", email(), "role", "UNION_STAFF", "organizationId", clientA.id)).post("/v1/invitations").then().statusCode(400);
        json(staff).body(Map.of("email", email(), "role", "CLIENT_MEMBER", "organizationId", clientA.id)).post("/v1/invitations").then().statusCode(403);
    }

    @Test
    void tentativasPublicasTemLimiteDeTaxa() {
        String ip = "ip-" + UUID.randomUUID();
        int last = 0;
        for (int i = 0; i < 32; i++) {
            last = given().header("X-Portal-Client-Ip", ip).contentType(ContentType.JSON).body(Map.of("token", "token-inexistente-" + "x".repeat(20))).post("/v1/public/invitations/inspect").statusCode();
        }
        assertEquals(429, last);
    }

    @Test
    void auditoriaRegistraConviteSemGuardarToken() {
        String email = email();
        String token = invite(adminA, email, "CLIENT_MEMBER", null);
        String audit = as(unionAdmin).queryParam("action", "INVITATION_CREATED").queryParam("organizationId", clientA.id).get("/v1/audit").then().statusCode(200).extract().asString();
        assertFalse(audit.contains(token));
        assertTrue(audit.contains("INVITATION_CREATED"));
    }

    @Test
    void primeiroVinculoPorEmailVerificadoSoValeParaContaPreCadastrada() {
        AppUser pre = fx.user(Role.UNION_STAFF, null);
        given().header("Authorization", "Bearer " + TestSupport.token(UUID.randomUUID().toString(), pre.email, true)).get("/v1/me").then().statusCode(403);
    }
}
