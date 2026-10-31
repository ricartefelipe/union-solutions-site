package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "document_version")
public class DocumentVersion extends PanacheEntityBase {
    @Id public UUID id;
    @Column(name = "tenant_id") public UUID tenantId;
    @Column(name = "document_id") public UUID documentId;
    @Column(name = "version_no") public int versionNo;
    @Column(name = "file_id") public UUID fileId;
    @Column(name = "author_id") public UUID authorId;
    public String note;
    @Column(name = "created_at") public Instant createdAt;
}
