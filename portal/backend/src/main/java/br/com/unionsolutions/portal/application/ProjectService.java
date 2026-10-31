package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.application.Dtos.*;
import br.com.unionsolutions.portal.domain.*;
import br.com.unionsolutions.portal.domain.Types.*;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class ProjectService {
    @Inject AccessPolicy policy;
    @Inject AuditService audit;

    @Transactional
    public Page<ProjectSummary> list(Actor actor, ProjectStatus status, UUID organizationId, String q, int page, int size) {
        Listing<Project> listing = new Listing<>(Project.class, "p").scope(policy.projectScope(actor, "p"), actor).orderBy("p.updatedAt desc");
        if (status != null) listing.where("p.status = :status", "status", status);
        else listing.where("p.status <> :archived", "archived", ProjectStatus.ARCHIVED);
        if (organizationId != null) listing.where("p.tenantId = :org", "org", organizationId);
        if (q != null && !q.isBlank()) listing.where("lower(p.name) like :q", "q", "%" + escapeLike(q.toLowerCase()) + "%");
        return listing.page(page, size, ProjectService::summary);
    }

    static String escapeLike(String value) {
        return value.replace("\\", "").replace("%", "").replace("_", "");
    }

    static ProjectSummary summary(Project p) {
        long total = Milestone.count("projectId", p.id);
        long done = Milestone.count("projectId = ?1 and status = ?2", p.id, MilestoneStatus.DONE);
        return new ProjectSummary(p.id, p.tenantId, Names.organization(p.tenantId), p.name, p.serviceLine, p.status, p.dueDate, done, total, p.updatedAt);
    }

    @Transactional
    public ProjectDetail get(Actor actor, UUID id) {
        return detail(actor, policy.requireProject(actor, id));
    }

    private ProjectDetail detail(Actor actor, Project p) {
        List<MemberView> members = ProjectMember.<ProjectMember>list("projectId", p.id).stream().map(m -> {
            AppUser user = AppUser.findById(m.userId);
            return new MemberView(user.id, user.displayName, user.email, user.role, m.responsibility, m.canApprove);
        }).toList();
        List<MilestoneView> milestones = Milestone.<Milestone>list("projectId = ?1 order by position, createdAt", p.id).stream().map(ProjectService::view).toList();
        List<UpdateView> updates = ProjectUpdate.<ProjectUpdate>list("projectId = ?1 order by createdAt desc", p.id).stream()
                .map(u -> new UpdateView(u.id, u.body, Names.user(u.authorId), u.createdAt)).toList();
        return new ProjectDetail(p.id, p.tenantId, Names.organization(p.tenantId), p.name, p.description, p.agreedScope, p.serviceLine, p.status, p.startDate, p.dueDate, p.version,
                actor.isUnion(), policy.canApprove(actor, p), members, milestones, updates);
    }

    static MilestoneView view(Milestone m) {
        return new MilestoneView(m.id, m.title, m.description, m.status, m.dueDate, m.position, m.completedAt, m.version);
    }

    @Transactional
    public ProjectDetail create(Actor actor, ProjectInput input) {
        policy.requireUnion(actor);
        policy.requireManageTenant(actor, input.organizationId());
        Organization org = Organization.findById(input.organizationId());
        if (org == null || org.status != OrgStatus.ACTIVE) throw ApiException.notFound();
        checkDates(input.startDate(), input.dueDate());
        Project p = new Project();
        p.id = UUID.randomUUID();
        p.tenantId = org.id;
        p.name = input.name().trim();
        p.description = input.description();
        p.agreedScope = input.agreedScope();
        p.serviceLine = input.serviceLine();
        p.status = input.status() == null ? ProjectStatus.PLANNED : input.status();
        p.startDate = input.startDate();
        p.dueDate = input.dueDate();
        p.createdBy = actor.id();
        p.createdAt = Instant.now();
        p.updatedAt = p.createdAt;
        p.persist();
        // Quem cria da equipe passa a integrar o projeto, senão perderia o acesso a ele.
        if (actor.isUnionStaff()) addMember(p, actor.id(), "Responsável", false);
        audit.record(actor, "PROJECT_CREATED", "project", p.id, p.tenantId, p.id, p.name, true);
        return detail(actor, p);
    }

    private static void checkDates(java.time.LocalDate start, java.time.LocalDate due) {
        if (start != null && due != null && start.isAfter(due)) throw ApiException.badRequest("INVALID_DATES", "A data de início deve ser anterior à data prevista.");
    }

    @Transactional
    public ProjectDetail update(Actor actor, UUID id, ProjectPatch patch) {
        Project p = policy.requireManageProject(actor, id);
        if (p.version != patch.version()) throw ApiException.conflict("STALE_VERSION", "Este projeto foi alterado por outra pessoa. Recarregue a página.");
        if (patch.name() != null) p.name = patch.name().trim();
        if (patch.description() != null) p.description = patch.description();
        if (patch.agreedScope() != null) p.agreedScope = patch.agreedScope();
        if (patch.serviceLine() != null) p.serviceLine = patch.serviceLine();
        if (patch.startDate() != null) p.startDate = patch.startDate();
        if (patch.dueDate() != null) p.dueDate = patch.dueDate();
        checkDates(p.startDate, p.dueDate);
        if (patch.status() != null && patch.status() != p.status) {
            p.status = patch.status();
            audit.record(actor, "PROJECT_STATUS_CHANGED", "project", p.id, p.tenantId, p.id, "Situação " + p.status, true);
        }
        p.updatedAt = Instant.now();
        return detail(actor, p);
    }

    // ---------- Participantes ----------

    @Transactional
    public ProjectDetail setMember(Actor actor, UUID projectId, UUID userId, MemberInput input) {
        Project p = requireManageMembers(actor, projectId);
        AppUser user = AppUser.findById(userId);
        boolean sameOrg = user != null && p.tenantId.equals(user.tenantId);
        boolean unionUser = user != null && user.role == Role.UNION_STAFF;
        if (!sameOrg && !(unionUser && actor.isUnionAdmin())) throw ApiException.badRequest("INVALID_USER", "Selecione uma pessoa da organização deste projeto.");
        if (unionUser && input.canApprove()) throw ApiException.badRequest("INVALID_APPROVER", "Somente pessoas do cliente aprovam entregas.");
        ProjectMember member = ProjectMember.find("projectId = ?1 and userId = ?2", projectId, userId).firstResult();
        if (member == null) {
            member = addMember(p, userId, input.responsibility(), input.canApprove());
        } else {
            member.responsibility = input.responsibility();
            member.canApprove = input.canApprove();
        }
        audit.record(actor, "PROJECT_MEMBER_SET", "project", p.id, p.tenantId, p.id, user.email + (input.canApprove() ? " (aprova)" : ""), false);
        return detail(actor, p);
    }

    private ProjectMember addMember(Project p, UUID userId, String responsibility, boolean canApprove) {
        ProjectMember member = new ProjectMember();
        member.projectId = p.id;
        member.userId = userId;
        member.tenantId = p.tenantId;
        member.responsibility = responsibility;
        member.canApprove = canApprove;
        member.createdAt = Instant.now();
        member.persist();
        return member;
    }

    @Transactional
    public ProjectDetail removeMember(Actor actor, UUID projectId, UUID userId) {
        Project p = requireManageMembers(actor, projectId);
        if (ProjectMember.delete("projectId = ?1 and userId = ?2", projectId, userId) > 0) {
            audit.record(actor, "PROJECT_MEMBER_REMOVED", "project", p.id, p.tenantId, p.id, null, false);
        }
        return detail(actor, p);
    }

    /** Administrador do cliente associa pessoas da própria organização; a equipe opera os projetos que integra. */
    private Project requireManageMembers(Actor actor, UUID projectId) {
        Project p = policy.requireProject(actor, projectId);
        if (actor.isClientMember()) throw ApiException.forbidden();
        return p;
    }

    // ---------- Etapas e atualizações ----------

    @Transactional
    public MilestoneView addMilestone(Actor actor, UUID projectId, MilestoneInput input) {
        Project p = policy.requireManageProject(actor, projectId);
        Milestone m = new Milestone();
        m.id = UUID.randomUUID();
        m.tenantId = p.tenantId;
        m.projectId = p.id;
        m.title = input.title().trim();
        m.description = input.description();
        m.status = input.status() == null ? MilestoneStatus.PENDING : input.status();
        m.dueDate = input.dueDate();
        m.position = input.position() != null ? input.position() : (int) Milestone.count("projectId", p.id);
        m.completedAt = m.status == MilestoneStatus.DONE ? Instant.now() : null;
        m.createdAt = Instant.now();
        m.updatedAt = m.createdAt;
        m.persist();
        audit.record(actor, "MILESTONE_CREATED", "milestone", m.id, p.tenantId, p.id, m.title, true);
        touch(p);
        return view(m);
    }

    @Transactional
    public MilestoneView updateMilestone(Actor actor, UUID projectId, UUID milestoneId, MilestoneInput input) {
        Project p = policy.requireManageProject(actor, projectId);
        Milestone m = Milestone.findById(milestoneId);
        if (m == null || !m.projectId.equals(p.id)) throw ApiException.notFound();
        if (input.version() != null && m.version != input.version()) throw ApiException.conflict("STALE_VERSION", "Esta etapa foi alterada por outra pessoa. Recarregue a página.");
        m.title = input.title().trim();
        m.description = input.description();
        m.dueDate = input.dueDate();
        if (input.position() != null) m.position = input.position();
        if (input.status() != null && input.status() != m.status) {
            m.status = input.status();
            m.completedAt = m.status == MilestoneStatus.DONE ? Instant.now() : null;
            audit.record(actor, "MILESTONE_STATUS_CHANGED", "milestone", m.id, p.tenantId, p.id, m.title + ": " + m.status, true);
        }
        m.updatedAt = Instant.now();
        touch(p);
        return view(m);
    }

    @Transactional
    public UpdateView addUpdate(Actor actor, UUID projectId, UpdateInput input) {
        Project p = policy.requireManageProject(actor, projectId);
        ProjectUpdate update = new ProjectUpdate();
        update.id = UUID.randomUUID();
        update.tenantId = p.tenantId;
        update.projectId = p.id;
        update.authorId = actor.id();
        update.body = input.body().trim();
        update.createdAt = Instant.now();
        update.persist();
        audit.record(actor, "PROJECT_UPDATE_PUBLISHED", "project", p.id, p.tenantId, p.id, "Nova atualização do projeto", true);
        touch(p);
        return new UpdateView(update.id, update.body, Names.user(actor.id()), update.createdAt);
    }

    private static void touch(Project p) {
        p.updatedAt = Instant.now();
    }
}
