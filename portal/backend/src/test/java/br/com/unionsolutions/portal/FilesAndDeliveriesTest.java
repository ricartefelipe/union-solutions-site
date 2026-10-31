package br.com.unionsolutions.portal;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

import br.com.unionsolutions.portal.domain.Types.ScanStatus;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.oidc.server.OidcWiremockTestResource;
import io.restassured.response.Response;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;

@QuarkusTest
@QuarkusTestResource(OidcWiremockTestResource.class)
class FilesAndDeliveriesTest extends ApiTestBase {

    private String downloadPath(Doc doc) {
        return "/v1/documents/" + doc.id() + "/versions/" + doc.versionId() + "/download";
    }

    // ---------- Arquivos ----------

    @Test
    void arquivoPendenteRejeitadoOuSemVerificacaoNaoEDisponibilizado() {
        Doc pending = doc(uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "a.pdf", "%PDF-1.7 limpo"));
        assertEquals(ScanStatus.PENDING, fx.scanStatus(pending.fileId()));
        as(adminA).get(downloadPath(pending)).then().statusCode(409).body("code", equalTo("FILE_NOT_AVAILABLE"));
        as(unionAdmin).get(downloadPath(pending)).then().statusCode(409);

        files.scanOne(pending.fileId());
        assertEquals(ScanStatus.CLEAN, fx.scanStatus(pending.fileId()));
        byte[] bytes = as(adminA).get(downloadPath(pending)).then().statusCode(200)
                .header("Content-Disposition", startsWith("attachment"))
                .header("X-Content-Type-Options", equalTo("nosniff"))
                .header("Cache-Control", containsString("no-store"))
                .extract().asByteArray();
        assertEquals("%PDF-1.7 limpo", new String(bytes));

        Doc infected = doc(uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "b.pdf", "%PDF-1.7 MARCA-MALWARE"));
        files.scanOne(infected.fileId());
        assertEquals(ScanStatus.REJECTED, fx.scanStatus(infected.fileId()));
        as(adminA).get(downloadPath(infected)).then().statusCode(409);
        assertTrue(storage.objects.keySet().stream().noneMatch(k -> k.endsWith(infected.fileId().toString())), "objeto bloqueado é apagado");
    }

    @Test
    void falhaDoScannerNaoLiberaOArquivo() {
        Doc doc = doc(uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "c.pdf", "%PDF-1.7 limpo"));
        scanner.unavailable = true;
        files.scanOne(doc.fileId());
        assertEquals(ScanStatus.PENDING, fx.scanStatus(doc.fileId()));
        assertEquals(1, fx.scanAttempts(doc.fileId()));
        as(adminA).get(downloadPath(doc)).then().statusCode(409);

        fx.setDocumentStatus(doc.fileId(), ScanStatus.FAILED);
        as(adminA).get(downloadPath(doc)).then().statusCode(409);
        as(adminA).post("/v1/files/" + doc.fileId() + "/rescan").then().statusCode(403);
        as(unionAdmin).post("/v1/files/" + doc.fileId() + "/rescan").then().statusCode(204);
        scanner.unavailable = false;
        files.scanOne(doc.fileId());
        as(adminA).get(downloadPath(doc)).then().statusCode(200);
    }

    @Test
    void reprocessarArquivoJaLiberadoNaoDeixaOArquivoPreso() {
        Doc doc = cleanDocument(projectA, "PARTICIPANTS");
        assertTrue(storage.objects.keySet().stream().noneMatch(k -> k.startsWith("quarantine/") && k.endsWith(doc.fileId().toString())), "a origem some depois de liberar");
        fx.setDocumentStatus(doc.fileId(), ScanStatus.FAILED);
        as(unionAdmin).post("/v1/files/" + doc.fileId() + "/rescan").then().statusCode(204);
        files.scanOne(doc.fileId());
        assertEquals(ScanStatus.CLEAN, fx.scanStatus(doc.fileId()));
        as(adminA).get(downloadPath(doc)).then().statusCode(200);
    }

    @Test
    void documentoPrivadoNaoTemCaminhoPublico() {
        Doc doc = cleanDocument(projectA, "PARTICIPANTS");
        given().get(downloadPath(doc)).then().statusCode(401);
        given().get("/v1/documents/" + doc.id()).then().statusCode(401);
        assertTrue(storage.objects.keySet().stream().allMatch(k -> k.startsWith("clean/") || k.startsWith("quarantine/")), "chaves internas geradas pelo servidor");
    }

    @Test
    void visibilidadeDoDocumentoERespeitadaNaApi() {
        fx.member(clientA.id, projectA, memberA.id, false);
        Doc internal = cleanDocument(projectA, "INTERNAL");
        Doc adminsOnly = cleanDocument(projectA, "CLIENT_ADMINS");
        Doc shared = cleanDocument(projectA, "PARTICIPANTS");

        as(adminA).get(downloadPath(internal)).then().statusCode(404);
        as(memberA).get(downloadPath(internal)).then().statusCode(404);
        as(memberA).get(downloadPath(adminsOnly)).then().statusCode(404);
        as(adminA).get(downloadPath(adminsOnly)).then().statusCode(200);
        as(memberA).get(downloadPath(shared)).then().statusCode(200);
        as(memberA).get("/v1/documents").then().body("items.id", not(hasItem(internal.id().toString()))).body("items.id", not(hasItem(adminsOnly.id().toString())));
        as(adminA).get("/v1/documents").then().body("items.id", not(hasItem(internal.id().toString())));
    }

    @Test
    void documentoSoApareceParaOClienteDepoisDeLiberado() {
        fx.member(clientA.id, projectA, memberA.id, false);
        String title = "Documento-" + UUID.randomUUID();
        Response created = as(unionAdmin).multiPart("file", "a.pdf", "%PDF-1.7 MARCA-MALWARE".getBytes()).multiPart("projectId", projectA.toString())
                .multiPart("title", title).multiPart("category", "DESIGN").multiPart("visibility", "PARTICIPANTS").post("/v1/documents");
        Doc infected = doc(created);

        // Pendente e bloqueado: a equipe acompanha, o cliente não vê nem na lista nem na atividade.
        as(adminA).queryParam("q", title).get("/v1/documents").then().body("total", equalTo(0));
        assertFalse(as(adminA).get("/v1/dashboard").then().extract().asString().contains(title));
        files.scanOne(infected.fileId());
        as(adminA).queryParam("q", title).get("/v1/documents").then().body("total", equalTo(0));
        assertFalse(as(adminA).get("/v1/dashboard").then().extract().asString().contains(title));
        as(unionAdmin).queryParam("q", title).get("/v1/documents").then().body("items[0].latest.file.scanStatus", equalTo("REJECTED"));

        // Liberado: aparece e vira atividade para quem participa do projeto.
        Response clean = as(unionAdmin).multiPart("file", "b.pdf", "%PDF-1.7 limpo".getBytes()).multiPart("projectId", projectA.toString())
                .multiPart("title", title + "-limpo").multiPart("category", "DESIGN").multiPart("visibility", "PARTICIPANTS").post("/v1/documents");
        Doc ok = doc(clean);
        files.scanOne(ok.fileId());
        as(memberA).queryParam("q", title + "-limpo").get("/v1/documents").then().body("total", equalTo(1));
        assertTrue(as(memberA).get("/v1/dashboard").then().extract().asString().contains(title + "-limpo"));

        // Documento restrito à administração não vira atividade visível a participantes.
        Response restricted = as(unionAdmin).multiPart("file", "c.pdf", "%PDF-1.7 limpo".getBytes()).multiPart("projectId", projectA.toString())
                .multiPart("title", title + "-restrito").multiPart("category", "CONTRACT").multiPart("visibility", "CLIENT_ADMINS").post("/v1/documents");
        files.scanOne(doc(restricted).fileId());
        assertFalse(as(memberA).get("/v1/dashboard").then().extract().asString().contains(title + "-restrito"));
        assertFalse(as(adminA).get("/v1/dashboard").then().extract().asString().contains(title + "-restrito"));
        as(adminA).queryParam("q", title + "-restrito").get("/v1/documents").then().body("total", equalTo(1));
    }

    @Test
    void novaVersaoPendenteNaoEscondeAVersaoJaLiberada() {
        Doc doc = cleanDocument(projectA, "PARTICIPANTS");
        Response v2 = as(unionAdmin).multiPart("file", "v2.pdf", "%PDF-1.7 v2".getBytes()).post("/v1/documents/" + doc.id() + "/versions");
        v2.then().statusCode(200).body("currentVersion", equalTo(2));
        as(adminA).get("/v1/documents/" + doc.id()).then().statusCode(200)
                .body("versions.size()", equalTo(1)).body("document.latest.versionNo", equalTo(1)).body("document.currentVersion", equalTo(1));
        as(unionAdmin).get("/v1/documents/" + doc.id()).then().body("versions.size()", equalTo(2));
    }

    @Test
    void validaFormatoConteudoENome() {
        uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "pagina.html", "<html></html>").then().statusCode(400).body("code", equalTo("FILE_NOT_ACCEPTED"));
        uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "imagem.svg", "<svg></svg>").then().statusCode(400);
        uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "programa.exe", "MZ").then().statusCode(400);
        // Extensão permitida com conteúdo incompatível: o Content-Type declarado não muda nada.
        as(unionAdmin).multiPart("file", "falso.pdf", "<html>nao e pdf</html>".getBytes(), "application/pdf")
                .multiPart("projectId", projectA.toString()).multiPart("title", "x").multiPart("category", "OTHER").multiPart("visibility", "PARTICIPANTS")
                .post("/v1/documents").then().statusCode(400);
        uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "binario.txt", "abc\0def").then().statusCode(400);

        Response ok = uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "../../etc/passwd.pdf", "%PDF-1.7");
        ok.then().statusCode(200).body("latest.file.name", equalTo("passwd.pdf"));
        assertTrue(storage.objects.keySet().stream().noneMatch(k -> k.contains("passwd") || k.contains("..")));
    }

    @Test
    void limitesDeTamanhoECapacidade() {
        String large = "%PDF-1.7" + "x".repeat(3000);
        uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "grande.pdf", large).then().statusCode(413).body("code", equalTo("FILE_TOO_LARGE"));
        String medium = "%PDF-1.7" + "x".repeat(2000);
        for (int i = 0; i < 2; i++) uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "m" + i + ".pdf", medium).then().statusCode(200);
        uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "m3.pdf", medium).then().statusCode(200);
        uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "m4.pdf", medium).then().statusCode(413).body("code", equalTo("TENANT_QUOTA_EXCEEDED"));
    }

    // ---------- Suporte ----------

    @Test
    void notaInternaNaoApareceParaOCliente() {
        UUID ticket = ticket(adminA);
        json(unionAdmin).body(Map.of("body", "NOTA-SECRETA-DA-EQUIPE", "internal", true)).post("/v1/tickets/" + ticket + "/comments").then().statusCode(200);
        json(unionAdmin).body(Map.of("body", "Resposta visível", "internal", false)).post("/v1/tickets/" + ticket + "/comments").then().statusCode(200);

        String clientView = as(adminA).get("/v1/tickets/" + ticket).then().statusCode(200).body("comments.size()", equalTo(1)).extract().asString();
        assertFalse(clientView.contains("NOTA-SECRETA-DA-EQUIPE"));
        as(unionAdmin).get("/v1/tickets/" + ticket).then().body("comments.size()", equalTo(2));

        // O painel do cliente também não recebe o evento da nota.
        assertFalse(as(adminA).get("/v1/dashboard").then().extract().asString().contains("NOTA-SECRETA-DA-EQUIPE"));
        json(adminA).body(Map.of("body", "tentando nota interna", "internal", true)).post("/v1/tickets/" + ticket + "/comments").then().statusCode(403);
    }

    @Test
    void anexoInternoNaoEAcessivelPeloCliente() {
        UUID ticket = ticket(adminA);
        Response response = as(unionAdmin).multiPart("file", "interno.pdf", "%PDF-1.7".getBytes()).multiPart("internal", "true").post("/v1/tickets/" + ticket + "/attachments");
        response.then().statusCode(200);
        UUID attachment = UUID.fromString(response.path("attachments[0].id"));
        files.scanOne(UUID.fromString(response.path("attachments[0].file.id")));
        as(adminA).get("/v1/tickets/" + ticket).then().body("attachments", empty());
        as(adminA).get("/v1/tickets/" + ticket + "/attachments/" + attachment + "/download").then().statusCode(404);
        as(unionAdmin).get("/v1/tickets/" + ticket + "/attachments/" + attachment + "/download").then().statusCode(200);
        as(adminA).multiPart("file", "x.pdf", "%PDF-1.7".getBytes()).multiPart("internal", "true").post("/v1/tickets/" + ticket + "/attachments").then().statusCode(403);
    }

    @Test
    void membroSoVeASolicitacaoQueAbriuOuDeProjetoAssociado() {
        UUID fromAdmin = ticket(adminA);
        UUID fromMember = ticket(memberA);
        as(memberA).get("/v1/tickets/" + fromAdmin).then().statusCode(404);
        as(memberA).get("/v1/tickets/" + fromMember).then().statusCode(200);
        as(memberA).get("/v1/tickets").then().body("items.id", not(hasItem(fromAdmin.toString())));
        as(adminA).get("/v1/tickets").then().body("items.id", hasItems(fromAdmin.toString(), fromMember.toString()));
        json(memberA).body(Map.of("status", "CLOSED", "version", 0)).patch("/v1/tickets/" + fromMember).then().statusCode(403);
    }

    @Test
    void transicoesDeSuporteSaoValidadas() {
        UUID ticket = ticket(adminA);
        json(unionAdmin).body(Map.of("status", "CLOSED", "version", 0)).patch("/v1/tickets/" + ticket).then().statusCode(200);
        int version = as(unionAdmin).get("/v1/tickets/" + ticket).then().extract().path("version");
        json(unionAdmin).body(Map.of("status", "OPEN", "version", version)).patch("/v1/tickets/" + ticket).then().statusCode(409);
        json(unionAdmin).body(Map.of("status", "IN_PROGRESS", "version", 99)).patch("/v1/tickets/" + ticket).then().statusCode(409).body("code", equalTo("STALE_VERSION"));
        json(adminA).body(Map.of("body", "x", "internal", false)).post("/v1/tickets/" + ticket + "/comments").then().statusCode(409);
    }

    // ---------- Produtos ----------

    @Test
    void linkDeProdutoAceitaSoDestinoSeguroEAutorizado() {
        for (String bad : List.of("http://produto.exemplo.com.br", "javascript:alert(1)", "https://user:senha@produto.exemplo.com.br/", "https://outro-site.com/", "https://produto.exemplo.com.br.malicioso.com/", "ftp://produto.exemplo.com.br/")) {
            json(unionAdmin).body(Map.of("organizationId", clientA.id, "productName", "P", "commercialStatus", "ACTIVE", "accessUrl", bad)).post("/v1/products").then().statusCode(400);
        }
        json(unionAdmin).body(Map.of("organizationId", clientA.id, "productName", "P", "commercialStatus", "ACTIVE", "accessUrl", "https://app.produto.exemplo.com.br/entrar")).post("/v1/products").then().statusCode(200);
        as(adminA).get("/v1/products").then().body("items.accessUrl", hasItem("https://app.produto.exemplo.com.br/entrar"));
        as(adminB).get("/v1/products").then().body("items.accessUrl", not(hasItem("https://app.produto.exemplo.com.br/entrar")));
    }

    // ---------- Entregas e aprovações ----------

    @Test
    void aprovacaoExigePermissao() {
        fx.member(clientA.id, projectA, memberA.id, false);
        DeliveryRef delivery = awaitingDelivery(projectA);
        json(memberA).body(Map.of("decision", "APPROVED")).post("/v1/deliveries/versions/" + delivery.versionId() + "/decision").then().statusCode(403);
        json(unionAdmin).body(Map.of("decision", "APPROVED")).post("/v1/deliveries/versions/" + delivery.versionId() + "/decision").then().statusCode(403);
        json(staff).body(Map.of("decision", "APPROVED")).post("/v1/deliveries/versions/" + delivery.versionId() + "/decision").then().statusCode(404);

        // A equipe Union não pode receber permissão de aprovar pelo cliente.
        json(unionAdmin).body(Map.of("responsibility", "x", "canApprove", true)).put("/v1/projects/" + projectA + "/members/" + staff.id).then().statusCode(400);

        // Participante autorizado explicitamente pode aprovar.
        json(adminA).body(Map.of("responsibility", "Aprovador", "canApprove", true)).put("/v1/projects/" + projectA + "/members/" + memberA.id).then().statusCode(200);
        json(memberA).body(Map.of("decision", "APPROVED")).post("/v1/deliveries/versions/" + delivery.versionId() + "/decision").then().statusCode(200)
                .body("versions[0].status", equalTo("APPROVED")).body("versions[0].decision.decision", equalTo("APPROVED"));
    }

    @Test
    void ajusteExigeComentarioEDecisaoFicaNaVersaoExata() {
        DeliveryRef delivery = awaitingDelivery(projectA);
        json(adminA).body(Map.of("decision", "CHANGES_REQUESTED")).post("/v1/deliveries/versions/" + delivery.versionId() + "/decision").then().statusCode(400).body("code", equalTo("COMMENT_REQUIRED"));
        json(adminA).body(Map.of("decision", "CHANGES_REQUESTED", "comment", "Ajustar a seção 2")).post("/v1/deliveries/versions/" + delivery.versionId() + "/decision").then().statusCode(200);

        Response v2 = json(unionAdmin).body(Map.of("description", "Segunda versão")).post("/v1/deliveries/" + delivery.id() + "/versions");
        v2.then().statusCode(200).body("currentVersion", equalTo(2))
                .body("versions[0].status", equalTo("PUBLISHED")).body("versions[0].decision", nullValue())
                .body("versions[1].decision.comment", equalTo("Ajustar a seção 2"));
        UUID secondVersion = UUID.fromString(v2.path("versions[0].id"));

        // Não dá para decidir a versão antiga nem a nova antes do pedido de aprovação.
        json(adminA).body(Map.of("decision", "APPROVED")).post("/v1/deliveries/versions/" + delivery.versionId() + "/decision").then().statusCode(409).body("code", equalTo("STALE_VERSION"));
        json(adminA).body(Map.of("decision", "APPROVED")).post("/v1/deliveries/versions/" + secondVersion + "/decision").then().statusCode(409).body("code", equalTo("ALREADY_DECIDED"));

        as(unionAdmin).post("/v1/deliveries/versions/" + secondVersion + "/request-approval").then().statusCode(200);
        json(adminA).body(Map.of("decision", "APPROVED")).post("/v1/deliveries/versions/" + secondVersion + "/decision").then().statusCode(200);
        assertEquals(1, fx.decisions(delivery.versionId()));
        assertEquals(1, fx.decisions(secondVersion));
    }

    @Test
    void novaVersaoNaoHerdaAprovacaoAnterior() {
        DeliveryRef delivery = awaitingDelivery(projectA);
        json(adminA).body(Map.of("decision", "APPROVED")).post("/v1/deliveries/versions/" + delivery.versionId() + "/decision").then().statusCode(200);
        json(unionAdmin).body(Map.of("description", "Revisão")).post("/v1/deliveries/" + delivery.id() + "/versions").then().statusCode(200)
                .body("versions[0].status", equalTo("PUBLISHED")).body("versions[0].decision", nullValue())
                .body("versions[1].status", equalTo("SUPERSEDED")).body("versions[1].decision.decision", equalTo("APPROVED"));
    }

    @Test
    void entregaSoComDocumentoVerificadoEVisivel() {
        Doc pending = doc(uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "p.pdf", "%PDF-1.7"));
        Doc internal = cleanDocument(projectA, "INTERNAL");
        Doc otherClient = cleanDocument(projectB, "PARTICIPANTS");
        Doc ok = cleanDocument(projectA, "PARTICIPANTS");
        for (Doc bad : List.of(pending, internal, otherClient)) {
            json(unionAdmin).body(Map.of("title", "E", "description", "D", "documentVersionIds", List.of(bad.versionId()))).post("/v1/projects/" + projectA + "/deliveries").then().statusCode(400).body("code", equalTo("DOCUMENT_NOT_AVAILABLE"));
        }
        json(unionAdmin).body(Map.of("title", "E", "description", "D", "documentVersionIds", List.of(ok.versionId()))).post("/v1/projects/" + projectA + "/deliveries").then().statusCode(200)
                .body("versions[0].documents[0].downloadable", equalTo(true));
    }

    @Test
    void aprovacoesConcorrentesGeramUmaUnicaDecisao() throws Exception {
        fx.member(clientA.id, projectA, memberA.id, true);
        for (int round = 0; round < 5; round++) {
            DeliveryRef delivery = awaitingDelivery(projectA);
            CountDownLatch start = new CountDownLatch(1);
            ExecutorService pool = Executors.newFixedThreadPool(4);
            String tokenAdmin = TestSupport.token(adminA);
            String tokenMember = TestSupport.token(memberA);
            Callable<Integer> approve = () -> { start.await(); return given().header("Authorization", "Bearer " + tokenAdmin).contentType("application/json").body(Map.of("decision", "APPROVED")).post("/v1/deliveries/versions/" + delivery.versionId() + "/decision").statusCode(); };
            Callable<Integer> reject = () -> { start.await(); return given().header("Authorization", "Bearer " + tokenMember).contentType("application/json").body(Map.of("decision", "CHANGES_REQUESTED", "comment", "ajuste")).post("/v1/deliveries/versions/" + delivery.versionId() + "/decision").statusCode(); };
            List<Future<Integer>> results = List.of(pool.submit(approve), pool.submit(reject), pool.submit(approve), pool.submit(reject));
            start.countDown();
            List<Integer> statuses = new java.util.ArrayList<>();
            for (Future<Integer> f : results) statuses.add(f.get());
            pool.shutdown();

            assertEquals(1, statuses.stream().filter(s -> s == 200).count(), "uma decisão vence: " + statuses);
            assertEquals(3, statuses.stream().filter(s -> s == 409).count(), "as demais recebem conflito: " + statuses);
            assertEquals(1, fx.decisions(delivery.versionId()));
        }
    }

    @Test
    void publicacaoConcorrenteNaoDuplicaVersao() throws Exception {
        DeliveryRef delivery = awaitingDelivery(projectA);
        String token = TestSupport.token(unionAdmin);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(3);
        Callable<Integer> publish = () -> { start.await(); return given().header("Authorization", "Bearer " + token).contentType("application/json").body(Map.of("description", "nova")).post("/v1/deliveries/" + delivery.id() + "/versions").statusCode(); };
        List<Future<Integer>> results = List.of(pool.submit(publish), pool.submit(publish), pool.submit(publish));
        start.countDown();
        for (Future<Integer> f : results) assertEquals(200, f.get());
        pool.shutdown();
        as(unionAdmin).get("/v1/deliveries/" + delivery.id()).then().body("currentVersion", equalTo(4)).body("versions.size()", equalTo(4));
    }

    @Test
    void edicaoConcorrenteDeProjetoEDetectada() {
        json(unionAdmin).body(Map.of("name", "Primeira edição", "version", 0)).patch("/v1/projects/" + projectA).then().statusCode(200);
        json(unionAdmin).body(Map.of("name", "Edição com versão antiga", "version", 0)).patch("/v1/projects/" + projectA).then().statusCode(409).body("code", equalTo("STALE_VERSION"));
    }

    @Test
    void auditoriaRegistraDownloadEDecisao() {
        Doc doc = cleanDocument(projectA, "PARTICIPANTS");
        as(adminA).get(downloadPath(doc)).then().statusCode(200);
        assertEquals(1, fx.auditCount("DOCUMENT_DOWNLOADED", doc.id()));
        DeliveryRef delivery = awaitingDelivery(projectA);
        json(adminA).body(Map.of("decision", "APPROVED")).post("/v1/deliveries/versions/" + delivery.versionId() + "/decision").then().statusCode(200);
        assertEquals(1, fx.auditCount("DELIVERY_APPROVED", delivery.versionId()));
        as(adminA).get("/v1/audit").then().statusCode(403);
        as(staff).get("/v1/audit").then().statusCode(403);
        as(unionAdmin).get("/v1/audit").then().statusCode(200).body("total", greaterThan(0));
    }
}
