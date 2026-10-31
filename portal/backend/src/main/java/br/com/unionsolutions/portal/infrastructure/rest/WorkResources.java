package br.com.unionsolutions.portal.infrastructure.rest;

import br.com.unionsolutions.portal.application.*;
import br.com.unionsolutions.portal.application.Dtos.*;
import br.com.unionsolutions.portal.domain.Types.*;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.List;
import java.util.UUID;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

/** Projetos, documentos, entregas, suporte e produtos. A autorização fica nos serviços, nunca na tela. */
public final class WorkResources {
    private WorkResources() {}

    @Path("/v1/projects")
    @Produces(MediaType.APPLICATION_JSON)
    @Tag(name = "Projetos")
    public static class ProjectResource {
        @Inject CurrentActor current;
        @Inject ProjectService projects;
        @Inject DeliveryService deliveries;

        @GET
        public Page<ProjectSummary> list(@QueryParam("status") ProjectStatus status, @QueryParam("organizationId") UUID organizationId, @QueryParam("q") String q,
                                         @QueryParam("page") @DefaultValue("0") @Min(0) int page, @QueryParam("size") @DefaultValue("25") @Min(1) @Max(100) int size) {
            return projects.list(current.require(), status, organizationId, q, page, size);
        }

        @POST public ProjectDetail create(@Valid ProjectInput input) { return projects.create(current.require(), input); }

        @GET @Path("/{id}") public ProjectDetail get(@PathParam("id") UUID id) { return projects.get(current.require(), id); }

        @PATCH @Path("/{id}") public ProjectDetail update(@PathParam("id") UUID id, @Valid ProjectPatch patch) { return projects.update(current.require(), id, patch); }

        @PUT @Path("/{id}/members/{userId}")
        public ProjectDetail setMember(@PathParam("id") UUID id, @PathParam("userId") UUID userId, @Valid MemberInput input) { return projects.setMember(current.require(), id, userId, input); }

        @DELETE @Path("/{id}/members/{userId}")
        public ProjectDetail removeMember(@PathParam("id") UUID id, @PathParam("userId") UUID userId) { return projects.removeMember(current.require(), id, userId); }

        @POST @Path("/{id}/milestones")
        public MilestoneView addMilestone(@PathParam("id") UUID id, @Valid MilestoneInput input) { return projects.addMilestone(current.require(), id, input); }

        @PUT @Path("/{id}/milestones/{milestoneId}")
        public MilestoneView updateMilestone(@PathParam("id") UUID id, @PathParam("milestoneId") UUID milestoneId, @Valid MilestoneInput input) { return projects.updateMilestone(current.require(), id, milestoneId, input); }

        @POST @Path("/{id}/updates")
        public UpdateView addUpdate(@PathParam("id") UUID id, @Valid UpdateInput input) { return projects.addUpdate(current.require(), id, input); }

        @GET @Path("/{id}/deliveries")
        public Page<DeliverySummary> deliveries(@PathParam("id") UUID id, @QueryParam("page") @DefaultValue("0") @Min(0) int page, @QueryParam("size") @DefaultValue("25") @Min(1) @Max(100) int size) {
            return deliveries.listByProject(current.require(), id, page, size);
        }

        @POST @Path("/{id}/deliveries")
        public DeliveryDetail createDelivery(@PathParam("id") UUID id, @Valid DeliveryInput input) { return deliveries.create(current.require(), id, input); }
    }

    @Path("/v1/deliveries")
    @Produces(MediaType.APPLICATION_JSON)
    @Tag(name = "Entregas")
    public static class DeliveryResource {
        @Inject CurrentActor current;
        @Inject DeliveryService deliveries;

        @GET @Path("/{id}") public DeliveryDetail get(@PathParam("id") UUID id) { return deliveries.get(current.require(), id); }

        @POST @Path("/{id}/versions")
        public DeliveryDetail publish(@PathParam("id") UUID id, @Valid DeliveryVersionInput input) { return deliveries.publishVersion(current.require(), id, input); }

        @POST @Path("/versions/{versionId}/request-approval")
        public DeliveryDetail request(@PathParam("versionId") UUID versionId) { return deliveries.requestApproval(current.require(), versionId); }

        @POST @Path("/versions/{versionId}/decision")
        public DeliveryDetail decide(@PathParam("versionId") UUID versionId, @Valid DecisionInput input) { return deliveries.decide(current.require(), versionId, input); }

        @GET @Path("/pending-approvals")
        public List<PendingApproval> pending() { return deliveries.pending(current.require(), 100); }
    }

    @Path("/v1/documents")
    @Produces(MediaType.APPLICATION_JSON)
    @Tag(name = "Documentos")
    public static class DocumentResource {
        @Inject CurrentActor current;
        @Inject DocumentService documents;

        @GET
        public Page<DocumentView> list(@QueryParam("projectId") UUID projectId, @QueryParam("organizationId") UUID organizationId, @QueryParam("category") DocCategory category, @QueryParam("q") String q,
                                       @QueryParam("page") @DefaultValue("0") @Min(0) int page, @QueryParam("size") @DefaultValue("25") @Min(1) @Max(100) int size) {
            return documents.list(current.require(), projectId, organizationId, category, q, page, size);
        }

        @POST @Consumes(MediaType.MULTIPART_FORM_DATA)
        public DocumentView create(@RestForm("file") FileUpload file, @RestForm UUID organizationId, @RestForm UUID projectId, @RestForm String title,
                                   @RestForm DocCategory category, @RestForm DocVisibility visibility, @RestForm String note) {
            if (title == null || title.isBlank() || title.length() > 200) throw ApiException.badRequest("VALIDATION", "Informe um título com até 200 caracteres.");
            if (category == null || visibility == null) throw ApiException.badRequest("VALIDATION", "Informe a categoria e a visibilidade.");
            return documents.create(current.require(), new DocumentService.NewDocument(organizationId, projectId, title, category, visibility, limit(note)), WebSupport.upload(file));
        }

        private static String limit(String note) {
            return note != null && note.length() > 500 ? note.substring(0, 500) : note;
        }

        @GET @Path("/{id}") public DocumentDetail get(@PathParam("id") UUID id) { return documents.get(current.require(), id); }

        @PATCH @Path("/{id}") @Consumes(MediaType.APPLICATION_JSON)
        public DocumentView update(@PathParam("id") UUID id, @Valid DocumentPatch patch) { return documents.update(current.require(), id, patch); }

        @POST @Path("/{id}/versions") @Consumes(MediaType.MULTIPART_FORM_DATA)
        public DocumentView addVersion(@PathParam("id") UUID id, @RestForm("file") FileUpload file, @RestForm String note) {
            return documents.addVersion(current.require(), id, limit(note), WebSupport.upload(file));
        }

        @GET @Path("/{id}/versions/{versionId}/download") @Produces(MediaType.APPLICATION_OCTET_STREAM)
        public Response download(@PathParam("id") UUID id, @PathParam("versionId") UUID versionId) {
            return WebSupport.attachment(documents.download(current.require(), id, versionId));
        }
    }

    @Path("/v1/files")
    @Tag(name = "Administração")
    public static class FileAdminResource {
        @Inject CurrentActor current;
        @Inject FileService files;

        @POST @Path("/{id}/rescan")
        public void rescan(@PathParam("id") UUID id) { files.rescan(current.require(), id); }
    }

    @Path("/v1/tickets")
    @Produces(MediaType.APPLICATION_JSON)
    @Tag(name = "Suporte")
    public static class TicketResource {
        @Inject CurrentActor current;
        @Inject TicketService tickets;

        @GET
        public Page<TicketSummary> list(@QueryParam("status") TicketStatus status, @QueryParam("open") @DefaultValue("false") boolean open, @QueryParam("organizationId") UUID organizationId,
                                        @QueryParam("page") @DefaultValue("0") @Min(0) int page, @QueryParam("size") @DefaultValue("25") @Min(1) @Max(100) int size) {
            return tickets.list(current.require(), status, open, organizationId, page, size);
        }

        @POST public TicketDetail create(@Valid TicketInput input) { return tickets.create(current.require(), input); }

        @GET @Path("/{id}") public TicketDetail get(@PathParam("id") UUID id) { return tickets.get(current.require(), id); }

        @PATCH @Path("/{id}") public TicketDetail update(@PathParam("id") UUID id, @Valid TicketPatch patch) { return tickets.update(current.require(), id, patch); }

        @POST @Path("/{id}/comments")
        public TicketDetail comment(@PathParam("id") UUID id, @Valid CommentInput input) { return tickets.comment(current.require(), id, input); }

        @POST @Path("/{id}/attachments") @Consumes(MediaType.MULTIPART_FORM_DATA)
        public TicketDetail attach(@PathParam("id") UUID id, @RestForm("file") FileUpload file, @RestForm @DefaultValue("false") boolean internal) {
            return tickets.attach(current.require(), id, internal, WebSupport.upload(file));
        }

        @GET @Path("/{id}/attachments/{attachmentId}/download") @Produces(MediaType.APPLICATION_OCTET_STREAM)
        public Response download(@PathParam("id") UUID id, @PathParam("attachmentId") UUID attachmentId) {
            return WebSupport.attachment(tickets.download(current.require(), id, attachmentId));
        }
    }

    @Path("/v1/products")
    @Produces(MediaType.APPLICATION_JSON)
    @Tag(name = "Produtos")
    public static class ProductResource {
        @Inject CurrentActor current;
        @Inject ProductService products;

        @GET
        public Page<ProductView> list(@QueryParam("organizationId") UUID organizationId, @QueryParam("page") @DefaultValue("0") @Min(0) int page, @QueryParam("size") @DefaultValue("25") @Min(1) @Max(100) int size) {
            return products.list(current.require(), organizationId, page, size);
        }

        @POST public ProductView create(@Valid ProductInput input) { return products.create(current.require(), input); }

        @PATCH @Path("/{id}") public ProductView update(@PathParam("id") UUID id, @Valid ProductPatch patch) { return products.update(current.require(), id, patch); }
    }
}
