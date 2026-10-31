package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "project_update")
public class ProjectUpdate extends PanacheEntityBase {
    @Id public UUID id;
    @Column(name = "tenant_id") public UUID tenantId;
    @Column(name = "project_id") public UUID projectId;
    @Column(name = "author_id") public UUID authorId;
    public String body;
    @Column(name = "created_at") public Instant createdAt;
}
