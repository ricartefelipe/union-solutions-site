package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import br.com.unionsolutions.portal.domain.Types.*;

@Entity
@Table(name = "ticket")
public class Ticket extends PanacheEntityBase {
    @Id public UUID id;
    @Column(name = "tenant_id") public UUID tenantId;
    @Column(name = "project_id") public UUID projectId;
    public String subject;
    public String description;
    @Enumerated(EnumType.STRING) public TicketCategory category;
    @Enumerated(EnumType.STRING) public TicketPriority priority;
    @Enumerated(EnumType.STRING) public TicketStatus status;
    @Column(name = "opened_by") public UUID openedBy;
    @Column(name = "assignee_id") public UUID assigneeId;
    @Column(name = "sla_due_at") public Instant slaDueAt;
    @Column(name = "created_at") public Instant createdAt;
    @Column(name = "updated_at") public Instant updatedAt;
    @Version public long version;
}
