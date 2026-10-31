package br.com.unionsolutions.portal.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import br.com.unionsolutions.portal.domain.Types.*;

@Entity
@Table(name = "organization")
public class Organization extends PanacheEntityBase {
    @Id public UUID id;
    public String name;
    @Column(name = "legal_name") public String legalName;
    @Enumerated(EnumType.STRING) public OrgStatus status;
    @Column(name = "is_demo") public boolean demo;
    @Column(name = "created_at") public Instant createdAt;
    @Column(name = "updated_at") public Instant updatedAt;
    @Version public long version;
}
