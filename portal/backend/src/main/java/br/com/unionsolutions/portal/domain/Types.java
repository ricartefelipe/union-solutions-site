package br.com.unionsolutions.portal.domain;

import java.util.Map;
import java.util.Set;

/** Vocabulário do domínio e as transições de estado que a aplicação aceita. */
public final class Types {
    private Types() {}

    public enum Role {
        UNION_ADMIN, UNION_STAFF, CLIENT_ADMIN, CLIENT_MEMBER;
        public boolean isUnion() { return this == UNION_ADMIN || this == UNION_STAFF; }
        public boolean isClient() { return !isUnion(); }
    }

    public enum UserStatus { ACTIVE, DISABLED }
    public enum OrgStatus { ACTIVE, ARCHIVED }
    public enum RecordStatus { ACTIVE, ARCHIVED }
    public enum ServiceLine { PRODUCT, CONSULTING, ARCHITECTURE, DEVELOPMENT }
    public enum ProjectStatus { PLANNED, ACTIVE, ON_HOLD, COMPLETED, ARCHIVED }
    public enum MilestoneStatus { PENDING, IN_PROGRESS, DONE }
    public enum ScanStatus { PENDING, CLEAN, REJECTED, FAILED }
    public enum DocCategory { PROPOSAL, CONTRACT, DESIGN, REPORT, OTHER }
    /** INTERNAL: só Union. CLIENT_ADMINS: administradores do cliente. PARTICIPANTS: participantes do projeto ou, sem projeto, toda a organização. */
    public enum DocVisibility { INTERNAL, CLIENT_ADMINS, PARTICIPANTS }
    public enum Decision { APPROVED, CHANGES_REQUESTED }
    public enum TicketCategory { QUESTION, INCIDENT, CHANGE, ACCESS, OTHER }
    public enum TicketPriority { LOW, NORMAL, HIGH, URGENT }
    public enum ProductStatus { ACTIVE, IMPLEMENTING, SUSPENDED, ENDED }

    public enum DeliveryVersionStatus {
        PUBLISHED, AWAITING_APPROVAL, APPROVED, CHANGES_REQUESTED, SUPERSEDED;

        private static final Map<DeliveryVersionStatus, Set<DeliveryVersionStatus>> ALLOWED = Map.of(
                PUBLISHED, Set.of(AWAITING_APPROVAL, SUPERSEDED),
                AWAITING_APPROVAL, Set.of(APPROVED, CHANGES_REQUESTED, SUPERSEDED),
                CHANGES_REQUESTED, Set.of(SUPERSEDED),
                APPROVED, Set.of(SUPERSEDED),
                SUPERSEDED, Set.of());

        public boolean canMoveTo(DeliveryVersionStatus next) { return ALLOWED.get(this).contains(next); }
    }

    public enum TicketStatus {
        OPEN, IN_PROGRESS, WAITING_CLIENT, RESOLVED, CLOSED;

        private static final Map<TicketStatus, Set<TicketStatus>> ALLOWED = Map.of(
                OPEN, Set.of(IN_PROGRESS, WAITING_CLIENT, RESOLVED, CLOSED),
                IN_PROGRESS, Set.of(WAITING_CLIENT, RESOLVED, CLOSED),
                WAITING_CLIENT, Set.of(IN_PROGRESS, RESOLVED, CLOSED),
                RESOLVED, Set.of(IN_PROGRESS, CLOSED),
                CLOSED, Set.of());

        public boolean canMoveTo(TicketStatus next) { return ALLOWED.get(this).contains(next); }
        public boolean isOpen() { return this != RESOLVED && this != CLOSED; }
    }
}
