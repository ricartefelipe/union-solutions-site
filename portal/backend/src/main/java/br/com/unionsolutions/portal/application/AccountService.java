package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.application.Dtos.*;
import br.com.unionsolutions.portal.domain.*;
import br.com.unionsolutions.portal.domain.Types.*;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/** Organizações, usuários e associações da equipe. */
@ApplicationScoped
public class AccountService {
    @Inject AccessPolicy policy;
    @Inject AuditService audit;
    @Inject Ports.IdentityProvider identity;
    @Inject EntityManager em;
    @ConfigProperty(name = "portal.demo.enabled") boolean demo;

    @Transactional
    public Me me(Actor actor) {
        OrganizationRef org = actor.tenantId() == null ? null : new OrganizationRef(actor.tenantId(), Names.organization(actor.tenantId()));
        return new Me(actor.id(), actor.email(), actor.name(), actor.role(), org, demo, actor.isUnionAdmin() || actor.isClientAdmin(), actor.isUnion());
    }

    // ---------- Organizações ----------

    @Transactional
    public Page<OrganizationView> listOrganizations(Actor actor, int page, int size) {
        policy.requireUnion(actor);
        Listing<Organization> listing = new Listing<>(Organization.class, "o").orderBy("lower(o.name)");
        if (actor.isUnionStaff()) {
            listing.where("exists (select 1 from StaffAssignment a where a.tenantId = o.id and a.userId = :actorId)", "actorId", actor.id());
        }
        return listing.page(page, size, this::view);
    }

    @Transactional
    public OrganizationView getOrganization(Actor actor, UUID id) {
        policy.requireUnion(actor);
        Organization org = Organization.findById(id);
        if (org == null || !policy.canReachTenant(actor, id)) throw ApiException.notFound();
        return view(org);
    }

    @Transactional
    public OrganizationView createOrganization(Actor actor, OrganizationInput input) {
        policy.requireUnionAdmin(actor);
        String name = input.name().trim();
        if (Organization.count("lower(name)", name.toLowerCase()) > 0) throw ApiException.conflict("ORGANIZATION_EXISTS", "Já existe uma organização com este nome.");
        Organization org = new Organization();
        org.id = UUID.randomUUID();
        org.name = name;
        org.legalName = input.legalName();
        org.status = OrgStatus.ACTIVE;
        org.createdAt = Instant.now();
        org.updatedAt = org.createdAt;
        org.persist();
        audit.record(actor, "ORGANIZATION_CREATED", "organization", org.id, org.id, null, org.name, false);
        return view(org);
    }

    @Transactional
    public OrganizationView updateOrganization(Actor actor, UUID id, OrganizationPatch patch) {
        policy.requireUnionAdmin(actor);
        Organization org = Organization.findById(id);
        if (org == null) throw ApiException.notFound();
        if (org.version != patch.version()) throw ApiException.conflict("STALE_VERSION", "Este registro foi alterado por outra pessoa. Recarregue a página.");
        if (patch.name() != null) org.name = patch.name().trim();
        if (patch.legalName() != null) org.legalName = patch.legalName();
        if (patch.status() != null && patch.status() != org.status) {
            org.status = patch.status();
            audit.record(actor, "ORGANIZATION_STATUS_CHANGED", "organization", org.id, org.id, null, "Situação " + org.status, false);
        }
        org.updatedAt = Instant.now();
        audit.record(actor, "ORGANIZATION_UPDATED", "organization", org.id, org.id, null, null, false);
        return view(org);
    }

    private OrganizationView view(Organization o) {
        return new OrganizationView(o.id, o.name, o.legalName, o.status, o.demo, AppUser.count("tenantId", o.id), Project.count("tenantId", o.id), o.version, o.createdAt);
    }

    // ---------- Associação da equipe a clientes ----------

    @Transactional
    public List<StaffView> listStaff(Actor actor, UUID tenantId) {
        policy.requireUnionAdmin(actor);
        return StaffAssignment.<StaffAssignment>list("tenantId", tenantId).stream().map(a -> {
            AppUser user = AppUser.findById(a.userId);
            return new StaffView(user.id, user.email, user.displayName);
        }).toList();
    }

    @Transactional
    public void assignStaff(Actor actor, UUID tenantId, UUID userId) {
        policy.requireUnionAdmin(actor);
        if (Organization.findById(tenantId) == null) throw ApiException.notFound();
        AppUser user = AppUser.findById(userId);
        if (user == null || user.role != Role.UNION_STAFF) throw ApiException.badRequest("INVALID_USER", "Selecione um profissional da equipe Union.");
        if (!policy.isAssigned(tenantId, userId)) {
            StaffAssignment assignment = new StaffAssignment();
            assignment.tenantId = tenantId;
            assignment.userId = userId;
            assignment.assignedBy = actor.id();
            assignment.createdAt = Instant.now();
            assignment.persist();
            audit.record(actor, "STAFF_ASSIGNED", "organization", tenantId, tenantId, null, user.email, false);
        }
    }

    @Transactional
    public void unassignStaff(Actor actor, UUID tenantId, UUID userId) {
        policy.requireUnionAdmin(actor);
        long removed = StaffAssignment.delete("tenantId = ?1 and userId = ?2", tenantId, userId);
        if (removed > 0) audit.record(actor, "STAFF_UNASSIGNED", "organization", tenantId, tenantId, null, null, false);
    }

    // ---------- Usuários ----------

    @Transactional
    public Page<UserView> listUsers(Actor actor, UUID organizationId, String roleScope, int page, int size) {
        Listing<AppUser> listing = new Listing<>(AppUser.class, "u").orderBy("u.email");
        if (actor.isClientAdmin()) {
            listing.where("u.tenantId = :tenant", "tenant", actor.tenantId());
        } else if (actor.isUnionAdmin()) {
            if (organizationId != null) listing.where("u.tenantId = :tenant", "tenant", organizationId);
            if ("UNION".equals(roleScope)) listing.where("u.tenantId is null");
        } else if (actor.isUnionStaff() && organizationId != null && policy.isAssigned(organizationId, actor.id())) {
            listing.where("u.tenantId = :tenant", "tenant", organizationId);
        } else {
            throw ApiException.forbidden();
        }
        return listing.page(page, size, AccountService::view);
    }

    @Transactional
    public IdentityResult setStatus(Actor actor, UUID userId, boolean active) {
        AppUser user = requireManageableUser(actor, userId);
        if (user.id.equals(actor.id())) throw ApiException.badRequest("SELF_CHANGE", "Você não pode alterar a situação da sua própria conta.");
        UserStatus target = active ? UserStatus.ACTIVE : UserStatus.DISABLED;
        if (!active && user.role == Role.UNION_ADMIN) user = serializeAdminChange(actor, userId);
        if (!active && user.role == Role.UNION_ADMIN && user.status == UserStatus.ACTIVE && otherActiveAdmins(user.id) == 0) {
            throw ApiException.conflict("LAST_ADMIN", "É preciso manter ao menos um administrador ativo.");
        }
        boolean identityUpdated = true;
        if (user.status != target) {
            user.status = target;
            user.disabledAt = active ? null : Instant.now();
            user.updatedAt = Instant.now();
            audit.record(actor, active ? "USER_ENABLED" : "USER_DISABLED", "user", user.id, user.tenantId, null, null, false);
            // O portal bloqueia na próxima requisição mesmo que o provedor esteja indisponível.
            if (user.keycloakSub != null) identityUpdated = active ? identity.enable(user.keycloakSub) : identity.disable(user.keycloakSub);
        }
        return new IdentityResult(view(user), identityUpdated);
    }

    @Transactional
    public UserView changeRole(Actor actor, UUID userId, Role role) {
        AppUser user = requireManageableUser(actor, userId);
        if (user.id.equals(actor.id())) throw ApiException.badRequest("SELF_CHANGE", "Você não pode alterar o próprio papel.");
        // O tipo de conta não muda: cliente continua cliente e equipe continua equipe, no mesmo tenant.
        if (role.isUnion() != user.role.isUnion()) throw ApiException.forbidden();
        if (role.isUnion() && !actor.isUnionAdmin()) throw ApiException.forbidden();
        if (user.role == Role.UNION_ADMIN || role == Role.UNION_ADMIN) user = serializeAdminChange(actor, userId);
        if (user.role == Role.UNION_ADMIN && role != Role.UNION_ADMIN && user.status == UserStatus.ACTIVE && otherActiveAdmins(user.id) == 0) {
            throw ApiException.conflict("LAST_ADMIN", "É preciso manter ao menos um administrador ativo.");
        }
        if (user.role != role) {
            audit.record(actor, "USER_ROLE_CHANGED", "user", user.id, user.tenantId, null, user.role + " para " + role, false);
            user.role = role;
            user.updatedAt = Instant.now();
        }
        return view(user);
    }

    /**
     * Alterações no conjunto de administradores da Union passam uma por vez, até o fim da transação (advisory lock transacional).
     * Depois de obter a vez, o usuário é relido e a autorização, reconferida: o que valia antes da espera pode ter mudado.
     */
    private AppUser serializeAdminChange(Actor actor, UUID userId) {
        em.createNativeQuery("SELECT pg_advisory_xact_lock(hashtext('union-admins'))").getSingleResult();
        em.clear();
        // Quem pede também pode ter sido desativado ou rebaixado enquanto esperava a vez.
        AppUser requester = AppUser.findById(actor.id());
        if (requester == null || requester.status != UserStatus.ACTIVE) throw ApiException.noAccess();
        if (requester.role != actor.role()) throw ApiException.forbidden();
        return requireManageableUser(actor, userId);
    }

    private long otherActiveAdmins(UUID userId) {
        return AppUser.count("role = ?1 and status = ?2 and id <> ?3", Role.UNION_ADMIN, UserStatus.ACTIVE, userId);
    }

    private AppUser requireManageableUser(Actor actor, UUID userId) {
        AppUser user = AppUser.findById(userId);
        if (user == null) throw ApiException.notFound();
        if (actor.isUnionAdmin()) return user;
        if (actor.isClientAdmin() && actor.tenantId().equals(user.tenantId)) return user;
        throw actor.isClient() ? ApiException.notFound() : ApiException.forbidden();
    }

    static UserView view(AppUser u) {
        return new UserView(u.id, u.email, u.displayName, u.role, u.tenantId, Names.organization(u.tenantId), u.status, u.createdAt);
    }
}
