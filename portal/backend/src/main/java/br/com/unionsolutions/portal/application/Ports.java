package br.com.unionsolutions.portal.application;

import java.io.InputStream;
import java.nio.file.Path;

/** Dependências externas que a aplicação usa, implementadas na infraestrutura. */
public final class Ports {
    private Ports() {}

    public interface ObjectStorage {
        void put(String key, Path content, long size, String contentType);
        InputStream open(String key);
        void copy(String fromKey, String toKey);
        void delete(String key);
    }

    public interface MalwareScanner {
        /** Lança exceção quando não consegue concluir: falha nunca significa arquivo limpo. */
        ScanVerdict scan(InputStream content);
    }

    public record ScanVerdict(boolean clean, String signature) {}

    public interface IdentityProvider {
        /** Cria a conta, se preciso, e pede ao provedor o e-mail de definição de senha. A equipe da Union fica sujeita ao segundo fator. */
        void ensureUserAndSendSetup(String email, String redirectUri, boolean requireMfa);
        /** Desativa a conta e encerra as sessões no provedor. */
        boolean disable(String subject);
        boolean enable(String subject);
        /** Somente para a massa de demonstração, fora de produção. */
        String createDemoUser(String email, String name, String password);
    }
}
