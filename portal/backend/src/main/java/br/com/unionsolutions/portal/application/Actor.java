package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.domain.Types.Role;
import java.util.UUID;

/** Usuário da requisição, sempre resolvido no servidor a partir do token validado. */
public record Actor(UUID id, String email, String name, Role role, UUID tenantId) {
    public boolean isUnion() { return role.isUnion(); }
    public boolean isUnionAdmin() { return role == Role.UNION_ADMIN; }
    public boolean isUnionStaff() { return role == Role.UNION_STAFF; }
    public boolean isClient() { return role.isClient(); }
    public boolean isClientAdmin() { return role == Role.CLIENT_ADMIN; }
    public boolean isClientMember() { return role == Role.CLIENT_MEMBER; }
}
