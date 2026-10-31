package br.com.unionsolutions.portal.application;

import io.quarkus.hibernate.orm.panache.Panache;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/** Consulta paginada com filtros. A paginação tem limite fixo, e toda condição de acesso entra no WHERE. */
final class Listing<E> {
    static final int MAX_SIZE = 100;

    private final Class<E> type;
    private final String alias;
    private final List<String> conditions = new ArrayList<>();
    private final Map<String, Object> params = new HashMap<>();
    private String order = "";

    Listing(Class<E> type, String alias) {
        this.type = type;
        this.alias = alias;
    }

    Listing<E> where(String condition) {
        conditions.add(condition);
        return this;
    }

    Listing<E> where(String condition, String param, Object value) {
        conditions.add(condition);
        params.put(param, value);
        return this;
    }

    Listing<E> param(String name, Object value) {
        params.put(name, value);
        return this;
    }

    Listing<E> scope(AccessPolicy.VisibleScope scope, Actor actor) {
        conditions.add(scope.jpql());
        if (scope.usesActor()) params.put("actorId", actor.id());
        if (scope.usesTenant()) params.put("tenantId", actor.tenantId());
        return this;
    }

    Listing<E> orderBy(String clause) {
        order = " order by " + clause;
        return this;
    }

    <V> Dtos.Page<V> page(int page, int size, Function<E, V> mapper) {
        int safeSize = Math.min(Math.max(size, 1), MAX_SIZE);
        int safePage = Math.max(page, 0);
        EntityManager em = Panache.getEntityManager();
        String where = conditions.isEmpty() ? "" : " where " + String.join(" and ", conditions);
        var count = em.createQuery("select count(" + alias + ") from " + type.getSimpleName() + " " + alias + where, Long.class);
        params.forEach(count::setParameter);
        TypedQuery<E> query = em.createQuery("select " + alias + " from " + type.getSimpleName() + " " + alias + where + order, type);
        params.forEach(query::setParameter);
        List<V> items = query.setFirstResult(safePage * safeSize).setMaxResults(safeSize).getResultList().stream().map(mapper).toList();
        return new Dtos.Page<>(items, safePage, safeSize, count.getSingleResult());
    }

    List<E> top(int limit) {
        EntityManager em = Panache.getEntityManager();
        String where = conditions.isEmpty() ? "" : " where " + String.join(" and ", conditions);
        TypedQuery<E> query = em.createQuery("select " + alias + " from " + type.getSimpleName() + " " + alias + where + order, type);
        params.forEach(query::setParameter);
        return query.setMaxResults(limit).getResultList();
    }
}
