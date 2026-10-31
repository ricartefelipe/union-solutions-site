package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Objeto gravado no armazenamento cuja situação no banco ainda não foi decidida. Ver changeset 007. */
@Entity
@Table(name = "object_ledger")
public class ObjectLedger extends PanacheEntityBase {
    public static final String RESERVA = "RESERVA";
    public static final String SOBRA = "SOBRA";

    @Id @Column(name = "object_key") public String objectKey;
    @Column(name = "file_id") public UUID fileId;
    @Column(name = "tenant_id") public UUID tenantId;
    @Column(name = "size_bytes") public long sizeBytes;
    public String kind;
    @Column(name = "created_at") public Instant createdAt;
    public int attempts;
    @Column(name = "last_error") public String lastError;
}
