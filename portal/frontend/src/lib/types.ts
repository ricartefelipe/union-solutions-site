export type Role = 'UNION_ADMIN' | 'UNION_STAFF' | 'CLIENT_ADMIN' | 'CLIENT_MEMBER';

export interface Page<T> { items: T[]; page: number; size: number; total: number }
export interface Me { id: string; email: string; name: string | null; role: Role; organization: { id: string; name: string } | null; demo: boolean; canInvite: boolean; canManage: boolean }

export interface OrganizationView { id: string; name: string; legalName: string | null; status: string; demo: boolean; users: number; projects: number; version: number; createdAt: string }
export interface UserView { id: string; email: string; name: string | null; role: Role; tenantId: string | null; organizationName: string | null; status: string; createdAt: string }
export interface StaffView { userId: string; email: string; name: string | null }
export interface InvitationView { id: string; email: string; role: Role; tenantId: string | null; organizationName: string | null; state: string; expiresAt: string; createdAt: string }

export interface ProjectSummary { id: string; tenantId: string; organizationName: string; name: string; serviceLine: string; status: string; dueDate: string | null; milestonesDone: number; milestonesTotal: number; updatedAt: string }
export interface MemberView { userId: string; name: string | null; email: string; role: Role; responsibility: string | null; canApprove: boolean }
export interface MilestoneView { id: string; title: string; description: string | null; status: string; dueDate: string | null; position: number; completedAt: string | null; version: number }
export interface UpdateView { id: string; body: string; authorName: string; createdAt: string }
export interface ProjectDetail { id: string; tenantId: string; organizationName: string; name: string; description: string | null; agreedScope: string | null; serviceLine: string; status: string; startDate: string | null; dueDate: string | null; version: number; canManage: boolean; canApprove: boolean; members: MemberView[]; milestones: MilestoneView[]; updates: UpdateView[] }

export interface FileView { id: string; name: string; mediaType: string; sizeBytes: number; scanStatus: string; downloadable: boolean }
export interface DocumentVersionView { id: string; versionNo: number; file: FileView; authorName: string; note: string | null; createdAt: string }
export interface DocumentView { id: string; tenantId: string; projectId: string | null; projectName: string | null; title: string; category: string; visibility: string; status: string; currentVersion: number; authorName: string; createdAt: string; latest: DocumentVersionView | null; version: number }
export interface DocumentDetail { document: DocumentView; versions: DocumentVersionView[] }

export interface DecisionView { decision: string; comment: string | null; decidedByName: string; decidedAt: string }
export interface DocumentVersionLink { documentId: string | null; documentVersionId: string | null; title: string; versionNo: number; available: boolean; downloadable: boolean }
export interface DeliveryVersionView { id: string; versionNo: number; description: string; status: string; publishedByName: string; publishedAt: string; approvalRequestedAt: string | null; decision: DecisionView | null; documents: DocumentVersionLink[] }
export interface DeliverySummary { id: string; projectId: string; projectName: string; title: string; dueDate: string | null; currentVersion: number; currentStatus: string; updatedAt: string }
export interface DeliveryDetail { id: string; projectId: string; projectName: string; title: string; dueDate: string | null; currentVersion: number; canManage: boolean; canApprove: boolean; versions: DeliveryVersionView[] }
export interface PendingApproval { deliveryId: string; deliveryVersionId: string; projectId: string; projectName: string; title: string; versionNo: number; requestedAt: string }

export interface TicketSummary { id: string; tenantId: string; organizationName: string; projectId: string | null; projectName: string | null; subject: string; category: string; priority: string; status: string; slaDueAt: string | null; createdAt: string; updatedAt: string }
export interface CommentView { id: string; body: string; internal: boolean; authorName: string; fromUnion: boolean; createdAt: string }
export interface AttachmentView { id: string; file: FileView; internal: boolean; createdAt: string }
export interface TicketDetail { ticket: TicketSummary; description: string; openedByName: string; assigneeName: string | null; assigneeId: string | null; version: number; canManage: boolean; comments: CommentView[]; attachments: AttachmentView[] }

export interface DocumentRef { id: string; title: string; latestVersionId: string; downloadable: boolean }
export interface ProductView { id: string; tenantId: string; organizationName: string; productName: string; commercialStatus: string; accessUrl: string | null; supportNotes: string | null; slaNote: string | null; archived: boolean; documents: DocumentRef[]; version: number; canManage: boolean }

export interface UpcomingItem { kind: string; id: string; projectId: string; title: string; projectName: string; dueDate: string }
export interface ActivityItem { action: string; summary: string | null; projectId: string | null; projectName: string | null; createdAt: string }
export interface Dashboard { activeProjects: ProjectSummary[]; upcoming: UpcomingItem[]; pendingApprovals: PendingApproval[]; openTickets: TicketSummary[]; activity: ActivityItem[] }
export interface AuditView { id: string; tenantId: string | null; organizationName: string | null; actorId: string | null; actorEmail: string | null; action: string; resourceType: string; resourceId: string | null; projectId: string | null; summary: string | null; correlationId: string | null; createdAt: string }
