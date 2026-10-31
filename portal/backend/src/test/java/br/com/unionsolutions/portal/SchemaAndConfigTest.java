package br.com.unionsolutions.portal;

import static org.junit.jupiter.api.Assertions.*;

import br.com.unionsolutions.portal.application.ApiException;
import br.com.unionsolutions.portal.application.FileRules;
import br.com.unionsolutions.portal.application.ProductionChecks;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.oidc.server.OidcWiremockTestResource;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.UserTransaction;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** O banco recusa o que a aplicação não deveria nem tentar: vínculos entre tenants, tenant alterado e auditoria editada. */
@QuarkusTest
@QuarkusTestResource(OidcWiremockTestResource.class)
class SchemaAndConfigTest extends ApiTestBase {
    @Inject EntityManager em;
    @Inject UserTransaction tx;

    private void assertRejected(String sql, Map<String, Object> params) throws Exception {
        tx.begin();
        try {
            var query = em.createNativeQuery(sql);
            params.forEach(query::setParameter);
            assertThrows(RuntimeException.class, query::executeUpdate, sql);
        } finally {
            tx.rollback();
        }
    }

    @Test
    void chavesCompostasImpedemVinculosEntreOrganizacoes() throws Exception {
        UUID now = UUID.randomUUID();
        assertRejected("INSERT INTO milestone (id, tenant_id, project_id, title, created_at, updated_at) VALUES (:id, :tenant, :project, 'x', now(), now())",
                Map.of("id", now, "tenant", clientA.id, "project", projectB));
        assertRejected("INSERT INTO document (id, tenant_id, project_id, title, category, visibility, created_by, created_at, updated_at) VALUES (:id, :tenant, :project, 'x', 'OTHER', 'INTERNAL', :by, now(), now())",
                Map.of("id", now, "tenant", clientA.id, "project", projectB, "by", unionAdmin.id));
        assertRejected("INSERT INTO ticket (id, tenant_id, project_id, subject, description, category, opened_by, created_at, updated_at) VALUES (:id, :tenant, :project, 'x', 'y', 'OTHER', :by, now(), now())",
                Map.of("id", now, "tenant", clientA.id, "project", projectB, "by", adminA.id));
    }

    @Test
    void usuarioDeClienteNaoEntraEmProjetoDeOutraOrganizacaoNemComSql() throws Exception {
        assertRejected("INSERT INTO project_member (tenant_id, project_id, user_id, created_at) VALUES (:tenant, :project, :user, now())",
                Map.of("tenant", clientB.id, "project", projectB, "user", adminA.id));
    }

    @Test
    void tenantDoUsuarioEImutavelNoBanco() throws Exception {
        assertRejected("UPDATE app_user SET tenant_id = :other WHERE id = :id", Map.of("other", clientB.id, "id", adminA.id));
    }

    @Test
    void papelInternoNaoConvivecomTenant() throws Exception {
        assertRejected("UPDATE app_user SET role = 'UNION_ADMIN' WHERE id = :id", Map.of("id", adminA.id));
    }

    @Test
    void auditoriaNaoAceitaEdicaoOuExclusaoPelaAplicacao() throws Exception {
        assertRejected("UPDATE audit_event SET action = 'x'", Map.of());
        assertRejected("DELETE FROM audit_event", Map.of());
    }

    @Test
    void cadaVersaoAceitaUmaUnicaDecisaoNoBanco() throws Exception {
        DeliveryRef delivery = awaitingDelivery(projectA);
        json(adminA).body(Map.of("decision", "APPROVED")).post("/v1/deliveries/versions/" + delivery.versionId() + "/decision").then().statusCode(200);
        assertRejected("INSERT INTO approval_decision (id, tenant_id, delivery_version_id, decision, decided_by, decided_at) VALUES (:id, :tenant, :version, 'APPROVED', :by, now())",
                Map.of("id", UUID.randomUUID(), "tenant", clientA.id, "version", delivery.versionId(), "by", adminA.id));
    }

    // ---------- Produção ----------

    private Map<String, String> validProduction() {
        Map<String, String> config = new HashMap<>();
        config.put("portal.demo.enabled", "false");
        config.put("portal.storage.create-bucket", "false");
        config.put("quarkus.mailer.mock", "false");
        config.put("portal.public-url", "https://portal.empresa.com.br");
        config.put("quarkus.oidc.token.issuer", "https://id.empresa.com.br/realms/union-portal");
        config.put("quarkus.mailer.host", "smtp.empresa.com.br");
        config.put("quarkus.mailer.from", "portal@empresa.com.br");
        config.put("portal.identity.admin-client-secret", "segredo");
        config.put("portal.storage.access-key", "chave");
        config.put("portal.storage.secret-key", "segredo");
        config.put("portal.storage.endpoint", "https://s3.empresa.com.br");
        return config;
    }

    @Test
    void producaoValidaNaoTemViolacoes() {
        assertEquals(java.util.List.of(), ProductionChecks.violations(validProduction()::get));
    }

    @Test
    void producaoRecusaServicosEDadosDeDesenvolvimento() {
        Map<String, String> overrides = Map.of(
                "portal.demo.enabled", "true",
                "portal.storage.create-bucket", "true",
                "quarkus.mailer.mock", "true",
                "portal.public-url", "http://localhost:3100",
                "quarkus.oidc.token.issuer", "http://localhost:8180/realms/union-portal",
                "quarkus.mailer.host", "mailpit",
                "portal.storage.endpoint", "http://seaweedfs:8333");
        Map<String, String> more = Map.of(
                "portal.public-url", "https://portal.invalid",
                "quarkus.oidc.token.issuer", "https://clientes.example.com/realms/union-portal",
                "quarkus.mailer.host", "smtp.teste.local",
                "quarkus.mailer.from", "SUBSTITUIR@empresa.com.br",
                "quarkus.mailer.start-tls", "DISABLED",
                "quarkus.mailer.trust-all", "true",
                "quarkus.log.level", "DEBUG",
                "portal.identity.admin-client-secret", "SUBSTITUIR",
                "quarkus.datasource.password", "changeme",
                "portal.storage.secret-key", "SUBSTITUIR");
        more.forEach((key, value) -> {
            Map<String, String> config = validProduction();
            config.put(key, value);
            assertFalse(ProductionChecks.violations(config::get).isEmpty(), key + "=" + value + " deveria ser recusado");
        });
        Map<String, String> internalStorage = validProduction();
        internalStorage.put("portal.storage.endpoint", "http://armazenamento:8333");
        assertEquals(java.util.List.of(), ProductionChecks.violations(internalStorage::get));
        overrides.forEach((key, value) -> {
            Map<String, String> config = validProduction();
            config.put(key, value);
            assertFalse(ProductionChecks.violations(config::get).isEmpty(), key + "=" + value + " deveria ser recusado");
        });
        Map<String, String> noSecret = validProduction();
        noSecret.put("portal.identity.admin-client-secret", "");
        assertFalse(ProductionChecks.violations(noSecret::get).isEmpty());
    }

    // ---------- Regras de arquivo ----------

    @Test
    void nomesDeArquivoSaoSaneados() {
        assertEquals("passwd.pdf", FileRules.safeName("../../etc/passwd.pdf"));
        assertEquals("relatorio.pdf", FileRules.safeName("C:\\pasta\\relatorio.pdf"));
        assertEquals("arquivo", FileRules.safeName(".htaccess"));
        assertEquals("arquivo", FileRules.safeName(null));
        assertEquals("ab.pdf", FileRules.safeName("a\nb\".pdf".replace("\"", "")));
    }

    @Test
    void conteudoPrecisaCombinarComAExtensao() throws Exception {
        Path temp = Files.createTempFile("regra", ".bin");
        try {
            Files.write(temp, new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0});
            assertEquals("image/png", FileRules.detect("a.png", temp));
            assertThrows(ApiException.class, () -> FileRules.detect("a.jpg", temp));
            Files.writeString(temp, "PK\u0003\u0004conteudo");
            assertEquals("application/vnd.openxmlformats-officedocument.wordprocessingml.document", FileRules.detect("a.docx", temp));
            assertThrows(ApiException.class, () -> FileRules.detect("a.pdf", temp));
            assertThrows(ApiException.class, () -> FileRules.detect("a.zip", temp));
            Files.writeString(temp, "coluna;valor\n1;2\n");
            assertEquals("text/csv; charset=utf-8", FileRules.detect("a.csv", temp));
        } finally {
            Files.deleteIfExists(temp);
        }
    }
}
