package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.application.Dtos.*;
import br.com.unionsolutions.portal.domain.*;
import br.com.unionsolutions.portal.domain.Types.*;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/** Painel e auditoria. Tudo vem de registros persistidos, dentro do alcance do usuário. */
@ApplicationScoped
public class DashboardService {
    @Inject AccessPolicy policy;
    @Inject DeliveryService deliveries;
    @Inject TicketService tickets;

    @Transactional
    public Dashboard dashboard(Actor actor) {
        List<Project> projects = new Listing<>(Project.class, "p").scope(policy.projectScope(actor, "p"), actor)
                .where("p.status = :active", "active", ProjectStatus.ACTIVE).orderBy("p.updatedAt desc").top(50);
        List<ProjectSummary> active = projects.stream().map(ProjectService::summary).toList();

        List<UpcomingItem> upcoming = new ArrayList<>();
        for (Project p : projects) {
            Milestone.<Milestone>list("projectId = ?1 and status <> ?2 and dueDate is not null order by dueDate", p.id, MilestoneStatus.DONE)
                    .forEach(m -> upcoming.add(new UpcomingItem("MILESTONE", m.id, p.id, m.title, p.name, m.dueDate)));
            Delivery.<Delivery>list("projectId = ?1 and status = ?2 and dueDate is not null order by dueDate", p.id, RecordStatus.ACTIVE).forEach(d -> {
                DeliveryVersion v = DeliveryVersion.find("deliveryId = ?1 and versionNo = ?2", d.id, d.currentVersion).firstResult();
                if (v.status != DeliveryVersionStatus.APPROVED) upcoming.add(new UpcomingItem("DELIVERY", d.id, p.id, d.title, p.name, d.dueDate));
            });
        }
        upcoming.sort(Comparator.comparing(UpcomingItem::dueDate, Comparator.nullsLast(LocalDate::compareTo)));

        List<TicketSummary> open = tickets.visible(actor).where("t.status not in (:closed)", "closed", List.of(TicketStatus.RESOLVED, TicketStatus.CLOSED))
                .orderBy("t.updatedAt desc").top(10).stream().map(TicketService::summary).toList();

        return new Dashboard(active.stream().limit(10).toList(), upcoming.stream().limit(10).toList(), deliveries.pending(actor, 10), open, activity(actor));
    }

    private List<ActivityItem> activity(Actor actor) {
        Listing<AuditEvent> listing = new Listing<>(AuditEvent.class, "e").where("e.visibleToClient = true").orderBy("e.createdAt desc");
        String member = "exists (select 1 from ProjectMember m where m.projectId = e.projectId and m.userId = :actorId)";
        if (actor.isUnionStaff()) {
            listing.where("((e.projectId is not null and " + member + ") or (e.projectId is null and "
                    + "exists (select 1 from StaffAssignment a where a.tenantId = e.tenantId and a.userId = :actorId)))", "actorId", actor.id());
        } else if (actor.isClient()) {
            listing.where("e.tenantId = :tenant", "tenant", actor.tenantId());
            if (actor.isClientMember()) {
                listing.where("((e.projectId is not null and " + member + ") or (e.projectId is null and e.actorId = :actorId))", "actorId", actor.id());
            }
        }
        return listing.top(15).stream().map(e -> new ActivityItem(e.action, e.summary, e.projectId, Names.project(e.projectId), e.createdAt)).toList();
    }

    @Transactional
    public Page<AuditView> audit(Actor actor, UUID organizationId, String action, int page, int size) {
        policy.requireUnionAdmin(actor);
        Listing<AuditEvent> listing = new Listing<>(AuditEvent.class, "e").orderBy("e.createdAt desc");
        if (organizationId != null) listing.where("e.tenantId = :org", "org", organizationId);
        if (action != null && !action.isBlank()) listing.where("e.action = :action", "action", action);
        return listing.page(page, size, e -> {
            AppUser actorUser = e.actorId == null ? null : AppUser.findById(e.actorId);
            return new AuditView(e.id, e.tenantId, Names.organization(e.tenantId), e.actorId, actorUser == null ? null : actorUser.email, e.action, e.resourceType, e.resourceId, e.projectId, e.summary, e.correlationId, e.createdAt);
        });
    }
}
