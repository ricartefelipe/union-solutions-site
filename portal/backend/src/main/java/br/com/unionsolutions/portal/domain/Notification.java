package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Aviso dirigido a uma pessoa, gravado junto com o fato que o gerou. */
@Entity
@Table(name = "notification")
public class Notification extends PanacheEntityBase {
    @Id public UUID id;
    @Column(name = "user_id") public UUID userId;
    @Column(name = "tenant_id") public UUID tenantId;
    @Column(name = "project_id") public UUID projectId;
    @Column(name = "resource_type") public String resourceType;
    @Column(name = "resource_id") public UUID resourceId;
    public String kind;
    public String title;
    public String link;
    @Column(name = "created_at") public Instant createdAt;
    @Column(name = "read_at") public Instant readAt;
}
