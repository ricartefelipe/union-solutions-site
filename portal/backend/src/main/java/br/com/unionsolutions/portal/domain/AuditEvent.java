package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "audit_event")
public class AuditEvent extends PanacheEntityBase {
    @Id public UUID id;
    @Column(name = "tenant_id") public UUID tenantId;
    @Column(name = "project_id") public UUID projectId;
    @Column(name = "actor_id") public UUID actorId;
    public String action;
    @Column(name = "resource_type") public String resourceType;
    @Column(name = "resource_id") public UUID resourceId;
    public String summary;
    @Column(name = "visible_to_client") public boolean visibleToClient;
    @Column(name = "correlation_id") public String correlationId;
    @Column(name = "created_at") public Instant createdAt;
}
