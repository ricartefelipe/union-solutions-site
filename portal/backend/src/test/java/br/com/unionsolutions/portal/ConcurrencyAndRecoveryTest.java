package br.com.unionsolutions.portal;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

import br.com.unionsolutions.portal.application.Actor;
import br.com.unionsolutions.portal.application.FileService;
import br.com.unionsolutions.portal.application.ObjectLedgerService;
import br.com.unionsolutions.portal.application.Startup;
import br.com.unionsolutions.portal.domain.AppUser;
import br.com.unionsolutions.portal.domain.StoredFile;
import br.com.unionsolutions.portal.domain.Types.Role;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

/** Revisão R6, R7 e bootstrap: concorrência com PostgreSQL real e recuperação depois de reversões. */
@QuarkusTest
class ConcurrencyAndRecoveryTest extends ApiTestBase {
    @Inject FileService files;
    @Inject ObjectLedgerService ledger;
    @Inject TestSupport.RollbackProbe probe;
    @Inject Startup startup;

    /** Dispara as chamadas ao mesmo tempo, com barreira, e devolve os códigos HTTP. */
    private List<Integer> simultaneous(List<Callable<Response>> calls) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(calls.size());
        CountDownLatch go = new CountDownLatch(1);
        try {
            List<Future<Integer>> futures = new ArrayList<>();
            for (Callable<Response> call : calls) {
                futures.add(pool.submit(() -> {
                    go.await();
                    return call.call().statusCode();
                }));
            }
            go.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> f : futures) statuses.add(f.get());
            return statuses;
        } finally {
            pool.shutdownNow();
        }
    }

    // ---------- R6: ao menos um administrador ativo ----------

    private void restoreAdmin(AppUser by, AppUser target) {
        as(by).post("/v1/users/" + target.id + "/enable");
        json(by).body(Map.of("role", "UNION_ADMIN")).put("/v1/users/" + target.id + "/role");
    }

    @Test
    void doisAdministradoresNaoSeDesativamAoMesmoTempo() throws Exception {
        AppUser second = fx.user(Role.UNION_ADMIN, null);
        fx.keepOnlyAdmins(java.util.Set.of(unionAdmin.id, second.id));
        for (int round = 0; round < 10; round++) {
            List<Integer> statuses = simultaneous(List.of(
                    () -> as(unionAdmin).post("/v1/users/" + second.id + "/disable"),
                    () -> as(second).post("/v1/users/" + unionAdmin.id + "/disable")));
            assertEquals(1, fx.activeAdmins(), "rodada " + round + ": exatamente um sobrevive; respostas " + statuses);
            // Um desativa. O outro recebe conflito (409) ou, se a desativação dele já valia ao ser reconferida, sem acesso (403).
            assertEquals(1, statuses.stream().filter(st -> st == 200).count(), statuses.toString());
            assertTrue(statuses.stream().allMatch(st -> st == 200 || st == 409 || st == 403), statuses.toString());
            AppUser survivor = statuses.get(0) == 200 ? unionAdmin : second;
            restoreAdmin(survivor, survivor == unionAdmin ? second : unionAdmin);
            assertEquals(2, fx.activeAdmins());
        }
    }

    @Test
    void rebaixamentoReciprocoEDesativacaoComRebaixamentoPreservamUmAdministrador() throws Exception {
        AppUser second = fx.user(Role.UNION_ADMIN, null);
        fx.keepOnlyAdmins(java.util.Set.of(unionAdmin.id, second.id));
        for (int round = 0; round < 10; round++) {
            List<Integer> statuses = simultaneous(List.of(
                    () -> json(unionAdmin).body(Map.of("role", "UNION_STAFF")).put("/v1/users/" + second.id + "/role"),
                    () -> json(second).body(Map.of("role", "UNION_STAFF")).put("/v1/users/" + unionAdmin.id + "/role")));
            assertEquals(1, fx.activeAdmins(), "rebaixamento recíproco, rodada " + round + ": " + statuses);
            assertEquals(1, statuses.stream().filter(st -> st == 200).count(), statuses.toString());
            assertTrue(statuses.stream().allMatch(st -> st == 200 || st == 409 || st == 403), statuses.toString());
            AppUser survivor = statuses.get(0) == 200 ? unionAdmin : second;
            restoreAdmin(survivor, survivor == unionAdmin ? second : unionAdmin);

            statuses = simultaneous(List.of(
                    () -> as(unionAdmin).post("/v1/users/" + second.id + "/disable"),
                    () -> json(second).body(Map.of("role", "UNION_STAFF")).put("/v1/users/" + unionAdmin.id + "/role")));
            assertEquals(1, fx.activeAdmins(), "desativação com rebaixamento, rodada " + round + ": " + statuses);
            // Quem perdeu a vez recebe conflito (409) ou, se já foi desativado quando a requisição dele chegou, sem acesso (403).
            assertEquals(1, statuses.stream().filter(st -> st == 200).count(), statuses.toString());
            assertTrue(statuses.stream().allMatch(st -> st == 200 || st == 409 || st == 403), statuses.toString());
            survivor = statuses.get(0) == 200 ? unionAdmin : second;
            restoreAdmin(survivor, survivor == unionAdmin ? second : unionAdmin);
            assertEquals(2, fx.activeAdmins());
        }
    }

    @Test
    void fluxoLegitimoComAdministradorRemanescenteContinuaFuncionando() {
        AppUser second = fx.user(Role.UNION_ADMIN, null);
        fx.keepOnlyAdmins(java.util.Set.of(unionAdmin.id, second.id));
        as(unionAdmin).post("/v1/users/" + second.id + "/disable").then().statusCode(200);
        assertEquals(1, fx.activeAdmins());
        // Último ativo: ninguém pode rebaixá-lo nem desativá-lo, e a recusa é um conflito claro.
        AppUser third = fx.user(Role.UNION_ADMIN, null);
        as(unionAdmin).post("/v1/users/" + third.id + "/disable").then().statusCode(200);
        as(third).post("/v1/users/" + unionAdmin.id + "/disable").then().statusCode(403);
        as(unionAdmin).post("/v1/users/" + second.id + "/enable").then().statusCode(200);
        json(second).body(Map.of("role", "UNION_STAFF")).put("/v1/users/" + unionAdmin.id + "/role").then().statusCode(200);
        assertEquals(1, fx.activeAdmins());
        json(unionAdmin).body(Map.of("role", "UNION_STAFF")).put("/v1/users/" + second.id + "/role").then().statusCode(403);
        json(second).body(Map.of("role", "UNION_ADMIN")).put("/v1/users/" + unionAdmin.id + "/role").then().statusCode(200);
        as(unionAdmin).post("/v1/users/" + second.id + "/disable").then().statusCode(200);
        json(unionAdmin).body(Map.of("role", "UNION_STAFF")).put("/v1/users/" + unionAdmin.id + "/role").then().statusCode(400);
        as(unionAdmin).post("/v1/users/" + unionAdmin.id + "/disable").then().statusCode(400);
        assertEquals(1, fx.activeAdmins());
    }

    @Test
    void ultimoAdministradorAtivoNaoPodeSerRebaixadoNemDesativado() {
        AppUser second = fx.user(Role.UNION_ADMIN, null);
        fx.keepOnlyAdmins(java.util.Set.of(unionAdmin.id, second.id));
        as(second).post("/v1/users/" + unionAdmin.id + "/disable").then().statusCode(200);
        // `second` é o único ativo. Um administrador desativado não opera, e um reativado também não pode derrubar o último.
        as(second).post("/v1/users/" + unionAdmin.id + "/enable").then().statusCode(200);
        json(unionAdmin).body(Map.of("role", "UNION_STAFF")).put("/v1/users/" + second.id + "/role").then().statusCode(200);
        assertEquals(1, fx.activeAdmins());
        json(second).body(Map.of("role", "UNION_ADMIN")).put("/v1/users/" + unionAdmin.id + "/role").then().statusCode(403);
        as(unionAdmin).post("/v1/users/" + unionAdmin.id + "/disable").then().statusCode(400);
        json(unionAdmin).body(Map.of("role", "UNION_ADMIN")).put("/v1/users/" + second.id + "/role").then().statusCode(200);
        assertEquals(2, fx.activeAdmins());
        json(unionAdmin).body(Map.of("role", "UNION_STAFF")).put("/v1/users/" + second.id + "/role").then().statusCode(200);
        json(unionAdmin).body(Map.of("role", "UNION_STAFF")).put("/v1/users/" + unionAdmin.id + "/role").then().statusCode(400);
        assertEquals(1, fx.activeAdmins());
    }

    // ---------- R7: cota atômica e objetos depois de reversão ----------

    private Response attach(AppUser user, UUID ticket, String name, String content) {
        return as(user).multiPart("file", name, content.getBytes(StandardCharsets.UTF_8)).post("/v1/tickets/" + ticket + "/attachments");
    }


    @Test
    void enviosParalelosPertoDaCotaRespeitamOLimite() throws Exception {
        // Cota de teste: 6100 bytes. Três envios de 2008 bytes cabem (6024); o quarto não.
        String medium = "%PDF-1.7" + "x".repeat(2000);
        // Anexos em solicitações distintas: na mesma, o controle de versão da solicitação já recusaria o segundo.
        UUID ticket1 = ticket(adminA);
        UUID ticket2 = ticket(adminA);
        List<Callable<Response>> calls = List.of(
                () -> uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "p1.pdf", medium),
                () -> uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "p2.pdf", medium),
                () -> attach(adminA, ticket1, "p3.pdf", medium),
                () -> attach(adminA, ticket2, "p4.pdf", medium),
                () -> uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "p5.pdf", medium));
        List<Integer> statuses = simultaneous(calls);
        assertEquals(3, statuses.stream().filter(s -> s == 200).count(), "exatamente três cabem: " + statuses);
        assertEquals(2, statuses.stream().filter(s -> s == 413).count(), statuses.toString());
        assertTrue(fx.usedBytes(clientA.id) <= 6100, "soma registrada respeita a cota");
        // Os que entraram continuam disponíveis depois da verificação.
        for (String key : List.copyOf(storage.objects.keySet())) assertTrue(key.startsWith("quarantine/") || key.startsWith("clean/"));
    }

    @Test
    void reversaoDepoisDoEnvioApagaOObjetoELiberaACota() throws Exception {
        Path tmp = Files.createTempFile("rev", ".pdf");
        Files.writeString(tmp, "%PDF-1.7 reversao");
        Actor actor = new Actor(unionAdmin.id, unionAdmin.email, "Admin", Role.UNION_ADMIN, null);
        AtomicReference<StoredFile> stored = new AtomicReference<>();
        assertThrows(IllegalStateException.class, () -> probe.storeThenFail(actor, clientA.id, new FileService.Upload(tmp, "rev.pdf"), stored::set));
        String key = stored.get().objectKey;
        assertFalse(storage.objects.containsKey(key), "objeto apagado na compensação");
        assertEquals(0, fx.ledgerEntries(clientA.id), "reserva liberada");
        assertEquals(0, fx.usedBytes(clientA.id));
    }

    @Test
    void falhaNaCompensacaoFicaRegistradaEALimpezaRepetidaResolve() throws Exception {
        Path tmp = Files.createTempFile("rev", ".pdf");
        Files.writeString(tmp, "%PDF-1.7 compensacao");
        Actor actor = new Actor(unionAdmin.id, unionAdmin.email, "Admin", Role.UNION_ADMIN, null);
        AtomicReference<StoredFile> stored = new AtomicReference<>();
        storage.failDeletes = true;
        try {
            assertThrows(IllegalStateException.class, () -> probe.storeThenFail(actor, clientA.id, new FileService.Upload(tmp, "c.pdf"), stored::set));
            String key = stored.get().objectKey;
            assertTrue(storage.objects.containsKey(key), "objeto continua lá: a exclusão falhou");
            assertEquals(1, fx.ledgerEntries(clientA.id), "falha identificável no registro");
            assertEquals(stored.get().sizeBytes, fx.usedBytes(clientA.id), "espaço ainda ocupado continua contado");
            // Recém-criado: a limpeza não toca (idade mínima), mesmo repetida.
            ledger.reconcile();
            assertEquals(1, fx.ledgerEntries(clientA.id));
            fx.backdateLedger(clientA.id);
            ledger.reconcile();
            assertEquals(1, fx.ledgerEntries(clientA.id), "ainda falhando: continua registrado");
        } finally {
            storage.failDeletes = false;
        }
        ledger.reconcile();
        assertEquals(0, fx.ledgerEntries(clientA.id));
        assertFalse(storage.objects.containsKey(stored.get().objectKey));
        assertEquals(0, fx.usedBytes(clientA.id));
        // Repetir sem nada pendente não tem efeito.
        assertEquals(0, ledger.reconcile());
    }

    @Test
    void limpezaNaoApagaObjetosDeArquivosRegistradosNemPendentes() {
        Doc pending = doc(uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "p.pdf", "%PDF-1.7 pendente"));
        Doc clean = cleanDocument(projectA, "PARTICIPANTS");
        fx.backdateLedger(clientA.id);
        ledger.reconcile();
        assertTrue(storage.objects.keySet().stream().anyMatch(k -> k.endsWith(pending.fileId().toString())), "pendente de verificação preservado");
        assertTrue(storage.objects.keySet().stream().anyMatch(k -> k.endsWith(clean.fileId().toString())), "liberado preservado");
        as(adminA).get("/v1/documents/" + clean.id() + "/versions/" + clean.versionId() + "/download").then().statusCode(200);
    }

    @Test
    void arquivoBloqueadoSoDeixaDeContarQuandoOObjetoForApagado() {
        Doc infected = doc(uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "v.pdf", "%PDF-1.7 MARCA-MALWARE"));
        long before = fx.usedBytes(clientA.id);
        storage.failDeletes = true;
        try {
            files.scanOne(infected.fileId());
            assertTrue(fx.objectPresent(infected.fileId()), "exclusão falhou: objeto segue presente");
            assertEquals(before, fx.usedBytes(clientA.id), "espaço ocupado continua contado");
        } finally {
            storage.failDeletes = false;
        }
        ledger.reconcile();
        assertFalse(fx.objectPresent(infected.fileId()));
        assertTrue(fx.usedBytes(clientA.id) < before, "espaço liberado só depois da exclusão");
    }

    @Test
    void copiaDeQuarentenaQueNaoFoiApagadaFicaRegistradaComoSobra() {
        Doc doc = doc(uploadDocument(unionAdmin, projectA, "PARTICIPANTS", "s.pdf", "%PDF-1.7 limpo"));
        storage.failDeletes = true;
        try {
            files.scanOne(doc.fileId());
        } finally {
            storage.failDeletes = false;
        }
        assertEquals(1, fx.ledgerEntries(clientA.id), "sobra registrada");
        fx.backdateLedger(clientA.id);
        ledger.reconcile();
        assertEquals(0, fx.ledgerEntries(clientA.id));
        assertEquals(1, storage.objects.keySet().stream().filter(k -> k.endsWith(doc.fileId().toString())).count(), "só a cópia liberada permanece");
        as(adminA).get("/v1/documents/" + doc.id() + "/versions/" + doc.versionId() + "/download").then().statusCode(200);
    }

    // ---------- Bootstrap: tenta de novo em falha, para depois do aceite ----------

    @Test
    void bootstrapTentaDeNovoEmFalhaEParaDepoisDoAceite() {
        String email = "primeiro-" + UUID.randomUUID() + "@portal.invalid";
        identity.setupEmails.clear();
        identity.failSetups.set(2);
        startup.armBootstrapForTests(email);

        startup.retryBootstrap();
        assertEquals(0, identity.setupEmails.size(), "primeira tentativa falhou");
        assertTrue(startup.nextBootstrapAttempt().isAfter(java.time.Instant.now()), "espera antes de tentar de novo");
        startup.retryBootstrap();
        assertEquals(0, identity.setupEmails.size(), "dentro da espera não tenta");

        startup.skipBootstrapWaitForTests();
        startup.retryBootstrap();
        assertEquals(0, identity.setupEmails.size(), "segunda falha");
        assertTrue(startup.bootstrapPending());
        startup.skipBootstrapWaitForTests();
        startup.retryBootstrap();
        assertEquals(List.of(email), identity.setupEmails, "aceito na terceira");
        assertFalse(startup.bootstrapPending());

        for (int i = 0; i < 3; i++) startup.retryBootstrap();
        assertEquals(1, identity.setupEmails.size(), "nenhum reenvio depois do aceite");
    }
}
