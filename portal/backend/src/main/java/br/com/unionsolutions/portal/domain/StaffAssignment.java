package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "staff_assignment")
@IdClass(StaffAssignment.Key.class)
public class StaffAssignment extends PanacheEntityBase {
    public record Key(UUID tenantId, UUID userId) implements Serializable {
        public Key() { this(null, null); }
    }
    @Id @Column(name = "tenant_id") public UUID tenantId;
    @Id @Column(name = "user_id") public UUID userId;
    @Column(name = "assigned_by") public UUID assignedBy;
    @Column(name = "created_at") public Instant createdAt;
}
