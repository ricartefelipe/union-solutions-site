package br.com.unionsolutions.portal;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

import br.com.unionsolutions.portal.application.NotificationService;
import br.com.unionsolutions.portal.application.RetentionService;
import br.com.unionsolutions.portal.domain.AppUser;
import br.com.unionsolutions.portal.domain.EmailOutbox;
import br.com.unionsolutions.portal.domain.Types.Role;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Central de notificações, fila de e-mails durável e retenção. */
@QuarkusTest
class NotificationAndRetentionTest extends ApiTestBase {
    @Inject NotificationService notifications;
    @Inject RetentionService retention;
    @Inject TestSupport.FakeMailSender mailer;

    @BeforeEach
    void resetMail() {
        mailer.sent.clear();
        mailer.refuse = false;
        notifications.dispatch();
        mailer.sent.clear();
    }

    /** A liberação do documento já gera o próprio aviso; os testes medem a partir daqui. */
    private Doc readyDocument() {
        return cleanDocument(projectA, "PARTICIPANTS");
    }

    private UUID publishDelivery(Doc doc, String title) {
        return UUID.fromString(json(unionAdmin).body(Map.of("title", title, "description", "Primeira versão", "documentVersionIds", List.of(doc.versionId().toString())))
                .post("/v1/projects/" + projectA + "/deliveries").then().statusCode(200).extract().path("id"));
    }

    private UUID publishDelivery(String title) {
        return publishDelivery(readyDocument(), title);
    }

    private int unread(AppUser user) {
        return as(user).get("/v1/notifications/unread-count").then().statusCode(200).extract().path("unread");
    }

    @Test
    void entregaPublicadaAvisaOClienteENaoAEquipeNemOutroCliente() {
        fx.member(clientA.id, projectA, memberA.id, false);
        Doc doc = readyDocument();
        int adminBefore = unread(adminA);
        int memberBefore = unread(memberA);
        UUID delivery = publishDelivery(doc, "Especificação");
        assertEquals(adminBefore + 1, unread(adminA), "administração do cliente avisada");
        assertEquals(memberBefore + 1, unread(memberA), "participante avisado");
        assertEquals(0, unread(adminB), "outro cliente não recebe nada");
        as(unionAdmin).get("/v1/notifications").then().statusCode(200).body("items.findAll { it.kind == 'DELIVERY_PUBLISHED' && it.title.contains('Especificação') }", hasSize(0));
        as(adminA).get("/v1/notifications?unread=true").then().statusCode(200)
                .body("items[0].kind", equalTo("DELIVERY_PUBLISHED"))
                .body("items[0].title", equalTo("Nova entrega: Especificação"))
                .body("items[0].link", equalTo("/entregas/" + delivery))
                .body("items[0].readAt", nullValue());
        // Marca como lida: some do contador.
        json(adminA).body(Map.of("ids", List.of())).post("/v1/notifications/read").then().statusCode(200).body("unread", equalTo(0));
        assertEquals(0, unread(adminA));
        // E-mail enfileirado e enviado pela tarefa, sem conteúdo da entrega.
        notifications.dispatch();
        List<TestSupport.FakeMailSender.Sent> mails = mailer.to(adminA.email).stream().filter(m -> m.subject().contains("Nova entrega")).toList();
        assertEquals(1, mails.size(), "um e-mail por aviso");
        assertTrue(mails.get(0).subject().contains("Nova entrega: Especificação"));
        assertFalse(mails.get(0).text().contains("Primeira versão"), "descrição da entrega não vai no e-mail");
        assertTrue(mails.get(0).text().contains("/entregas/" + delivery));
    }

    @Test
    void decisaoDoClienteAvisaAEquipeDoProjeto() {
        fx.member(clientA.id, projectA, staff.id, false);
        UUID delivery = publishDelivery("Protótipo");
        String versionId = as(unionAdmin).get("/v1/deliveries/" + delivery).then().extract().path("versions[0].id");
        as(unionAdmin).post("/v1/deliveries/versions/" + versionId + "/request-approval").then().statusCode(200);
        int staffBefore = unread(staff);
        int adminBefore = unread(unionAdmin);
        json(adminA).body(Map.of("decision", "APPROVED")).post("/v1/deliveries/versions/" + versionId + "/decision").then().statusCode(200);
        assertEquals(staffBefore + 1, unread(staff), "participante da Union avisado");
        assertEquals(adminBefore + 1, unread(unionAdmin), "administração da Union avisada");
        as(staff).get("/v1/notifications?unread=true").then().body("items[0].kind", equalTo("DELIVERY_APPROVED"));
    }

    @Test
    void notaInternaNaoGeraAvisoAoClienteEComentarioVisivelGera() {
        UUID ticket = ticket(adminA);
        int before = unread(adminA);
        json(unionAdmin).body(Map.of("body", "NOTA-SECRETA", "internal", true)).post("/v1/tickets/" + ticket + "/comments").then().statusCode(200);
        assertEquals(before, unread(adminA), "nota interna não avisa o cliente");
        notifications.dispatch();
        assertTrue(mailer.to(adminA.email).stream().noneMatch(m -> m.text().contains("NOTA-SECRETA") || m.subject().contains("NOTA")));
        json(unionAdmin).body(Map.of("body", "Resposta visível", "internal", false)).post("/v1/tickets/" + ticket + "/comments").then().statusCode(200);
        assertEquals(before + 1, unread(adminA));
        as(adminA).get("/v1/notifications?unread=true").then().body("items[0].kind", equalTo("TICKET_COMMENTED"));
        notifications.dispatch();
        assertTrue(mailer.to(adminA.email).stream().noneMatch(m -> m.text().contains("Resposta visível")), "conteúdo do comentário não vai no e-mail");
        assertTrue(mailer.to(adminA.email).stream().anyMatch(m -> m.subject().contains("Nova resposta em")));
    }

    @Test
    void solicitacaoAbertaPeloClienteAvisaAUnion() {
        int before = unread(unionAdmin);
        ticket(adminA);
        assertEquals(before + 1, unread(unionAdmin));
        as(unionAdmin).get("/v1/notifications?unread=true").then().body("items[0].kind", equalTo("TICKET_OPENED"));
    }

    @Test
    void preferenciaDesligaOEmailMasNaoOAviso() {
        json(adminA).body(Map.of("emailNotifications", false)).patch("/v1/me/preferences").then().statusCode(200).body("emailNotifications", equalTo(false));
        as(adminA).get("/v1/me/preferences").then().body("emailNotifications", equalTo(false));
        Doc doc = readyDocument();
        int before = unread(adminA);
        publishDelivery(doc, "Sem e-mail");
        assertEquals(before + 1, unread(adminA), "aviso no portal continua");
        notifications.dispatch();
        assertTrue(mailer.to(adminA.email).stream().noneMatch(m -> m.subject().contains("Sem e-mail")));
        json(adminA).body(Map.of("emailNotifications", true)).patch("/v1/me/preferences").then().statusCode(200);
    }

    @Test
    void filaDeEmailTentaDeNovoDepoisDeFalhaEDesisteComRegistro() {
        mailer.refuse = true;
        publishDelivery("Com falha");
        notifications.dispatch();
        List<Map<String, Object>> pending = as(unionAdmin).get("/v1/admin/emails?status=PENDING").then().statusCode(200).extract().path("items");
        Map<String, Object> item = pending.stream().filter(i -> String.valueOf(i.get("subject")).contains("Com falha") && String.valueOf(i.get("recipient")).startsWith(adminA.email.substring(0, 1)))
                .findFirst().orElseThrow();
        assertEquals(1, item.get("attempts"));
        assertNotNull(item.get("lastError"));
        assertNull(item.get("sentAt"));
        // Ainda em espera: nova passagem não reenvia antes da hora.
        mailer.refuse = false;
        notifications.dispatch();
        assertTrue(mailer.to(adminA.email).stream().noneMatch(m -> m.subject().contains("Com falha")), "respeita a espera crescente");
        // Adianta a próxima tentativa e envia.
        fx.outboxDue(UUID.fromString(String.valueOf(item.get("id"))));
        notifications.dispatch();
        assertTrue(mailer.to(adminA.email).stream().anyMatch(m -> m.subject().contains("Com falha")));
        as(unionAdmin).get("/v1/admin/emails?status=SENT").then().body("items.find { it.id == '" + item.get("id") + "' }.attempts", equalTo(2));
        assertNull(fx.outboxBody(UUID.fromString(String.valueOf(item.get("id")))), "corpo apagado depois do envio");

        // Desistência: depois do limite de tentativas, fica como FAILED e pode voltar à fila pela administração.
        mailer.refuse = true;
        publishDelivery("Desistida");
        UUID failedId = null;
        for (int i = 0; i < 12; i++) {
            notifications.dispatch();
            List<Map<String, Object>> items = as(unionAdmin).get("/v1/admin/emails").then().extract().path("items.findAll { it.subject.contains('Desistida') }");
            failedId = UUID.fromString(String.valueOf(items.get(0).get("id")));
            fx.outboxDue(failedId);
        }
        as(unionAdmin).get("/v1/admin/emails?status=FAILED").then().body("items.find { it.id == '" + failedId + "' }.attempts", equalTo(12));
        assertTrue(fx.auditCount("EMAIL_FAILED", failedId) >= 1);
        mailer.refuse = false;
        as(unionAdmin).post("/v1/admin/emails/" + failedId + "/retry").then().statusCode(200).body("status", equalTo("PENDING"));
        as(adminA).post("/v1/admin/emails/" + failedId + "/retry").then().statusCode(403);
        notifications.dispatch();
        as(unionAdmin).get("/v1/admin/emails?status=SENT").then().body("items.find { it.id == '" + failedId + "' }.status", equalTo("SENT"));
    }

    @Test
    void conviteSaiPelaFilaEOCorpoComOLinkSomeDepoisDoEnvio() {
        String email = "convidado-" + UUID.randomUUID() + "@portal.invalid";
        json(adminA).body(Map.of("email", email, "role", "CLIENT_MEMBER")).post("/v1/invitations").then().statusCode(200);
        assertTrue(mailer.to(email).isEmpty(), "nada sai antes da tarefa");
        notifications.dispatch();
        assertEquals(1, mailer.to(email).size());
        assertTrue(mailer.to(email).get(0).text().contains("/convite#t="));
        UUID id = fx.outboxIdFor(email);
        assertNull(fx.outboxBody(id), "o link não fica guardado depois do envio");
    }

    @Test
    void claimConcorrenteNaoEnviaDuasVezes() throws Exception {
        publishDelivery("Único");
        var pool = java.util.concurrent.Executors.newFixedThreadPool(4);
        try {
            var latch = new java.util.concurrent.CountDownLatch(1);
            var futures = new java.util.ArrayList<java.util.concurrent.Future<Integer>>();
            for (int i = 0; i < 4; i++) futures.add(pool.submit(() -> { latch.await(); return notifications.dispatch(); }));
            latch.countDown();
            int total = 0;
            for (var f : futures) total += f.get();
            assertEquals(mailer.sent.size(), total);
            assertEquals(1, mailer.to(adminA.email).stream().filter(m -> m.subject().contains("Único")).count(), "cada e-mail sai uma vez");
        } finally {
            pool.shutdownNow();
        }
    }

    // ---------- Retenção ----------

    @Test
    void retencaoDesligadaSimulaMasNaoExecuta() {
        as(adminA).get("/v1/admin/retention/simulation").then().statusCode(403);
        as(unionAdmin).get("/v1/admin/retention/simulation").then().statusCode(200)
                .body("enabled", equalTo(false))
                .body("categories.size()", equalTo(7))
                .body("categories.find { it.category == 'notificacoes-lidas' }.days", equalTo(30))
                .body("categories.find { it.category == 'auditoria' }.days", equalTo(0));
        // A consulta não registra nada; o registro é explícito.
        long before = fx.auditCountByAction("RETENTION_SIMULATED");
        as(unionAdmin).get("/v1/admin/retention/simulation").then().statusCode(200);
        assertEquals(before, fx.auditCountByAction("RETENTION_SIMULATED"));
        as(adminA).post("/v1/admin/retention/simulate").then().statusCode(403);
        as(unionAdmin).post("/v1/admin/retention/simulate").then().statusCode(200).body("enabled", equalTo(false));
        as(unionAdmin).post("/v1/admin/retention/execute").then().statusCode(409).body("code", equalTo("RETENTION_DISABLED"));
        as(unionAdmin).get("/v1/admin/retention/runs").then().statusCode(200).body("[0].mode", equalTo("SIMULATION"));
        assertEquals(before + 1, fx.auditCountByAction("RETENTION_SIMULATED"));
    }

    @Test
    void simulacaoContaSoOQueEstaAlemDoPrazoEExecucaoRemoveComOsObjetos() {
        // Notificação lida há 40 dias conta no prazo de 30; uma lida hoje não.
        publishDelivery("Antiga");
        json(adminA).body(Map.of("ids", List.of())).post("/v1/notifications/read").then().statusCode(200);
        fx.ageNotifications(adminA.id, 40);
        publishDelivery("Recente");
        json(memberA).body(Map.of("ids", List.of())).post("/v1/notifications/read");
        long matching = ((Number) as(unionAdmin).get("/v1/admin/retention/simulation").then().extract().path("categories.find { it.category == 'notificacoes-lidas' }.matching")).longValue();
        assertTrue(matching >= 1);

        // Solicitação encerrada com anexo: a execução remove registro e objeto.
        UUID ticket = ticket(adminA);
        as(adminA).multiPart("file", "anexo.pdf", "%PDF-1.7 anexo".getBytes()).post("/v1/tickets/" + ticket + "/attachments").then().statusCode(200);
        String key = fx.attachmentKeys(ticket).get(0);
        assertTrue(storage.objects.containsKey(key));
        fx.closeTicket(ticket, 100);
        long tickets = ((Number) as(unionAdmin).get("/v1/admin/retention/simulation").then().extract().path("categories.find { it.category == 'solicitacoes-encerradas' }.matching")).longValue();
        assertTrue(tickets >= 1);
        // Executa diretamente a rotina (a configuração de teste mantém a retenção desligada para a API).
        int removed = retention.purgeTicket(ticket) + retention.purgeNotifications(java.time.Instant.now().minus(java.time.Duration.ofDays(30)));
        assertTrue(removed >= 3, "anexo, comentários/avisos e solicitação");
        assertFalse(storage.objects.containsKey(key), "objeto do anexo apagado");
        as(adminA).get("/v1/tickets/" + ticket).then().statusCode(404);
        // Repetir não tem efeito.
        assertEquals(0, retention.purgeTicket(ticket));
    }
}
