package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import br.com.unionsolutions.portal.domain.Types.*;

@Entity
@Table(name = "project")
public class Project extends PanacheEntityBase {
    @Id public UUID id;
    @Column(name = "tenant_id") public UUID tenantId;
    public String name;
    public String description;
    @Column(name = "agreed_scope") public String agreedScope;
    @Enumerated(EnumType.STRING) @Column(name = "service_line") public ServiceLine serviceLine;
    @Enumerated(EnumType.STRING) public ProjectStatus status;
    @Column(name = "start_date") public LocalDate startDate;
    @Column(name = "due_date") public LocalDate dueDate;
    @Column(name = "created_by") public UUID createdBy;
    @Column(name = "created_at") public Instant createdAt;
    @Column(name = "updated_at") public Instant updatedAt;
    @Version public long version;
}
