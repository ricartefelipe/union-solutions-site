package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** E-mail aguardando envio, com tentativas e espera crescente. O corpo some depois do envio. */
@Entity
@Table(name = "email_outbox")
public class EmailOutbox extends PanacheEntityBase {
    public static final String PENDING = "PENDING";
    public static final String SENT = "SENT";
    public static final String FAILED = "FAILED";

    @Id public UUID id;
    @Column(name = "user_id") public UUID userId;
    public String recipient;
    public String subject;
    public String body;
    public String status;
    public int attempts;
    @Column(name = "next_attempt_at") public Instant nextAttemptAt;
    @Column(name = "claimed_until") public Instant claimedUntil;
    @Column(name = "created_at") public Instant createdAt;
    @Column(name = "sent_at") public Instant sentAt;
    @Column(name = "last_error") public String lastError;
}
