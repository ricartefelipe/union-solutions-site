package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import br.com.unionsolutions.portal.domain.Types.*;

@Entity
@Table(name = "invitation")
public class Invitation extends PanacheEntityBase {
    @Id public UUID id;
    @Column(name = "tenant_id") public UUID tenantId;
    public String email;
    @Enumerated(EnumType.STRING) public Role role;
    @Column(name = "token_hash") public String tokenHash;
    @Column(name = "expires_at") public Instant expiresAt;
    @Column(name = "accepted_at") public Instant acceptedAt;
    @Column(name = "revoked_at") public Instant revokedAt;
    @Column(name = "invited_by") public UUID invitedBy;
    @Column(name = "accepted_user_id") public UUID acceptedUserId;
    @Column(name = "created_at") public Instant createdAt;
}
