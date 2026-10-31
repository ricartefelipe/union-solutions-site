package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import br.com.unionsolutions.portal.domain.Types.*;

@Entity
@Table(name = "document")
public class Document extends PanacheEntityBase {
    @Id public UUID id;
    @Column(name = "tenant_id") public UUID tenantId;
    @Column(name = "project_id") public UUID projectId;
    public String title;
    @Enumerated(EnumType.STRING) public DocCategory category;
    @Enumerated(EnumType.STRING) public DocVisibility visibility;
    @Enumerated(EnumType.STRING) public RecordStatus status;
    @Column(name = "current_version") public int currentVersion;
    @Column(name = "created_by") public UUID createdBy;
    @Column(name = "created_at") public Instant createdAt;
    @Column(name = "updated_at") public Instant updatedAt;
    @Version public long version;
}
