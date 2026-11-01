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

/** Notificações, preferências, fila de e-mails e retenção. */
public final class NotificationResources {
    private NotificationResources() {}

    @Path("/v1/notifications")
    @Produces(MediaType.APPLICATION_JSON)
    @Tag(name = "Notificações")
    public static class NotificationResource {
        @Inject CurrentActor current;
        @Inject NotificationService notifications;

        @GET
        public Page<NotificationView> list(@QueryParam("unread") @DefaultValue("false") boolean unread, @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                           @QueryParam("size") @DefaultValue("25") @Min(1) @Max(100) int size) {
            return notifications.list(current.require(), unread, page, size);
        }

        @GET @Path("/unread-count")
        public UnreadCount unread() { return new UnreadCount(notifications.unread(current.require())); }

        /** Sem ids, marca todas como lidas. */
        @POST @Path("/read")
        public UnreadCount read(ReadInput input) {
            notifications.markRead(current.require(), input == null ? null : input.ids());
            return new UnreadCount(notifications.unread(current.require()));
        }
    }

    @Path("/v1/me/preferences")
    @Produces(MediaType.APPLICATION_JSON)
    @Tag(name = "Sessão")
    public static class PreferencesResource {
        @Inject CurrentActor current;
        @Inject NotificationService notifications;

        @GET public PreferencesView get() { return new PreferencesView(notifications.emailNotifications(current.require())); }

        @PATCH public PreferencesView set(@Valid PreferencesInput input) { return notifications.setPreferences(current.require(), input); }
    }

    @Path("/v1/admin/emails")
    @Produces(MediaType.APPLICATION_JSON)
    @Tag(name = "Administração")
    public static class OutboxResource {
        @Inject CurrentActor current;
        @Inject NotificationService notifications;

        @GET
        public Page<OutboxView> list(@QueryParam("status") String status, @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                     @QueryParam("size") @DefaultValue("25") @Min(1) @Max(100) int size) {
            return notifications.outbox(current.require(), status, page, size);
        }

        @POST @Path("/{id}/retry")
        public OutboxView retry(@PathParam("id") UUID id) { return notifications.retry(current.require(), id); }
    }

    @Path("/v1/admin/retention")
    @Produces(MediaType.APPLICATION_JSON)
    @Tag(name = "Administração")
    public static class RetentionResource {
        @Inject CurrentActor current;
        @Inject RetentionService retention;

        @GET @Path("/simulation")
        public RetentionReport simulation() { return retention.preview(current.require()); }

        @POST @Path("/simulate")
        public RetentionReport simulate() { return retention.simulate(current.require()); }

        @GET @Path("/runs")
        public List<RetentionRunView> runs(@QueryParam("limit") @DefaultValue("20") @Min(1) @Max(50) int limit) { return retention.runs(current.require(), limit); }

        @POST @Path("/execute")
        public RetentionRunView execute() { return retention.execute(current.require()); }
    }
}
