package br.com.unionsolutions.portal;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

import br.com.unionsolutions.portal.domain.AppUser;
import br.com.unionsolutions.portal.domain.Types.Role;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.oidc.server.OidcWiremockTestResource;
import io.restassured.http.ContentType;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

@QuarkusTest
@QuarkusTestResource(OidcWiremockTestResource.class)
class IsolationTest extends ApiTestBase {

    @Test
    void semAutenticacaoNenhumDadoPrivadoESeAcessa() {
        for (String path : List.of("/v1/me", "/v1/dashboard", "/v1/projects", "/v1/projects/" + projectA, "/v1/documents", "/v1/tickets", "/v1/products",
                "/v1/users", "/v1/organizations", "/v1/invitations", "/v1/audit", "/v1/deliveries/pending-approvals")) {
            given().get(path).then().statusCode(401);
        }
        given().contentType(ContentType.JSON).body(Map.of("organizationId", clientA.id, "name", "x", "serviceLine", "DEVELOPMENT")).post("/v1/projects").then().statusCode(401);
    }

    @Test
    void tokenAdulteradoOuDeOutroEmissorERecusado() {
        String valid = TestSupport.token(adminA);
        given().header("Authorization", "Bearer " + valid.substring(0, valid.length() - 4) + "AAAA").get("/v1/me").then().statusCode(401);
        given().header("Authorization", "Bearer ").get("/v1/me").then().statusCode(401);
    }

    @Test
    void contaAutenticadaSemVinculoNaoTemAcesso() {
        String token = TestSupport.token(UUID.randomUUID().toString(), "sem-vinculo@teste.invalid", true);
        given().header("Authorization", "Bearer " + token).get("/v1/projects").then().statusCode(403).body("code", equalTo("NO_ACCESS"));
    }

    @Test
    void clienteANaoLeRecursosDoClienteBPorIdConhecido() {
        Doc docB = cleanDocument(projectB, "PARTICIPANTS");
        DeliveryRef deliveryB = awaitingDelivery(projectB);
        UUID ticketB = ticket(adminB);
        UUID productB = UUID.fromString(json(unionAdmin).body(Map.of("organizationId", clientB.id, "productName", "Produto B", "commercialStatus", "ACTIVE"))
                .post("/v1/products").then().statusCode(200).extract().path("id"));

        as(adminA).get("/v1/projects/" + projectB).then().statusCode(404);
        as(adminA).get("/v1/projects/" + projectB + "/deliveries").then().statusCode(404);
        as(adminA).get("/v1/deliveries/" + deliveryB.id()).then().statusCode(404);
        as(adminA).get("/v1/documents/" + docB.id()).then().statusCode(404);
        as(adminA).get("/v1/documents/" + docB.id() + "/versions/" + docB.versionId() + "/download").then().statusCode(404);
        as(adminA).get("/v1/tickets/" + ticketB).then().statusCode(404);

        // Listagens e filtros: um parâmetro apontando para outro cliente não amplia o alcance.
        as(adminA).queryParam("organizationId", clientB.id).get("/v1/projects").then().statusCode(200).body("total", equalTo(0));
        as(adminA).queryParam("projectId", projectB).get("/v1/documents").then().statusCode(200).body("total", equalTo(0));
        as(adminA).queryParam("organizationId", clientB.id).get("/v1/tickets").then().statusCode(200).body("total", equalTo(0));
        as(adminA).queryParam("organizationId", clientB.id).get("/v1/products").then().statusCode(200).body("items.id", not(hasItem(productB.toString())));
        as(adminA).queryParam("organizationId", clientB.id).get("/v1/users").then().statusCode(200).body("items.email", not(hasItem(adminB.email)));
        // Cabeçalhos de tenant são ignorados.
        as(adminA).header("X-Tenant-Id", clientB.id.toString()).get("/v1/projects/" + projectB).then().statusCode(404);
    }

    @Test
    void clienteANaoAlteraRecursosDoClienteB() {
        DeliveryRef deliveryB = awaitingDelivery(projectB);
        UUID ticketB = ticket(adminB);

        json(adminA).body(Map.of("decision", "APPROVED")).post("/v1/deliveries/versions/" + deliveryB.versionId() + "/decision").then().statusCode(404);
        json(adminA).body(Map.of("body", "invasão", "internal", false)).post("/v1/tickets/" + ticketB + "/comments").then().statusCode(404);
        json(adminA).body(Map.of("name", "alterado", "version", 0)).patch("/v1/projects/" + projectB).then().statusCode(404);
        json(adminA).body(Map.of("responsibility", "x", "canApprove", true)).put("/v1/projects/" + projectB + "/members/" + adminA.id).then().statusCode(404);
        as(adminA).multiPart("file", "a.pdf", "%PDF-1.7".getBytes()).post("/v1/tickets/" + ticketB + "/attachments").then().statusCode(404);
        as(adminA).post("/v1/users/" + adminB.id + "/disable").then().statusCode(404);

        as(adminB).get("/v1/deliveries/" + deliveryB.id()).then().statusCode(200).body("versions[0].status", equalTo("AWAITING_APPROVAL"));
        as(adminB).get("/v1/tickets/" + ticketB).then().statusCode(200).body("comments", empty());
    }

    @Test
    void painelNaoMisturaClientes() {
        awaitingDelivery(projectB);
        UUID ticketB = ticket(adminB);
        as(adminA).get("/v1/dashboard").then().statusCode(200)
                .body("activeProjects.id", not(hasItem(projectB.toString())))
                .body("pendingApprovals", empty())
                .body("openTickets.id", not(hasItem(ticketB.toString())))
                .body("activity.projectId", not(hasItem(projectB.toString())));
        as(adminA).get("/v1/deliveries/pending-approvals").then().statusCode(200).body("$", empty());
    }

    @Test
    void membroSemAssociacaoNaoAcessaProjetoDaPropriaOrganizacao() {
        Doc doc = cleanDocument(projectA, "PARTICIPANTS");
        as(memberA).get("/v1/projects/" + projectA).then().statusCode(404);
        as(memberA).get("/v1/projects").then().statusCode(200).body("total", equalTo(0));
        as(memberA).get("/v1/documents").then().statusCode(200).body("total", equalTo(0));
        as(memberA).get("/v1/documents/" + doc.id() + "/versions/" + doc.versionId() + "/download").then().statusCode(404);

        fx.member(clientA.id, projectA, memberA.id, false);
        as(memberA).get("/v1/projects/" + projectA).then().statusCode(200);
        as(memberA).get("/v1/documents/" + doc.id() + "/versions/" + doc.versionId() + "/download").then().statusCode(200);
        as(memberA).get("/v1/projects").then().body("total", equalTo(1));

        // Administrador do cliente vê tudo da organização, sem associação.
        as(adminA).get("/v1/projects/" + projectA).then().statusCode(200);
    }

    @Test
    void equipeUnionSemAssociacaoNaoAcessaProjetosRestritos() {
        Doc doc = cleanDocument(projectA, "PARTICIPANTS");
        as(staff).get("/v1/projects/" + projectA).then().statusCode(404);
        as(staff).get("/v1/projects").then().statusCode(200).body("total", equalTo(0));
        as(staff).get("/v1/documents").then().statusCode(200).body("total", equalTo(0));
        as(staff).get("/v1/documents/" + doc.id()).then().statusCode(404);
        as(staff).get("/v1/organizations/" + clientA.id).then().statusCode(404);
        json(staff).body(Map.of("organizationId", clientA.id, "name", "x", "serviceLine", "DEVELOPMENT")).post("/v1/projects").then().statusCode(404);
        json(staff).body(Map.of("name", "Nova")).post("/v1/organizations").then().statusCode(403);

        fx.member(clientA.id, projectA, staff.id, false);
        as(staff).get("/v1/projects/" + projectA).then().statusCode(200);
        as(staff).get("/v1/projects/" + projectB).then().statusCode(404);

        // Associação à organização libera o que é da organização, não os projetos dos quais não participa.
        fx.assign(clientB.id, staff.id, unionAdmin.id);
        as(staff).get("/v1/organizations/" + clientB.id).then().statusCode(200);
        as(staff).get("/v1/projects/" + projectB).then().statusCode(404);
    }

    @Test
    void membroComumNaoOperaOProjeto() {
        fx.member(clientA.id, projectA, memberA.id, false);
        json(memberA).body(Map.of("name", "alterado", "version", 0)).patch("/v1/projects/" + projectA).then().statusCode(403);
        json(memberA).body(Map.of("title", "Etapa")).post("/v1/projects/" + projectA + "/milestones").then().statusCode(403);
        json(memberA).body(Map.of("body", "x")).post("/v1/projects/" + projectA + "/updates").then().statusCode(403);
        json(memberA).body(Map.of("title", "x", "description", "y")).post("/v1/projects/" + projectA + "/deliveries").then().statusCode(403);
        uploadDocument(memberA, projectA, "PARTICIPANTS", "a.pdf", "%PDF-1.7").then().statusCode(403);
        json(memberA).body(Map.of("name", "Nova")).post("/v1/organizations").then().statusCode(403);
        as(memberA).get("/v1/audit").then().statusCode(403);
        as(memberA).get("/v1/users").then().statusCode(403);
    }

    @Test
    void clienteNaoConcedePapelInternoNemAlteraTenant() {
        json(adminA).body(Map.of("email", "novo@teste.invalid", "role", "UNION_ADMIN")).post("/v1/invitations").then().statusCode(403);
        json(adminA).body(Map.of("email", "novo@teste.invalid", "role", "UNION_STAFF")).post("/v1/invitations").then().statusCode(403);
        json(adminA).body(Map.of("email", "novo@teste.invalid", "role", "CLIENT_MEMBER", "organizationId", clientB.id)).post("/v1/invitations").then().statusCode(403);
        json(memberA).body(Map.of("email", "novo@teste.invalid", "role", "CLIENT_MEMBER")).post("/v1/invitations").then().statusCode(403);
        json(adminA).body(Map.of("role", "UNION_ADMIN")).put("/v1/users/" + memberA.id + "/role").then().statusCode(403);

        // Campos que não existem no contrato são recusados: não há como enviar tenant ou papel de carona.
        json(adminA).body(Map.of("role", "CLIENT_ADMIN", "tenantId", clientB.id)).put("/v1/users/" + memberA.id + "/role").then().statusCode(400);
        json(adminA).body(Map.of("subject", "x", "description", "y", "category", "QUESTION", "priority", "NORMAL", "tenantId", clientB.id)).post("/v1/tickets").then().statusCode(400);
        json(adminA).body(Map.of("subject", "x", "description", "y", "category", "QUESTION", "priority", "NORMAL", "organizationId", clientB.id)).post("/v1/tickets").then().statusCode(403);

        // Dentro da organização, a troca de papel de cliente é permitida.
        json(adminA).body(Map.of("role", "CLIENT_ADMIN")).put("/v1/users/" + memberA.id + "/role").then().statusCode(200).body("tenantId", equalTo(clientA.id.toString()));
    }

    @Test
    void usuarioDesativadoPerdeAcessoNaRequisicaoSeguinte() {
        AppUser user = fx.user(Role.CLIENT_MEMBER, clientA.id);
        String stillValidToken = TestSupport.token(user);
        given().header("Authorization", "Bearer " + stillValidToken).get("/v1/me").then().statusCode(200);

        as(adminA).post("/v1/users/" + user.id + "/disable").then().statusCode(200).body("user.status", equalTo("DISABLED"));
        org.junit.jupiter.api.Assertions.assertTrue(identity.disabled.contains(user.keycloakSub), "provedor de identidade também é acionado");

        given().header("Authorization", "Bearer " + stillValidToken).get("/v1/me").then().statusCode(403).body("code", equalTo("NO_ACCESS"));
        given().header("Authorization", "Bearer " + stillValidToken).get("/v1/projects").then().statusCode(403);
        as(unionAdmin).post("/v1/users/" + user.id + "/enable").then().statusCode(200);
        given().header("Authorization", "Bearer " + stillValidToken).get("/v1/me").then().statusCode(200);
    }

    @Test
    void naoEPossivelDesativarOUltimoAdministradorNemASiMesmo() {
        as(adminA).post("/v1/users/" + adminA.id + "/disable").then().statusCode(400);
        as(unionAdmin).post("/v1/users/" + unionAdmin.id + "/disable").then().statusCode(400);
    }

    @Test
    void paginacaoTemLimite() {
        as(unionAdmin).queryParam("size", 1000).get("/v1/projects").then().statusCode(400);
        as(unionAdmin).queryParam("size", 100).queryParam("page", 0).get("/v1/projects").then().statusCode(200).body("size", equalTo(100));
    }
}
