package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.domain.AuditEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.UUID;
import org.jboss.logging.MDC;

/** Registro append-only de ações relevantes. O resumo nunca leva conteúdo de documentos, tokens ou senhas. */
@ApplicationScoped
public class AuditService {

    @Transactional(Transactional.TxType.MANDATORY)
    public void record(Actor actor, String action, String resourceType, UUID resourceId, UUID tenantId, UUID projectId, String summary, boolean visibleToClient) {
        record(actor == null ? null : actor.id(), action, resourceType, resourceId, tenantId, projectId, summary, visibleToClient);
    }

    /** Para registrar uma tentativa recusada: sobrevive ao rollback da operação. */
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void recordIndependent(UUID actorId, String action, String resourceType, UUID resourceId, UUID tenantId, String summary) {
        record(actorId, action, resourceType, resourceId, tenantId, null, summary, false);
    }

    @Transactional(Transactional.TxType.MANDATORY)
    public void record(UUID actorId, String action, String resourceType, UUID resourceId, UUID tenantId, UUID projectId, String summary, boolean visibleToClient) {
        AuditEvent event = new AuditEvent();
        event.id = UUID.randomUUID();
        event.actorId = actorId;
        event.action = action;
        event.resourceType = resourceType;
        event.resourceId = resourceId;
        event.tenantId = tenantId;
        event.projectId = projectId;
        event.summary = summary != null && summary.length() > 240 ? summary.substring(0, 240) : summary;
        event.visibleToClient = visibleToClient;
        Object correlation = MDC.get("correlationId");
        event.correlationId = correlation == null ? null : correlation.toString();
        event.createdAt = Instant.now();
        event.persist();
    }
}
