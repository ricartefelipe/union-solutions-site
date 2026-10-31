package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "project_member")
@IdClass(ProjectMember.Key.class)
public class ProjectMember extends PanacheEntityBase {
    public record Key(UUID projectId, UUID userId) implements Serializable {
        public Key() { this(null, null); }
    }
    @Id @Column(name = "project_id") public UUID projectId;
    @Id @Column(name = "user_id") public UUID userId;
    @Column(name = "tenant_id") public UUID tenantId;
    @Column(name = "can_approve") public boolean canApprove;
    public String responsibility;
    @Column(name = "created_at") public Instant createdAt;
}
