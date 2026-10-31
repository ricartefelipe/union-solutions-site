package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import br.com.unionsolutions.portal.domain.Types.*;

@Entity
@Table(name = "contracted_product")
public class ContractedProduct extends PanacheEntityBase {
    @Id public UUID id;
    @Column(name = "tenant_id") public UUID tenantId;
    @Column(name = "product_name") public String productName;
    @Enumerated(EnumType.STRING) @Column(name = "commercial_status") public ProductStatus commercialStatus;
    @Column(name = "access_url") public String accessUrl;
    @Column(name = "support_notes") public String supportNotes;
    @Column(name = "sla_note") public String slaNote;
    @Column(name = "archived_at") public Instant archivedAt;
    @Column(name = "created_by") public UUID createdBy;
    @Column(name = "created_at") public Instant createdAt;
    @Column(name = "updated_at") public Instant updatedAt;
    @Version public long version;
}
