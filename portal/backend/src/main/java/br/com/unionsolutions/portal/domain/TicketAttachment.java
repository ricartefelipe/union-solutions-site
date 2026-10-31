package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "ticket_attachment")
public class TicketAttachment extends PanacheEntityBase {
    @Id public UUID id;
    @Column(name = "tenant_id") public UUID tenantId;
    @Column(name = "ticket_id") public UUID ticketId;
    @Column(name = "file_id") public UUID fileId;
    public boolean internal;
    @Column(name = "created_at") public Instant createdAt;
}
