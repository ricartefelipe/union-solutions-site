package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.domain.*;
import br.com.unionsolutions.portal.domain.Types.*;
import io.quarkus.runtime.LaunchMode;
import io.quarkus.runtime.StartupEvent;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.eclipse.microprofile.config.Config;
import org.eclipse.microprofile.config.ConfigProvider;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/** Guarda de produção, primeiro administrador, massa de demonstração e verificação de arquivos. */
@ApplicationScoped
public class Startup {
    private static final Logger LOG = Logger.getLogger(Startup.class);

    @Inject Ports.IdentityProvider identity;
    @Inject AuditService audit;
    @Inject FileService files;
    @Inject ObjectLedgerService ledger;
    @ConfigProperty(name = "portal.bootstrap.admin-email") Optional<String> bootstrapAdmin;
    @ConfigProperty(name = "portal.demo.enabled") boolean demoEnabled;
    private volatile String pendingBootstrap;
    private volatile Instant nextBootstrapAttempt = Instant.EPOCH;
    private int bootstrapFailures;

    /** Para o teste de regressão: arma o reenvio como se a API tivesse acabado de subir. */
    public void armBootstrapForTests(String email) {
        pendingBootstrap = email;
        nextBootstrapAttempt = Instant.EPOCH;
        bootstrapFailures = 0;
    }

    public boolean bootstrapPending() {
        return pendingBootstrap != null;
    }

    public Instant nextBootstrapAttempt() {
        return nextBootstrapAttempt;
    }

    public void skipBootstrapWaitForTests() {
        nextBootstrapAttempt = Instant.EPOCH;
    }
    @ConfigProperty(name = "portal.public-url") String publicUrl;

    void onStart(@Observes StartupEvent event) {
        if (isProduction()) {
            List<String> problems = ProductionChecks.violations(Startup::read);
            if (!problems.isEmpty()) throw new IllegalStateException("Configuração inválida para produção: " + String.join("; ", problems));
        }
        if (LaunchMode.current() == LaunchMode.TEST) return;
        bootstrapAdmin.map(e -> e.trim().toLowerCase(Locale.ROOT)).filter(e -> !e.isEmpty()).ifPresent(this::bootstrap);
        if (demoEnabled) seedDemo();
    }

    static boolean isProduction() {
        return "prod".equals(ConfigProvider.getConfig().getOptionalValue("quarkus.profile", String.class).orElse("prod"));
    }

    private static String read(String name) {
        Config config = ConfigProvider.getConfig();
        return config.getOptionalValue(name, String.class).orElse(null);
    }

    /**
     * Só cria a conta enquanto não houver nenhum administrador. Até o primeiro login, cada início da API tenta de novo o e-mail de
     * definição de senha: sem ele, a conta não existe no provedor e a recuperação de senha não ajudaria.
     */
    void bootstrap(String email) {
        createFirstAdmin(email);
        if (awaitingFirstLogin(email)) {
            pendingBootstrap = email;
            retryBootstrap();
        }
    }

    @Transactional
    boolean awaitingFirstLogin(String email) {
        AppUser admin = AppUser.find("email", email).firstResult();
        return admin != null && admin.role == Role.UNION_ADMIN && admin.keycloakSub == null;
    }

    /**
     * O provedor pode ainda estar iniciando ou o SMTP pode falhar por instantes. Em falha, espera cada vez mais (30 s até 10 min).
     * Depois que o provedor aceita o envio, não há nova tentativa: aceite do provedor não é entrega do e-mail.
     */
    @Scheduled(every = "30s", delayed = "30s", identity = "bootstrap-retry", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    public void retryBootstrap() {
        String email = pendingBootstrap;
        if (email == null || Instant.now().isBefore(nextBootstrapAttempt)) return;
        try {
            identity.ensureUserAndSendSetup(email, publicUrl.replaceAll("/+$", "") + "/", true);
            pendingBootstrap = null;
            bootstrapFailures = 0;
            LOG.info("Primeiro administrador: o provedor de identidade aceitou o envio do e-mail de definição de senha.");
        } catch (RuntimeException e) {
            bootstrapFailures = Math.min(bootstrapFailures + 1, 5);
            long waitSeconds = 30L << (bootstrapFailures - 1);
            nextBootstrapAttempt = Instant.now().plusSeconds(waitSeconds);
            LOG.warnf("E-mail do primeiro administrador ainda não enviado (%s), nova tentativa em %d s. Para antecipar, reinicie a API.",
                    e.getClass().getSimpleName(), waitSeconds);
        }
    }

    @Transactional
    boolean createFirstAdmin(String email) {
        if (AppUser.count("role", Role.UNION_ADMIN) > 0) return false;
        AppUser admin = new AppUser();
        admin.id = UUID.randomUUID();
        admin.email = email;
        admin.role = Role.UNION_ADMIN;
        admin.status = UserStatus.ACTIVE;
        admin.createdAt = Instant.now();
        admin.updatedAt = admin.createdAt;
        admin.persist();
        audit.record(admin.id, "FIRST_ADMIN_BOOTSTRAPPED", "user", admin.id, null, null, null, false);
        return true;
    }

    // ---------- Demonstração: nunca em produção (ProductionChecks recusa a inicialização) ----------

    void seedDemo() {
        if (isProduction()) throw new IllegalStateException("Massa de demonstração não pode ser usada em produção.");
        String password = ConfigProvider.getConfig().getOptionalValue("portal.demo.password", String.class).orElse("");
        if (password.isBlank()) {
            LOG.warn("Massa de demonstração ignorada: defina PORTAL_DEMO_PASSWORD.");
            return;
        }
        if (demoExists()) return;
        String adminSub = identity.createDemoUser("admin.demo@portal.invalid", "Administração Demonstração", password);
        String clientSub = identity.createDemoUser("cliente.demo@portal.invalid", "Cliente Demonstração", password);
        persistDemo(adminSub, clientSub);
        LOG.info("Massa de demonstração criada. Use somente em desenvolvimento.");
    }

    @Transactional
    boolean demoExists() {
        return Organization.count("demo", true) > 0;
    }

    @Transactional
    void persistDemo(String adminSub, String clientSub) {
        Instant now = Instant.now();
        Organization org = new Organization();
        org.id = UUID.randomUUID();
        org.name = "[Demonstração] Empresa Exemplo";
        org.status = OrgStatus.ACTIVE;
        org.demo = true;
        org.createdAt = now;
        org.updatedAt = now;
        org.persist();

        AppUser admin = AppUser.find("email", "admin.demo@portal.invalid").firstResult();
        if (admin == null) {
            admin = new AppUser();
            admin.id = UUID.randomUUID();
            admin.keycloakSub = adminSub;
            admin.email = "admin.demo@portal.invalid";
            admin.displayName = "Administração Demonstração";
            admin.role = Role.UNION_ADMIN;
            admin.status = UserStatus.ACTIVE;
            admin.createdAt = now;
            admin.updatedAt = now;
            admin.persist();
        }
        AppUser client = new AppUser();
        client.id = UUID.randomUUID();
        client.keycloakSub = clientSub;
        client.email = "cliente.demo@portal.invalid";
        client.displayName = "Cliente Demonstração";
        client.role = Role.CLIENT_ADMIN;
        client.tenantId = org.id;
        client.status = UserStatus.ACTIVE;
        client.createdAt = now;
        client.updatedAt = now;
        client.persist();

        Project project = new Project();
        project.id = UUID.randomUUID();
        project.tenantId = org.id;
        project.name = "[Demonstração] Projeto exemplo";
        project.description = "Registro fictício para conhecer o portal no ambiente de desenvolvimento.";
        project.agreedScope = "Escopo fictício, apenas para demonstração.";
        project.serviceLine = ServiceLine.DEVELOPMENT;
        project.status = ProjectStatus.ACTIVE;
        project.dueDate = LocalDate.now().plusMonths(2);
        project.createdBy = admin.id;
        project.createdAt = now;
        project.updatedAt = now;
        project.persist();

        Milestone milestone = new Milestone();
        milestone.id = UUID.randomUUID();
        milestone.tenantId = org.id;
        milestone.projectId = project.id;
        milestone.title = "Etapa de demonstração";
        milestone.status = MilestoneStatus.IN_PROGRESS;
        milestone.dueDate = LocalDate.now().plusWeeks(2);
        milestone.createdAt = now;
        milestone.updatedAt = now;
        milestone.persist();
    }

    @Scheduled(every = "{portal.ledger.interval}", delayed = "2m", identity = "ledger-reconcile", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void reconcileObjects() {
        ledger.reconcile();
    }

    @Scheduled(every = "{portal.scan.interval}", concurrentExecution = Scheduled.ConcurrentExecution.SKIP, identity = "scan-files")
    void scanFiles() {
        for (UUID id : files.claimBatch(300)) {
            files.scanOne(id);
        }
    }
}
