package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import br.com.unionsolutions.portal.domain.Types.*;

@Entity
@Table(name = "app_user")
public class AppUser extends PanacheEntityBase {
    @Id public UUID id;
    @Column(name = "keycloak_sub") public String keycloakSub;
    public String email;
    @Column(name = "display_name") public String displayName;
    @Enumerated(EnumType.STRING) public Role role;
    @Column(name = "tenant_id") public UUID tenantId;
    @Enumerated(EnumType.STRING) public UserStatus status;
    @Column(name = "created_at") public Instant createdAt;
    @Column(name = "updated_at") public Instant updatedAt;
    @Column(name = "disabled_at") public Instant disabledAt;
    @Version public long version;
}
