package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.domain.ObjectLedger;
import br.com.unionsolutions.portal.domain.StoredFile;
import br.com.unionsolutions.portal.domain.Types.ScanStatus;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Mantém banco e armazenamento coerentes quando um objeto é gravado fora da transação que o registra.
 * Cada registro aqui é independente da transação do chamador (REQUIRES_NEW): sobrevive à reversão dela e
 * fica visível para outras transações na hora, o que faz a reserva contar na cota.
 */
@ApplicationScoped
public class ObjectLedgerService {
    private static final Logger LOG = Logger.getLogger(ObjectLedgerService.class);

    @Inject EntityManager em;
    @Inject Ports.ObjectStorage storage;
    /** Chamadas internas passam pelo proxy, para os limites de transação valerem. */
    @Inject Instance<ObjectLedgerService> self;
    @ConfigProperty(name = "portal.ledger.min-age") Duration minAge;

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void reserve(String key, UUID fileId, UUID tenantId, long size) {
        ObjectLedger entry = new ObjectLedger();
        entry.objectKey = key;
        entry.fileId = fileId;
        entry.tenantId = tenantId;
        entry.sizeBytes = size;
        entry.kind = ObjectLedger.RESERVA;
        entry.createdAt = Instant.now();
        entry.persist();
    }

    /** Cópia que deveria ter sido apagada: fica registrada até a limpeza conseguir. */
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void leftover(String key, UUID fileId, UUID tenantId, long size, String error) {
        if (ObjectLedger.findById(key) != null) return;
        ObjectLedger entry = new ObjectLedger();
        entry.objectKey = key;
        entry.fileId = fileId;
        entry.tenantId = tenantId;
        entry.sizeBytes = size;
        entry.kind = ObjectLedger.SOBRA;
        entry.createdAt = Instant.now();
        entry.attempts = 1;
        entry.lastError = truncate(error);
        entry.persist();
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void release(String key) {
        ObjectLedger.deleteById(key);
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void recordFailure(String key, String error) {
        ObjectLedger entry = ObjectLedger.findById(key);
        if (entry == null) return;
        entry.attempts += 1;
        entry.lastError = truncate(error);
    }

    /** Depois de uma reversão, o objeto gravado não pode ficar ocupando espaço sem registro. */
    public void compensate(String key) {
        ObjectLedgerService me = self.get();
        try {
            storage.delete(key);
            me.release(key);
        } catch (RuntimeException e) {
            // Fica no registro: a limpeza periódica tenta de novo, e o espaço continua contado na cota até lá.
            LOG.warnf("Objeto de envio revertido não foi apagado agora (%s): fica registrado para limpeza", e.getClass().getSimpleName());
            me.recordFailure(key, e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    /** Espaço ocupado por objetos que ainda não têm registro definitivo. Objetos de arquivos já registrados não contam duas vezes. */
    @Transactional(Transactional.TxType.MANDATORY)
    public long reservedBytes(UUID tenantId) {
        Number total = (Number) em.createNativeQuery("""
                SELECT COALESCE(SUM(l.size_bytes), 0) FROM object_ledger l
                WHERE l.tenant_id = :tenant AND l.kind = 'RESERVA'
                  AND NOT EXISTS (SELECT 1 FROM stored_file f WHERE f.id = l.file_id)""")
                .setParameter("tenant", tenantId).getSingleResult();
        return total.longValue();
    }

    /**
     * Limpeza repetível. Só olha registros com idade mínima, para não disputar com um envio em andamento,
     * e nunca apaga o objeto atual de um arquivo registrado.
     */
    public int reconcile() {
        int cleaned = 0;
        ObjectLedgerService me = self.get();
        for (String key : me.pendingKeys()) {
            Outcome outcome = me.reconcileOne(key);
            if (outcome == Outcome.DELETE) {
                try {
                    storage.delete(key);
                    me.release(key);
                    cleaned++;
                } catch (RuntimeException e) {
                    LOG.warnf("Limpeza do objeto registrado falhou (%s); nova tentativa na próxima execução", e.getClass().getSimpleName());
                    me.recordFailure(key, e.getClass().getSimpleName() + ": " + e.getMessage());
                }
            } else if (outcome == Outcome.RELEASE) {
                me.release(key);
                cleaned++;
            }
        }
        cleaned += releaseRejectedObjects(me);
        return cleaned;
    }

    public enum Outcome { DELETE, RELEASE, KEEP }

    @Transactional
    public List<String> pendingKeys() {
        return em.createQuery("select l.objectKey from ObjectLedger l where l.createdAt <= :limit order by l.createdAt", String.class)
                .setParameter("limit", Instant.now().minus(minAge)).setMaxResults(200).getResultList();
    }

    @Transactional
    public Outcome reconcileOne(String key) {
        ObjectLedger entry = ObjectLedger.findById(key);
        if (entry == null) return Outcome.KEEP;
        StoredFile file = StoredFile.findById(entry.fileId);
        if (ObjectLedger.RESERVA.equals(entry.kind)) {
            // Com o arquivo registrado, o objeto é dele: a reserva só sai do registro. Sem arquivo, o objeto é órfão.
            return file != null ? Outcome.RELEASE : Outcome.DELETE;
        }
        // Sobra: nunca é o objeto atual do arquivo.
        return file != null && key.equals(file.objectKey) ? Outcome.RELEASE : Outcome.DELETE;
    }

    /** Arquivos bloqueados cujo objeto não pôde ser apagado na hora: tenta de novo, e só então o espaço deixa de contar. */
    int releaseRejectedObjects(ObjectLedgerService me) {
        int released = 0;
        for (var rejected : me.rejectedWithObject()) {
            try {
                storage.delete(rejected.key());
                me.markObjectGone(rejected.id());
                released++;
            } catch (RuntimeException e) {
                LOG.warnf("Objeto de arquivo bloqueado ainda não apagado (%s)", e.getClass().getSimpleName());
            }
        }
        return released;
    }

    public record RejectedObject(UUID id, String key) {}

    @Transactional
    public List<RejectedObject> rejectedWithObject() {
        return em.createQuery("select f from StoredFile f where f.scanStatus = :status and f.objectPresent = true", StoredFile.class)
                .setParameter("status", ScanStatus.REJECTED).setMaxResults(200).getResultList().stream()
                .map(f -> new RejectedObject(f.id, f.objectKey)).toList();
    }

    @Transactional
    public void markObjectGone(UUID fileId) {
        StoredFile file = StoredFile.findById(fileId);
        if (file != null) file.objectPresent = false;
    }

    private static String truncate(String value) {
        return value == null ? null : value.substring(0, Math.min(value.length(), 200));
    }
}
