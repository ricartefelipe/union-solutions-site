/** Rótulos em português para os valores da API. */
export const labels = {
  role: { UNION_ADMIN: 'Administração Union', UNION_STAFF: 'Equipe Union', CLIENT_ADMIN: 'Administração do cliente', CLIENT_MEMBER: 'Participante do cliente' },
  userStatus: { ACTIVE: 'Ativo', DISABLED: 'Desativado' },
  orgStatus: { ACTIVE: 'Ativa', ARCHIVED: 'Arquivada' },
  docStatus: { ACTIVE: 'Ativo', ARCHIVED: 'Arquivado' },
  project: { PLANNED: 'Planejado', ACTIVE: 'Em andamento', ON_HOLD: 'Em pausa', COMPLETED: 'Concluído', ARCHIVED: 'Arquivado' },
  serviceLine: { PRODUCT: 'Produto', CONSULTING: 'Consultoria', ARCHITECTURE: 'Arquitetura', DEVELOPMENT: 'Desenvolvimento' },
  milestone: { PENDING: 'Pendente', IN_PROGRESS: 'Em andamento', DONE: 'Concluída' },
  category: { PROPOSAL: 'Proposta', CONTRACT: 'Contrato', DESIGN: 'Desenho', REPORT: 'Relatório', OTHER: 'Outro' },
  visibility: { INTERNAL: 'Somente equipe Union', CLIENT_ADMINS: 'Administração do cliente', PARTICIPANTS: 'Participantes' },
  scan: { PENDING: 'Em verificação', CLEAN: 'Disponível', REJECTED: 'Bloqueado', FAILED: 'Verificação não concluída' },
  delivery: { PUBLISHED: 'Publicada', AWAITING_APPROVAL: 'Aguardando aprovação', APPROVED: 'Aprovada', CHANGES_REQUESTED: 'Ajustes solicitados', SUPERSEDED: 'Substituída' },
  decision: { APPROVED: 'Aprovada', CHANGES_REQUESTED: 'Ajustes solicitados' },
  ticketCategory: { QUESTION: 'Dúvida', INCIDENT: 'Incidente', CHANGE: 'Mudança', ACCESS: 'Acesso', OTHER: 'Outro' },
  priority: { LOW: 'Baixa', NORMAL: 'Normal', HIGH: 'Alta', URGENT: 'Urgente' },
  ticket: { OPEN: 'Aberta', IN_PROGRESS: 'Em atendimento', WAITING_CLIENT: 'Aguardando você', RESOLVED: 'Resolvida', CLOSED: 'Encerrada' },
  product: { ACTIVE: 'Ativo', IMPLEMENTING: 'Em implantação', SUSPENDED: 'Suspenso', ENDED: 'Encerrado' },
  invitation: { PENDING: 'Pendente', ACCEPTED: 'Aceito', REVOKED: 'Revogado', EXPIRED: 'Expirado' },
  email: { PENDING: 'Na fila', SENT: 'Enviado', FAILED: 'Desistiu' },
  retentionCategory: { 'notificacoes-lidas': 'Avisos lidos', 'emails-enviados': 'Registros de e-mails', 'convites-encerrados': 'Convites encerrados', 'solicitacoes-encerradas': 'Solicitações encerradas', 'documentos-arquivados': 'Documentos arquivados', 'contas-desativadas': 'Contas desativadas', auditoria: 'Auditoria' },
} as const;

export const activityLabels: Record<string, string> = {
  PROJECT_CREATED: 'Projeto criado',
  PROJECT_STATUS_CHANGED: 'Situação do projeto alterada',
  PROJECT_UPDATE_PUBLISHED: 'Atualização publicada',
  MILESTONE_CREATED: 'Etapa criada',
  MILESTONE_STATUS_CHANGED: 'Etapa atualizada',
  DOCUMENT_PUBLISHED: 'Documento disponibilizado',
  DOCUMENT_VERSION_PUBLISHED: 'Nova versão de documento',
  DELIVERY_PUBLISHED: 'Entrega publicada',
  DELIVERY_VERSION_PUBLISHED: 'Nova versão de entrega',
  APPROVAL_REQUESTED: 'Aprovação solicitada',
  DELIVERY_APPROVED: 'Entrega aprovada',
  DELIVERY_CHANGES_REQUESTED: 'Ajustes solicitados',
  TICKET_OPENED: 'Solicitação aberta',
  TICKET_STATUS_CHANGED: 'Situação da solicitação alterada',
  TICKET_COMMENTED: 'Novo comentário em solicitação',
  TICKET_ATTACHMENT_ADDED: 'Anexo em solicitação',
  PROJECT_MEMBER_SET: 'Associação a projeto',
  PRODUCT_REGISTERED: 'Produto registrado',
  PRODUCT_STATUS_CHANGED: 'Situação do produto alterada',
  USER_ROLE_CHANGED: 'Papel alterado',
};

/** Grupo de rótulos do código que encerra o resumo de auditoria de cada ação de mudança de situação. */
const SUMMARY_GROUPS: Record<string, keyof typeof labels> = { TICKET_STATUS_CHANGED: 'ticket', MILESTONE_STATUS_CHANGED: 'milestone', PROJECT_STATUS_CHANGED: 'project', PRODUCT_STATUS_CHANGED: 'product' };

/** Resumos de auditoria terminam com o código da situação; nas telas, o código vira o rótulo em português. */
export function humanizeSummary(action: string, summary: string | null | undefined): string {
  if (!summary) return '';
  const group = SUMMARY_GROUPS[action];
  if (!group) return summary;
  return summary.replace(/([A-Z][A-Z_]+)$/, (code) => label(group, code));
}

export function label(group: keyof typeof labels, value: string | null | undefined): string {
  if (!value) return '';
  return (labels[group] as Record<string, string>)[value] ?? value;
}

export function options(group: keyof typeof labels, only?: string[]) {
  return Object.entries(labels[group]).filter(([value]) => !only || only.includes(value)).map(([value, text]) => ({ value, label: text as string }));
}

const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Sem data';
  const [year, month, day] = value.slice(0, 10).split('-');
  return value.length === 10 ? `${day}/${month}/${year}` : dateFormat.format(new Date(value));
}

export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTimeFormat.format(new Date(value)) : '';
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
