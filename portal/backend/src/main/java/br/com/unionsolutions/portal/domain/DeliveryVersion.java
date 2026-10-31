package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import br.com.unionsolutions.portal.domain.Types.*;

@Entity
@Table(name = "delivery_version")
public class DeliveryVersion extends PanacheEntityBase {
    @Id public UUID id;
    @Column(name = "tenant_id") public UUID tenantId;
    @Column(name = "delivery_id") public UUID deliveryId;
    @Column(name = "version_no") public int versionNo;
    public String description;
    @Enumerated(EnumType.STRING) public DeliveryVersionStatus status;
    @Column(name = "published_by") public UUID publishedBy;
    @Column(name = "published_at") public Instant publishedAt;
    @Column(name = "approval_requested_at") public Instant approvalRequestedAt;
    @Column(name = "approval_requested_by") public UUID approvalRequestedBy;
    @Version public long version;
}
