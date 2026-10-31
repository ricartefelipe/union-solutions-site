package br.com.unionsolutions.portal;

import static io.restassured.RestAssured.given;

import br.com.unionsolutions.portal.domain.AppUser;
import br.com.unionsolutions.portal.domain.Organization;
import br.com.unionsolutions.portal.domain.Types.Role;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import jakarta.inject.Inject;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;

/** Cenário padrão: dois clientes independentes, com administradores, membros e um projeto em cada. */
abstract class ApiTestBase {
    @Inject TestSupport.Fixtures fx;
    @Inject TestSupport.MemoryStorage storage;
    @Inject TestSupport.ScriptedScanner scanner;
    @Inject TestSupport.FakeIdentity identity;

    AppUser unionAdmin;
    AppUser staff;
    Organization clientA;
    Organization clientB;
    AppUser adminA;
    AppUser memberA;
    AppUser adminB;
    UUID projectA;
    UUID projectB;

    @BeforeEach
    void scenario() {
        scanner.unavailable = false;
        unionAdmin = fx.user(Role.UNION_ADMIN, null);
        staff = fx.user(Role.UNION_STAFF, null);
        clientA = fx.org("Cliente A");
        clientB = fx.org("Cliente B");
        adminA = fx.user(Role.CLIENT_ADMIN, clientA.id);
        memberA = fx.user(Role.CLIENT_MEMBER, clientA.id);
        adminB = fx.user(Role.CLIENT_ADMIN, clientB.id);
        projectA = createProject(clientA.id, "Projeto A");
        projectB = createProject(clientB.id, "Projeto B");
    }

    RequestSpecification as(AppUser user) {
        return given().header("Authorization", "Bearer " + TestSupport.token(user));
    }

    RequestSpecification json(AppUser user) {
        return as(user).contentType(ContentType.JSON);
    }

    UUID createProject(UUID orgId, String name) {
        return UUID.fromString(json(unionAdmin).body(Map.of("organizationId", orgId, "name", name, "serviceLine", "DEVELOPMENT", "status", "ACTIVE"))
                .post("/v1/projects").then().statusCode(200).extract().path("id"));
    }

    /** Publica documento e retorna a resposta. O arquivo fica em quarentena até a verificação. */
    Response uploadDocument(AppUser user, UUID projectId, String visibility, String fileName, String content) {
        return as(user).multiPart("file", fileName, content.getBytes(StandardCharsets.UTF_8))
                .multiPart("projectId", projectId.toString()).multiPart("title", "Documento").multiPart("category", "DESIGN").multiPart("visibility", visibility)
                .post("/v1/documents");
    }

    record Doc(UUID id, UUID versionId, UUID fileId) {}

    Doc doc(Response response) {
        response.then().statusCode(200);
        return new Doc(UUID.fromString(response.path("id")), UUID.fromString(response.path("latest.id")), UUID.fromString(response.path("latest.file.id")));
    }

    Doc cleanDocument(UUID projectId, String visibility) {
        Doc created = doc(uploadDocument(unionAdmin, projectId, visibility, "desenho.pdf", "%PDF-1.7 conteudo"));
        files.scanOne(created.fileId());
        return created;
    }

    @Inject br.com.unionsolutions.portal.application.FileService files;

    record DeliveryRef(UUID id, UUID versionId) {}

    DeliveryRef awaitingDelivery(UUID projectId) {
        Response created = json(unionAdmin).body(Map.of("title", "Entrega", "description", "Primeira versão")).post("/v1/projects/" + projectId + "/deliveries");
        created.then().statusCode(200);
        UUID deliveryId = UUID.fromString(created.path("id"));
        UUID versionId = UUID.fromString(created.path("versions[0].id"));
        as(unionAdmin).post("/v1/deliveries/versions/" + versionId + "/request-approval").then().statusCode(200);
        return new DeliveryRef(deliveryId, versionId);
    }

    UUID ticket(AppUser user) {
        return UUID.fromString(json(user).body(Map.of("subject", "Assunto", "description", "Descrição", "category", "QUESTION", "priority", "NORMAL"))
                .post("/v1/tickets").then().statusCode(200).extract().path("ticket.id"));
    }
}
