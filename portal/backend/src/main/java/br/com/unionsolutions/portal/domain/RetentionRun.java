package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Registro de uma simulação ou execução de retenção. */
@Entity
@Table(name = "retention_run")
public class RetentionRun extends PanacheEntityBase {
    public static final String SIMULATION = "SIMULATION";
    public static final String EXECUTION = "EXECUTION";

    @Id public UUID id;
    public String mode;
    @Column(name = "triggered_by") public UUID triggeredBy;
    @Column(name = "started_at") public Instant startedAt;
    @Column(name = "finished_at") public Instant finishedAt;
    public String summary;
    public int removed;
    public String error;
}
