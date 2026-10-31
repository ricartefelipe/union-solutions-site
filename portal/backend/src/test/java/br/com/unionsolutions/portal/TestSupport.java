package br.com.unionsolutions.portal;

import br.com.unionsolutions.portal.application.Ports;
import br.com.unionsolutions.portal.domain.*;
import br.com.unionsolutions.portal.domain.Types.*;
import io.smallrye.jwt.build.Jwt;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Singleton;
import jakarta.transaction.Transactional;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/** Substitutos dos serviços externos, tokens assinados e dados de teste. O banco é um PostgreSQL real. */
public final class TestSupport {
    private TestSupport() {}

    public static String token(String subject, String email, boolean verified) {
        var builder = Jwt.subject(subject).issuer("https://server.example.com").audience("portal-api").expiresIn(600);
        if (email != null) builder.claim("email", email).claim("email_verified", verified);
        return builder.jws().keyId("1").sign("privateKey.jwk");
    }

    public static String token(AppUser user) {
        return token(user.keycloakSub, user.email, true);
    }

    @Singleton
    public static class MemoryStorage implements Ports.ObjectStorage {
        public final Map<String, byte[]> objects = new ConcurrentHashMap<>();

        @Override public void put(String key, Path content, long size, String contentType) {
            try {
                objects.put(key, Files.readAllBytes(content));
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
        @Override public InputStream open(String key) { return new ByteArrayInputStream(objects.get(key)); }
        @Override public void copy(String fromKey, String toKey) {
            // Como o S3 real: copiar um objeto sobre si mesmo é recusado.
            if (fromKey.equals(toKey)) throw new IllegalArgumentException("Cópia sobre o próprio objeto");
            if (!objects.containsKey(fromKey)) throw new IllegalArgumentException("Objeto inexistente");
            objects.put(toKey, objects.get(fromKey));
        }
        @Override public void delete(String key) { objects.remove(key); }
    }

    /** Sinaliza como malware o conteúdo com a marca, e simula indisponibilidade quando pedido. */
    @Singleton
    public static class ScriptedScanner implements Ports.MalwareScanner {
        public volatile boolean unavailable;

        @Override public Ports.ScanVerdict scan(InputStream content) {
            if (unavailable) throw new IllegalStateException("scanner fora do ar");
            try {
                String text = new String(content.readAllBytes(), StandardCharsets.ISO_8859_1);
                return text.contains("MARCA-MALWARE") ? new Ports.ScanVerdict(false, "Teste.Malware") : new Ports.ScanVerdict(true, null);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
    }

    @Singleton
    public static class FakeIdentity implements Ports.IdentityProvider {
        public final List<String> setupEmails = new CopyOnWriteArrayList<>();
        public final List<String> mfaEmails = new CopyOnWriteArrayList<>();
        public final List<String> disabled = new CopyOnWriteArrayList<>();

        @Override public void ensureUserAndSendSetup(String email, String redirectUri, boolean requireMfa) {
            setupEmails.add(email);
            if (requireMfa) mfaEmails.add(email);
        }
        @Override public boolean disable(String subject) { disabled.add(subject); return true; }
        @Override public boolean enable(String subject) { return true; }
        @Override public String createDemoUser(String email, String name, String password) { return UUID.randomUUID().toString(); }
    }

    @ApplicationScoped
    public static class Fixtures {
        @Transactional
        public Organization org(String prefix) {
            Organization org = new Organization();
            org.id = UUID.randomUUID();
            org.name = prefix + " " + org.id;
            org.status = OrgStatus.ACTIVE;
            org.createdAt = Instant.now();
            org.updatedAt = org.createdAt;
            org.persist();
            return org;
        }

        @Transactional
        public AppUser user(Role role, UUID tenantId) {
            AppUser user = new AppUser();
            user.id = UUID.randomUUID();
            user.keycloakSub = UUID.randomUUID().toString();
            user.email = role.name().toLowerCase() + "-" + user.id + "@teste.invalid";
            user.displayName = role.name();
            user.role = role;
            user.tenantId = tenantId;
            user.status = UserStatus.ACTIVE;
            user.createdAt = Instant.now();
            user.updatedAt = user.createdAt;
            user.persist();
            return user;
        }

        @Transactional
        public void member(UUID tenantId, UUID projectId, UUID userId, boolean canApprove) {
            ProjectMember member = new ProjectMember();
            member.tenantId = tenantId;
            member.projectId = projectId;
            member.userId = userId;
            member.canApprove = canApprove;
            member.createdAt = Instant.now();
            member.persist();
        }

        @Transactional
        public void assign(UUID tenantId, UUID userId, UUID by) {
            StaffAssignment assignment = new StaffAssignment();
            assignment.tenantId = tenantId;
            assignment.userId = userId;
            assignment.assignedBy = by;
            assignment.createdAt = Instant.now();
            assignment.persist();
        }

        @Transactional
        public void expireInvitations(String email) {
            Invitation.update("expiresAt = ?1 where email = ?2", Instant.now().minusSeconds(60), email);
        }

        @Transactional
        public void setDocumentStatus(UUID fileId, ScanStatus status) {
            StoredFile file = StoredFile.findById(fileId);
            file.scanStatus = status;
        }

        @Transactional
        public ScanStatus scanStatus(UUID fileId) {
            return StoredFile.<StoredFile>findById(fileId).scanStatus;
        }

        @Transactional
        public int scanAttempts(UUID fileId) {
            return StoredFile.<StoredFile>findById(fileId).scanAttempts;
        }

        @Transactional
        public void releaseClaim(UUID fileId) {
            StoredFile.<StoredFile>findById(fileId).scanClaimedUntil = null;
        }

        @Transactional
        public long decisions(UUID versionId) {
            return ApprovalDecision.count("deliveryVersionId", versionId);
        }

        @Transactional
        public long auditCount(String action, UUID resourceId) {
            return AuditEvent.count("action = ?1 and resourceId = ?2", action, resourceId);
        }
    }
}
