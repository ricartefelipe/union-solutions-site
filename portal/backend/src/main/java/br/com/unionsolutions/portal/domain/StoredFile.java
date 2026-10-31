package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import br.com.unionsolutions.portal.domain.Types.*;

@Entity
@Table(name = "stored_file")
public class StoredFile extends PanacheEntityBase {
    @Id public UUID id;
    @Column(name = "tenant_id") public UUID tenantId;
    @Column(name = "object_key") public String objectKey;
    @Column(name = "original_name") public String originalName;
    @Column(name = "media_type") public String mediaType;
    @Column(name = "size_bytes") public long sizeBytes;
    public String sha256;
    @Enumerated(EnumType.STRING) @Column(name = "scan_status") public ScanStatus scanStatus;
    @Column(name = "scan_attempts") public int scanAttempts;
    @Column(name = "scan_claimed_until") public Instant scanClaimedUntil;
    @Column(name = "scan_detail") public String scanDetail;
    @Column(name = "scanned_at") public Instant scannedAt;
    @Column(name = "uploaded_by") public UUID uploadedBy;
    @Column(name = "created_at") public Instant createdAt;
    /** Falso quando o objeto foi apagado do armazenamento. Só então o espaço deixa de contar na cota. */
    @Column(name = "object_present") public boolean objectPresent = true;
}
