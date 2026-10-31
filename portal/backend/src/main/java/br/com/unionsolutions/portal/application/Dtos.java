package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.domain.Types.*;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Contratos da API. Registros fechados: campos desconhecidos são recusados, o que impede mass assignment. */
public final class Dtos {
    private Dtos() {}

    public record Page<T>(List<T> items, int page, int size, long total) {}

    // ---------- Sessão ----------
    public record OrganizationRef(UUID id, String name) {}
    public record Me(UUID id, String email, String name, Role role, OrganizationRef organization, boolean demo, boolean canInvite, boolean canManage) {}

    // ---------- Organizações e usuários ----------
    public record OrganizationInput(@NotBlank @Size(max = 160) String name, @Size(max = 200) String legalName) {}
    public record OrganizationView(UUID id, String name, String legalName, OrgStatus status, boolean demo, long users, long projects, long version, Instant createdAt) {}
    public record OrganizationPatch(@Size(min = 1, max = 160) String name, @Size(max = 200) String legalName, OrgStatus status, @NotNull Long version) {}
    public record UserView(UUID id, String email, String name, Role role, UUID tenantId, String organizationName, UserStatus status, Instant createdAt) {}
    public record RoleChange(@NotNull Role role) {}
    public record IdentityResult(UserView user, boolean identityUpdated) {}
    public record StaffView(UUID userId, String email, String name) {}

    // ---------- Convites ----------
    public record InvitationInput(@NotBlank @Email @Size(max = 254) String email, @NotNull Role role, UUID organizationId) {}
    public record InvitationView(UUID id, String email, Role role, UUID tenantId, String organizationName, String state, Instant expiresAt, Instant createdAt) {}
    public record TokenInput(@NotBlank @Size(min = 20, max = 200) String token) {}
    public record InvitationPreview(String organizationName, Role role, String emailHint, Instant expiresAt) {}

    // ---------- Projetos ----------
    public record ProjectInput(@NotNull UUID organizationId, @NotBlank @Size(max = 200) String name, @Size(max = 4000) String description,
                               @Size(max = 8000) String agreedScope, @NotNull ServiceLine serviceLine, ProjectStatus status,
                               LocalDate startDate, LocalDate dueDate) {}
    public record ProjectPatch(@Size(min = 1, max = 200) String name, @Size(max = 4000) String description, @Size(max = 8000) String agreedScope,
                               ServiceLine serviceLine, ProjectStatus status, LocalDate startDate, LocalDate dueDate, @NotNull Long version) {}
    public record ProjectSummary(UUID id, UUID tenantId, String organizationName, String name, ServiceLine serviceLine, ProjectStatus status,
                                 LocalDate dueDate, long milestonesDone, long milestonesTotal, Instant updatedAt) {}
    public record ProjectDetail(UUID id, UUID tenantId, String organizationName, String name, String description, String agreedScope, ServiceLine serviceLine,
                                ProjectStatus status, LocalDate startDate, LocalDate dueDate, long version, boolean canManage, boolean canApprove,
                                List<MemberView> members, List<MilestoneView> milestones, List<UpdateView> updates) {}
    public record MemberInput(@Size(max = 120) String responsibility, boolean canApprove) {}
    public record MemberView(UUID userId, String name, String email, Role role, String responsibility, boolean canApprove) {}
    public record MilestoneInput(@NotBlank @Size(max = 200) String title, @Size(max = 2000) String description, MilestoneStatus status, LocalDate dueDate, Integer position, Long version) {}
    public record MilestoneView(UUID id, String title, String description, MilestoneStatus status, LocalDate dueDate, int position, Instant completedAt, long version) {}
    public record UpdateInput(@NotBlank @Size(max = 4000) String body) {}
    public record UpdateView(UUID id, String body, String authorName, Instant createdAt) {}

    // ---------- Arquivos e documentos ----------
    public record FileView(UUID id, String name, String mediaType, long sizeBytes, ScanStatus scanStatus, boolean downloadable) {}
    public record DocumentVersionView(UUID id, int versionNo, FileView file, String authorName, String note, Instant createdAt) {}
    public record DocumentView(UUID id, UUID tenantId, UUID projectId, String projectName, String title, DocCategory category, DocVisibility visibility,
                               RecordStatus status, int currentVersion, String authorName, Instant createdAt, DocumentVersionView latest, long version) {}
    public record DocumentDetail(DocumentView document, List<DocumentVersionView> versions) {}
    public record DocumentPatch(@Size(min = 1, max = 200) String title, DocCategory category, DocVisibility visibility, RecordStatus status, @NotNull Long version) {}

    // ---------- Entregas ----------
    public record DeliveryInput(@NotBlank @Size(max = 200) String title, @NotBlank @Size(max = 8000) String description, LocalDate dueDate,
                                @Size(max = 20) List<@NotNull UUID> documentVersionIds) {}
    public record DeliveryVersionInput(@NotBlank @Size(max = 8000) String description, @Size(max = 20) List<@NotNull UUID> documentVersionIds) {}
    public record DecisionInput(@NotNull Decision decision, @Size(max = 4000) String comment) {}
    public record DecisionView(Decision decision, String comment, String decidedByName, Instant decidedAt) {}
    public record DeliveryVersionView(UUID id, int versionNo, String description, DeliveryVersionStatus status, String publishedByName, Instant publishedAt,
                                      Instant approvalRequestedAt, DecisionView decision, List<DocumentVersionLink> documents) {}
    public record DocumentVersionLink(UUID documentId, UUID documentVersionId, String title, int versionNo, boolean available, boolean downloadable) {}
    public record DeliverySummary(UUID id, UUID projectId, String projectName, String title, LocalDate dueDate, int currentVersion, DeliveryVersionStatus currentStatus, Instant updatedAt) {}
    public record DeliveryDetail(UUID id, UUID projectId, String projectName, String title, LocalDate dueDate, int currentVersion, boolean canManage, boolean canApprove,
                                 List<DeliveryVersionView> versions) {}
    public record PendingApproval(UUID deliveryId, UUID deliveryVersionId, UUID projectId, String projectName, String title, int versionNo, Instant requestedAt) {}

    // ---------- Suporte ----------
    public record TicketInput(UUID organizationId, UUID projectId, @NotBlank @Size(max = 200) String subject, @NotBlank @Size(max = 8000) String description,
                              @NotNull TicketCategory category, @NotNull TicketPriority priority) {}
    public record TicketPatch(TicketStatus status, TicketPriority priority, UUID assigneeId, Instant slaDueAt, @NotNull Long version) {}
    public record TicketSummary(UUID id, UUID tenantId, String organizationName, UUID projectId, String projectName, String subject, TicketCategory category, TicketPriority priority,
                                TicketStatus status, Instant slaDueAt, Instant createdAt, Instant updatedAt) {}
    public record CommentInput(@NotBlank @Size(max = 8000) String body, boolean internal) {}
    public record CommentView(UUID id, String body, boolean internal, String authorName, boolean fromUnion, Instant createdAt) {}
    public record AttachmentView(UUID id, FileView file, boolean internal, Instant createdAt) {}
    public record TicketDetail(TicketSummary ticket, String description, String openedByName, String assigneeName, UUID assigneeId, long version, boolean canManage,
                               List<CommentView> comments, List<AttachmentView> attachments) {}

    // ---------- Produtos ----------
    public record ProductInput(@NotNull UUID organizationId, @NotBlank @Size(max = 160) String productName, @NotNull ProductStatus commercialStatus,
                               @Size(max = 500) String accessUrl, @Size(max = 4000) String supportNotes, @Size(max = 500) String slaNote,
                               @Size(max = 20) List<@NotNull UUID> documentIds) {}
    public record ProductPatch(@Size(min = 1, max = 160) String productName, ProductStatus commercialStatus, @Size(max = 500) String accessUrl, @Size(max = 4000) String supportNotes,
                               @Size(max = 500) String slaNote, @Size(max = 20) List<@NotNull UUID> documentIds, Boolean archived, @NotNull Long version) {}
    public record ProductView(UUID id, UUID tenantId, String organizationName, String productName, ProductStatus commercialStatus, String accessUrl, String supportNotes, String slaNote,
                              boolean archived, List<DocumentRef> documents, long version, boolean canManage) {}
    public record DocumentRef(UUID id, String title, UUID latestVersionId, boolean downloadable) {}

    // ---------- Painel ----------
    public record UpcomingItem(String kind, UUID id, UUID projectId, String title, String projectName, LocalDate dueDate) {}
    public record ActivityItem(String action, String summary, UUID projectId, String projectName, Instant createdAt) {}
    public record Dashboard(List<ProjectSummary> activeProjects, List<UpcomingItem> upcoming, List<PendingApproval> pendingApprovals, List<TicketSummary> openTickets, List<ActivityItem> activity) {}

    // ---------- Auditoria ----------
    public record AuditView(UUID id, UUID tenantId, String organizationName, UUID actorId, String actorEmail, String action, String resourceType, UUID resourceId, UUID projectId,
                            String summary, String correlationId, Instant createdAt) {}
}
