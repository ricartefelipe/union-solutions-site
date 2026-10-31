package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "ticket_comment")
public class TicketComment extends PanacheEntityBase {
    @Id public UUID id;
    @Column(name = "tenant_id") public UUID tenantId;
    @Column(name = "ticket_id") public UUID ticketId;
    @Column(name = "author_id") public UUID authorId;
    public String body;
    public boolean internal;
    @Column(name = "created_at") public Instant createdAt;
}
