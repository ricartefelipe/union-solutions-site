package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.application.Dtos.FileView;
import br.com.unionsolutions.portal.domain.Document;
import br.com.unionsolutions.portal.domain.Project;
import br.com.unionsolutions.portal.domain.DocumentVersion;
import br.com.unionsolutions.portal.domain.StoredFile;
import br.com.unionsolutions.portal.domain.Types.DocVisibility;
import br.com.unionsolutions.portal.domain.Types.RecordStatus;
import br.com.unionsolutions.portal.domain.Types.ScanStatus;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Status;
import jakarta.transaction.Synchronization;
import jakarta.transaction.TransactionSynchronizationRegistry;
import jakarta.transaction.Transactional;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/** Recebe arquivos em quarentena. Nada é baixado sem verificação concluída e limpa. */
@ApplicationScoped
public class FileService {
    private static final Logger LOG = Logger.getLogger(FileService.class);

    @Inject Ports.ObjectStorage storage;
    @Inject Ports.MalwareScanner scanner;
    @Inject EntityManager em;
    @Inject RateLimiter limiter;
    @Inject AuditService audit;
    @Inject AccessPolicy policy;
    @Inject ObjectLedgerService ledger;
    @Inject NotificationService notifications;
    @Inject TransactionSynchronizationRegistry transactions;
    @ConfigProperty(name = "portal.files.max-bytes") long maxBytes;
    @ConfigProperty(name = "portal.files.tenant-quota-bytes") long tenantQuota;
    @ConfigProperty(name = "portal.scan.batch-size") int batchSize;
    @ConfigProperty(name = "portal.scan.max-attempts") int maxAttempts;

    public record Upload(Path path, String fileName) {}
    public record Download(StoredFile file, InputStream content) {}

    @Transactional(Transactional.TxType.MANDATORY)
    public StoredFile store(Actor actor, UUID tenantId, Upload upload) {
        limiter.check("upload:" + actor.id(), 60, 3600);
        try {
            long size = Files.size(upload.path());
            if (size == 0) throw ApiException.badRequest("FILE_EMPTY", "O arquivo está vazio.");
            if (size > maxBytes) throw new ApiException(413, "FILE_TOO_LARGE", "O arquivo excede o limite de " + (maxBytes / (1024 * 1024)) + " MB.");
            String name = FileRules.safeName(upload.fileName());
            String mediaType = FileRules.detect(name, upload.path());

            // Envios da mesma organização passam aqui um por vez, até o fim da transação. Outras organizações não esperam.
            em.createNativeQuery("SELECT pg_advisory_xact_lock(hashtext('quota'), hashtext(:tenant))")
                    .setParameter("tenant", tenantId.toString()).getSingleResult();
            if (usedBytes(tenantId) + size > tenantQuota) {
                throw new ApiException(413, "TENANT_QUOTA_EXCEEDED", "O limite de armazenamento desta organização foi atingido.");
            }

            StoredFile file = new StoredFile();
            file.id = UUID.randomUUID();
            file.tenantId = tenantId;
            file.objectKey = quarantineKey(tenantId, file.id);
            file.originalName = name;
            file.mediaType = mediaType;
            file.sizeBytes = size;
            file.sha256 = sha256(upload.path());
            file.scanStatus = ScanStatus.PENDING;
            file.uploadedBy = actor.id();
            file.createdAt = Instant.now();
            file.objectPresent = true;
            // A reserva é gravada numa transação própria: já conta para quem vier depois e sobrevive a uma reversão desta.
            ledger.reserve(file.objectKey, file.id, tenantId, size);
            storage.put(file.objectKey, upload.path(), size, "application/octet-stream");
            registerCompensation(file.objectKey);
            file.persist();
            return file;
        } catch (IOException e) {
            throw new ApiException(500, "FILE_READ_ERROR", "Não foi possível processar o arquivo.");
        }
    }

    /** Espaço ocupado: objetos presentes de arquivos registrados e reservas de envios ainda sem registro. */
    public long usedBytes(UUID tenantId) {
        Number used = (Number) em.createNativeQuery("SELECT COALESCE(SUM(size_bytes), 0) FROM stored_file WHERE tenant_id = :tenant AND object_present")
                .setParameter("tenant", tenantId).getSingleResult();
        return used.longValue() + ledger.reservedBytes(tenantId);
    }

    /** Depois do desfecho da transação: commit libera a reserva; reversão apaga o objeto que ficou sem registro. */
    private void registerCompensation(String key) {
        transactions.registerInterposedSynchronization(new Synchronization() {
            @Override public void beforeCompletion() {}

            @Override public void afterCompletion(int status) {
                if (status == Status.STATUS_COMMITTED) ledger.release(key);
                else ledger.compensate(key);
            }
        });
    }

    private static String quarantineKey(UUID tenantId, UUID fileId) {
        return "quarantine/" + tenantId + "/" + fileId;
    }

    private static String cleanKey(UUID tenantId, UUID fileId) {
        return "clean/" + tenantId + "/" + fileId;
    }

    private static String sha256(Path path) throws IOException {
        try (InputStream in = new DigestInputStream(Files.newInputStream(path), MessageDigest.getInstance("SHA-256"))) {
            in.transferTo(java.io.OutputStream.nullOutputStream());
            return HexFormat.of().formatHex(((DigestInputStream) in).getMessageDigest().digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public static FileView view(StoredFile f) {
        return new FileView(f.id, f.originalName, f.mediaType, f.sizeBytes, f.scanStatus, f.scanStatus == ScanStatus.CLEAN);
    }

    /** O chamador já autorizou o recurso. Qualquer estado que não seja CLEAN bloqueia, inclusive falha do scanner. */
    public Download openClean(StoredFile file) {
        if (file.scanStatus != ScanStatus.CLEAN) {
            String message = switch (file.scanStatus) {
                case PENDING -> "Este arquivo ainda está em verificação. Tente novamente em instantes.";
                case REJECTED -> "Este arquivo foi bloqueado pela verificação de segurança.";
                default -> "A verificação deste arquivo não foi concluída, e ele não está disponível.";
            };
            throw ApiException.conflict("FILE_NOT_AVAILABLE", message);
        }
        return new Download(file, storage.open(file.objectKey));
    }

    // ---------- Verificação em segundo plano ----------

    @Transactional
    public java.util.List<UUID> claimBatch(int leaseSeconds) {
        @SuppressWarnings("unchecked")
        java.util.List<UUID> ids = em.createNativeQuery("""
                UPDATE stored_file SET scan_claimed_until = :until
                WHERE id IN (
                  SELECT id FROM stored_file
                  WHERE scan_status = 'PENDING' AND (scan_claimed_until IS NULL OR scan_claimed_until < :now)
                  ORDER BY created_at LIMIT :limit FOR UPDATE SKIP LOCKED)
                RETURNING id""", UUID.class)
                .setParameter("until", Instant.now().plusSeconds(leaseSeconds))
                .setParameter("now", Instant.now())
                .setParameter("limit", batchSize)
                .getResultList();
        return ids;
    }

    /** Processa um arquivo. E/S fora de transação longa; só o estado final é gravado. */
    public void scanOne(UUID fileId) {
        StoredFile file = load(fileId);
        if (file == null || file.scanStatus != ScanStatus.PENDING) return;
        Ports.ScanVerdict verdict;
        try (InputStream in = storage.open(file.objectKey)) {
            verdict = scanner.scan(in);
        } catch (IOException | RuntimeException e) {
            LOG.warnf("Verificação indisponível para o arquivo %s: %s", fileId, e.getClass().getSimpleName());
            recordFailure(fileId);
            return;
        }
        if (verdict.clean()) {
            String target = cleanKey(file.tenantId, file.id);
            // Copia, registra e só então apaga a origem: uma queda em qualquer ponto deixa o arquivo legível e pronto para nova tentativa.
            boolean alreadyReleased = target.equals(file.objectKey);
            try {
                if (!alreadyReleased) storage.copy(file.objectKey, target);
            } catch (RuntimeException e) {
                LOG.warnf("Falha ao liberar o arquivo %s: %s", fileId, e.getClass().getSimpleName());
                recordFailure(fileId);
                return;
            }
            markClean(fileId, target);
            if (!alreadyReleased) {
                try {
                    storage.delete(file.objectKey);
                } catch (RuntimeException e) {
                    // A cópia fica registrada como sobra até a limpeza conseguir apagá-la.
                    LOG.warnf("Cópia em quarentena não removida para o arquivo %s: %s", fileId, e.getClass().getSimpleName());
                    ledger.leftover(file.objectKey, file.id, file.tenantId, file.sizeBytes, e.getClass().getSimpleName() + ": " + e.getMessage());
                }
            }
        } else {
            boolean gone;
            try {
                storage.delete(file.objectKey);
                gone = true;
            } catch (RuntimeException e) {
                // O espaço continua contado na cota enquanto o objeto existir; a limpeza periódica tenta de novo.
                LOG.warnf("Falha ao apagar o arquivo bloqueado %s: %s", fileId, e.getClass().getSimpleName());
                gone = false;
            }
            markRejected(fileId, verdict.signature(), gone);
        }
    }

    @Transactional
    StoredFile load(UUID id) {
        StoredFile file = StoredFile.findById(id);
        if (file != null) em.detach(file);
        return file;
    }

    @Transactional
    void markClean(UUID id, String key) {
        StoredFile file = StoredFile.findById(id);
        file.objectKey = key;
        file.scanStatus = ScanStatus.CLEAN;
        file.scannedAt = Instant.now();
        file.scanClaimedUntil = null;
        announceDocument(file);
    }

    /** Só aqui o documento passa a existir para o cliente. Documento restrito não vira atividade visível a todos. */
    private void announceDocument(StoredFile file) {
        DocumentVersion version = DocumentVersion.find("fileId", file.id).firstResult();
        if (version == null) return;
        Document doc = Document.findById(version.documentId);
        boolean visible = doc.visibility == DocVisibility.PARTICIPANTS && doc.status == RecordStatus.ACTIVE;
        audit.record((UUID) null, version.versionNo > 1 ? "DOCUMENT_VERSION_PUBLISHED" : "DOCUMENT_PUBLISHED", "document", doc.id, doc.tenantId, doc.projectId,
                version.versionNo > 1 ? doc.title + " v" + version.versionNo : doc.title, visible);
        if (doc.status == RecordStatus.ACTIVE && doc.visibility != DocVisibility.INTERNAL) {
            Project project = doc.projectId == null ? null : Project.findById(doc.projectId);
            java.util.Set<UUID> recipients = doc.visibility == DocVisibility.CLIENT_ADMINS || project == null
                    ? notifications.clientAdmins(doc.tenantId) : notifications.clientSide(project);
            notifications.notify(file.uploadedBy, recipients, "DOCUMENT_PUBLISHED", "Documento disponível: " + doc.title + (version.versionNo > 1 ? " v" + version.versionNo : ""),
                    "/documentos", doc.tenantId, doc.projectId, "document", doc.id);
        }
    }

    @Transactional
    void markRejected(UUID id, String signature, boolean objectGone) {
        StoredFile file = StoredFile.findById(id);
        file.scanStatus = ScanStatus.REJECTED;
        file.objectPresent = !objectGone;
        file.scanDetail = signature == null ? null : signature.substring(0, Math.min(signature.length(), 200));
        file.scannedAt = Instant.now();
        file.scanClaimedUntil = null;
        audit.record((UUID) null, "FILE_REJECTED", "file", file.id, file.tenantId, null, file.scanDetail, false);
    }

    @Transactional
    void recordFailure(UUID id) {
        StoredFile file = StoredFile.findById(id);
        file.scanAttempts += 1;
        if (file.scanAttempts >= maxAttempts) {
            file.scanStatus = ScanStatus.FAILED;
            file.scanDetail = "Verificação não concluída";
            file.scanClaimedUntil = null;
            audit.record((UUID) null, "FILE_SCAN_FAILED", "file", file.id, file.tenantId, null, null, false);
        } else {
            file.scanClaimedUntil = Instant.now().plusSeconds(Math.min(300, 15L * file.scanAttempts));
        }
    }

    /** Depois de corrigir o scanner, o administrador pode recolocar um arquivo na fila. */
    @Transactional
    public void rescan(Actor actor, UUID id) {
        policy.requireUnionAdmin(actor);
        StoredFile file = StoredFile.findById(id);
        if (file == null) throw ApiException.notFound();
        if (file.scanStatus != ScanStatus.FAILED) throw ApiException.conflict("FILE_NOT_FAILED", "Só arquivos com verificação não concluída podem voltar à fila.");
        file.scanStatus = ScanStatus.PENDING;
        file.scanAttempts = 0;
        file.scanClaimedUntil = null;
        file.scanDetail = null;
        audit.record(actor, "FILE_RESCAN_REQUESTED", "file", file.id, file.tenantId, null, null, false);
    }
}
