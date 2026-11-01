package br.com.unionsolutions.portal.application;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;

/** Regras que impedem a API de iniciar em produção com configuração de desenvolvimento. */
public final class ProductionChecks {
    private ProductionChecks() {}

    private static final List<String> DEV_HOSTS = List.of("localhost", "127.0.0.1", "mailpit", "keycloak", "seaweedfs", "postgres", "host.docker.internal");
    private static final List<String> FICTITIOUS_SUFFIXES = List.of(".invalid", ".example", ".test", ".local", "example.com", "example.org", "example.net");
    private static final List<String> PLACEHOLDERS = List.of("substituir", "changeme", "change-me", "exemplo");
    /** Armazenamento da implantação inicial: serviço na rede interna do Compose, sem porta publicada. */
    static final String INTERNAL_STORAGE = "http://armazenamento:8333";

    /** Recebe a leitura de configuração e retorna as violações encontradas. */
    public static List<String> violations(Function<String, String> config) {
        List<String> problems = new ArrayList<>();
        if ("true".equalsIgnoreCase(config.apply("portal.demo.enabled"))) problems.add("portal.demo.enabled não pode estar ativo em produção");
        if ("true".equalsIgnoreCase(config.apply("portal.storage.create-bucket"))) problems.add("portal.storage.create-bucket não pode estar ativo em produção");
        if ("true".equalsIgnoreCase(config.apply("quarkus.mailer.mock"))) problems.add("quarkus.mailer.mock não pode estar ativo em produção");
        if ("true".equalsIgnoreCase(config.apply("quarkus.mailer.trust-all"))) problems.add("quarkus.mailer.trust-all não pode estar ativo em produção");
        String level = lower(config.apply("quarkus.log.level"));
        if (level.equals("debug") || level.equals("trace") || level.equals("all")) problems.add("quarkus.log.level não pode ser de depuração em produção");

        requireHttpsPublic(problems, "portal.public-url", config.apply("portal.public-url"));
        requireHttpsPublic(problems, "quarkus.oidc.token.issuer", config.apply("quarkus.oidc.token.issuer"));

        String smtp = lower(config.apply("quarkus.mailer.host"));
        if (smtp.isEmpty() || DEV_HOSTS.contains(smtp) || fictitious(smtp)) problems.add("quarkus.mailer.host precisa apontar para um SMTP real");
        String startTls = lower(config.apply("quarkus.mailer.start-tls"));
        if ((startTls.equals("disabled") || startTls.equals("optional")) && !"true".equalsIgnoreCase(config.apply("quarkus.mailer.tls"))) problems.add("o envio de e-mail precisa exigir TLS");
        String from = lower(config.apply("quarkus.mailer.from"));
        if (from.isEmpty() || fictitious(from) || placeholder(from)) problems.add("quarkus.mailer.from precisa ser definido com um endereço real");
        requireSecret(problems, "portal.identity.admin-client-secret", config.apply("portal.identity.admin-client-secret"));
        requireSecret(problems, "quarkus.datasource.password", config.apply("quarkus.datasource.password"));
        String accessKey = config.apply("portal.storage.access-key");
        String secretKey = config.apply("portal.storage.secret-key");
        if (blank(accessKey) || blank(secretKey) || placeholder(accessKey) || placeholder(secretKey)) problems.add("credenciais do armazenamento precisam ser definidas");

        // Retenção destrutiva só com política aprovada identificada: nunca com prazos inventados.
        if ("true".equalsIgnoreCase(config.apply("portal.retention.enabled")) && blank(config.apply("portal.retention.policy-reference"))) {
            problems.add("portal.retention.enabled exige portal.retention.policy-reference com a política aprovada");
        }

        String endpoint = lower(config.apply("portal.storage.endpoint"));
        if (!endpoint.isEmpty() && !endpoint.startsWith("https://") && !endpoint.equals(INTERNAL_STORAGE)) problems.add("portal.storage.endpoint precisa usar HTTPS ou o serviço interno da implantação");
        return problems;
    }

    private static void requireHttpsPublic(List<String> problems, String name, String value) {
        String v = lower(value);
        boolean local = DEV_HOSTS.stream().anyMatch(h -> v.contains("//" + h));
        if (!v.startsWith("https://") || local || fictitious(host(v)) || placeholder(v)) problems.add(name + " precisa ser uma URL pública com HTTPS");
    }

    /** Campos opcionais neste mapa de teste não aparecem: só recusa o que estiver preenchido com exemplo, ou vazio quando obrigatório. */
    private static void requireSecret(List<String> problems, String name, String value) {
        if (value == null && name.startsWith("quarkus.datasource")) return;
        if (blank(value) || placeholder(value)) problems.add(name + " precisa ser definido");
    }

    private static String host(String url) {
        String rest = url.substring(url.indexOf("//") < 0 ? 0 : url.indexOf("//") + 2);
        int end = rest.indexOf('/');
        String authority = end < 0 ? rest : rest.substring(0, end);
        int port = authority.indexOf(':');
        return port < 0 ? authority : authority.substring(0, port);
    }

    private static boolean fictitious(String host) {
        return FICTITIOUS_SUFFIXES.stream().anyMatch(host::endsWith);
    }

    private static boolean placeholder(String value) {
        String v = lower(value);
        return PLACEHOLDERS.stream().anyMatch(v::contains);
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String lower(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
