package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import br.com.unionsolutions.portal.domain.Types.*;

@Entity
@Table(name = "approval_decision")
public class ApprovalDecision extends PanacheEntityBase {
    @Id public UUID id;
    @Column(name = "tenant_id") public UUID tenantId;
    @Column(name = "delivery_version_id") public UUID deliveryVersionId;
    @Enumerated(EnumType.STRING) public Decision decision;
    public String comment;
    @Column(name = "decided_by") public UUID decidedBy;
    @Column(name = "decided_at") public Instant decidedAt;
}
