package br.com.unionsolutions.portal.infrastructure.rest;

import br.com.unionsolutions.portal.application.*;
import br.com.unionsolutions.portal.application.Dtos.*;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import java.util.List;
import java.util.UUID;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

/** Sessão, organizações, usuários, convites e auditoria. */
public final class AccountResources {
    private AccountResources() {}

    @Path("/v1/me")
    @Produces(MediaType.APPLICATION_JSON)
    @Tag(name = "Sessão")
    public static class MeResource {
        @Inject CurrentActor current;
        @Inject AccountService accounts;

        @GET public Me me() { return accounts.me(current.require()); }
    }

    @Path("/v1/public/invitations")
    @Produces(MediaType.APPLICATION_JSON)
    @Tag(name = "Convites")
    public static class PublicInvitationResource {
        @Inject InvitationService invitations;

        private static String ip(String header) {
            return header == null || header.isBlank() ? "desconhecido" : header;
        }

        @POST @Path("/inspect")
        public InvitationPreview inspect(@Valid TokenInput input, @HeaderParam("X-Portal-Client-Ip") String clientIp) {
            return invitations.inspect(input.token(), ip(clientIp));
        }

        @POST @Path("/setup-access")
        public void setup(@Valid TokenInput input, @HeaderParam("X-Portal-Client-Ip") String clientIp) {
            invitations.setupAccess(input.token(), ip(clientIp));
        }
    }

    @Path("/v1/invitations")
    @Produces(MediaType.APPLICATION_JSON)
    @Tag(name = "Convites")
    public static class InvitationResource {
        @Inject CurrentActor current;
        @Inject InvitationService invitations;

        @GET
        public Page<InvitationView> list(@QueryParam("organizationId") UUID organizationId, @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                         @QueryParam("size") @DefaultValue("25") @Min(1) @Max(100) int size) {
            return invitations.list(current.require(), organizationId, page, size);
        }

        @POST
        public InvitationView create(@Valid InvitationInput input) {
            return invitations.create(current.require(), input);
        }

        @DELETE @Path("/{id}")
        public void revoke(@PathParam("id") UUID id) {
            invitations.revoke(current.require(), id);
        }

        /** Único endpoint autenticado que dispensa conta ativa: é ele que cria o vínculo. */
        @POST @Path("/accept")
        public void accept(@Valid TokenInput input) {
            invitations.accept(input.token(), current.subject(), current.verifiedEmail(), current.tokenName());
        }
    }

    @Path("/v1/organizations")
    @Produces(MediaType.APPLICATION_JSON)
    @Tag(name = "Administração")
    public static class OrganizationResource {
        @Inject CurrentActor current;
        @Inject AccountService accounts;

        @GET
        public Page<OrganizationView> list(@QueryParam("page") @DefaultValue("0") @Min(0) int page, @QueryParam("size") @DefaultValue("50") @Min(1) @Max(100) int size) {
            return accounts.listOrganizations(current.require(), page, size);
        }

        @GET @Path("/{id}")
        public OrganizationView get(@PathParam("id") UUID id) { return accounts.getOrganization(current.require(), id); }

        @POST
        public OrganizationView create(@Valid OrganizationInput input) { return accounts.createOrganization(current.require(), input); }

        @PATCH @Path("/{id}")
        public OrganizationView update(@PathParam("id") UUID id, @Valid OrganizationPatch patch) { return accounts.updateOrganization(current.require(), id, patch); }

        @GET @Path("/{id}/staff")
        public List<StaffView> staff(@PathParam("id") UUID id) { return accounts.listStaff(current.require(), id); }

        @PUT @Path("/{id}/staff/{userId}")
        public void assign(@PathParam("id") UUID id, @PathParam("userId") UUID userId) { accounts.assignStaff(current.require(), id, userId); }

        @DELETE @Path("/{id}/staff/{userId}")
        public void unassign(@PathParam("id") UUID id, @PathParam("userId") UUID userId) { accounts.unassignStaff(current.require(), id, userId); }
    }

    @Path("/v1/users")
    @Produces(MediaType.APPLICATION_JSON)
    @Tag(name = "Administração")
    public static class UserResource {
        @Inject CurrentActor current;
        @Inject AccountService accounts;

        @GET
        public Page<UserView> list(@QueryParam("organizationId") UUID organizationId, @QueryParam("scope") String scope, @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                   @QueryParam("size") @DefaultValue("50") @Min(1) @Max(100) int size) {
            return accounts.listUsers(current.require(), organizationId, scope, page, size);
        }

        @POST @Path("/{id}/disable")
        public IdentityResult disable(@PathParam("id") UUID id) { return accounts.setStatus(current.require(), id, false); }

        @POST @Path("/{id}/enable")
        public IdentityResult enable(@PathParam("id") UUID id) { return accounts.setStatus(current.require(), id, true); }

        @PUT @Path("/{id}/role")
        public UserView role(@PathParam("id") UUID id, @Valid RoleChange change) { return accounts.changeRole(current.require(), id, change.role()); }
    }

    @Path("/v1/audit")
    @Produces(MediaType.APPLICATION_JSON)
    @Tag(name = "Administração")
    public static class AuditResource {
        @Inject CurrentActor current;
        @Inject DashboardService dashboard;

        @GET
        public Page<AuditView> list(@QueryParam("organizationId") UUID organizationId, @QueryParam("action") String action, @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                    @QueryParam("size") @DefaultValue("50") @Min(1) @Max(100) int size) {
            return dashboard.audit(current.require(), organizationId, action, page, size);
        }
    }

    @Path("/v1/dashboard")
    @Produces(MediaType.APPLICATION_JSON)
    @Tag(name = "Painel")
    public static class DashboardResource {
        @Inject CurrentActor current;
        @Inject DashboardService dashboard;

        @GET public Dashboard get() { return dashboard.dashboard(current.require()); }
    }
}
