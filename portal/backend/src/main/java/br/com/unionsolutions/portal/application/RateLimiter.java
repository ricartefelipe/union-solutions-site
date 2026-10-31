package br.com.unionsolutions.portal.application;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

/** Janela fixa contada no PostgreSQL: vale somando todas as instâncias da API. */
@ApplicationScoped
public class RateLimiter {
    @Inject EntityManager em;

    /** A contagem é confirmada em transação própria, antes de recusar: a recusa não desfaz o que foi contado. */
    public void check(String key, int limit, int windowSeconds) {
        if (increment(key, windowSeconds) > limit) {
            throw new ApiException(429, "RATE_LIMITED", "Muitas tentativas. Aguarde alguns minutos e tente novamente.");
        }
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    int increment(String key, int windowSeconds) {
        long now = Instant.now().getEpochSecond();
        Instant window = Instant.ofEpochSecond(now - now % windowSeconds);
        Number hits = (Number) em.createNativeQuery("""
                INSERT INTO rate_limit_bucket (bucket_key, window_start, hits) VALUES (:key, :window, 1)
                ON CONFLICT (bucket_key, window_start) DO UPDATE SET hits = rate_limit_bucket.hits + 1
                RETURNING hits""")
                .setParameter("key", key.length() > 200 ? key.substring(0, 200) : key)
                .setParameter("window", window)
                .getSingleResult();
        return hits.intValue();
    }

    @Scheduled(every = "1h")
    @Transactional
    void purge() {
        em.createNativeQuery("DELETE FROM rate_limit_bucket WHERE window_start < :limit")
                .setParameter("limit", Instant.now().minus(1, ChronoUnit.DAYS))
                .executeUpdate();
    }
}
