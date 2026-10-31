package br.com.unionsolutions.portal.infrastructure.rest;

import br.com.unionsolutions.portal.application.ApiException;
import br.com.unionsolutions.portal.application.FileService;
import jakarta.persistence.OptimisticLockException;
import jakarta.persistence.PersistenceException;
import jakarta.validation.ConstraintViolationException;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.StreamingOutput;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jboss.logging.Logger;
import org.jboss.logging.MDC;
import org.jboss.resteasy.reactive.RestResponse;
import org.jboss.resteasy.reactive.server.ServerExceptionMapper;
import org.jboss.resteasy.reactive.server.ServerRequestFilter;
import org.jboss.resteasy.reactive.server.ServerResponseFilter;
import org.jboss.resteasy.reactive.multipart.FileUpload;

/** Identificador de correlação, formato de erro único e resposta de download. */
public class WebSupport {
    private static final Logger LOG = Logger.getLogger(WebSupport.class);
    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9-]{8,64}$");

    public record ErrorBody(String code, String message, String correlationId, List<Map<String, String>> details) {}

    @ServerRequestFilter(preMatching = true)
    public void correlation(ContainerRequestContext request) {
        String incoming = request.getHeaderString("X-Correlation-Id");
        MDC.put("correlationId", incoming != null && SAFE_ID.matcher(incoming).matches() ? incoming : UUID.randomUUID().toString());
    }

    @ServerResponseFilter
    public void correlationAndCache(ContainerResponseContext response) {
        Object id = MDC.get("correlationId");
        if (id != null) response.getHeaders().putSingle("X-Correlation-Id", id.toString());
        // Dados privados nunca entram em cache compartilhado.
        response.getHeaders().putSingle("Cache-Control", "private, no-store");
        response.getHeaders().putSingle("X-Content-Type-Options", "nosniff");
        MDC.remove("correlationId");
    }

    private static String correlationId() {
        Object id = MDC.get("correlationId");
        return id == null ? null : id.toString();
    }

    /** Erros são sempre JSON, inclusive em endpoints que produzem arquivo. */
    private static RestResponse<ErrorBody> error(int status, ErrorBody body) {
        return RestResponse.ResponseBuilder.<ErrorBody>create(status).entity(body).type(MediaType.APPLICATION_JSON_TYPE).build();
    }

    @ServerExceptionMapper
    public RestResponse<ErrorBody> map(ApiException e) {
        return error(e.status, new ErrorBody(e.code, e.getMessage(), correlationId(), List.of()));
    }

    @ServerExceptionMapper
    public RestResponse<ErrorBody> map(ConstraintViolationException e) {
        List<Map<String, String>> details = e.getConstraintViolations().stream().map(v -> {
            String path = v.getPropertyPath().toString();
            return Map.of("field", path.substring(path.lastIndexOf('.') + 1), "message", v.getMessage());
        }).toList();
        return error(400, new ErrorBody("VALIDATION", "Revise os campos informados.", correlationId(), details));
    }

    @ServerExceptionMapper
    public RestResponse<ErrorBody> map(WebApplicationException e) {
        int status = e.getResponse().getStatus();
        String message = status == 404 ? "Registro não encontrado." : status == 400 ? "Requisição inválida." : "Não foi possível concluir a operação.";
        String code = status == 404 ? "NOT_FOUND" : status == 400 ? "BAD_REQUEST" : "REQUEST_ERROR";
        return error(status, new ErrorBody(code, message, correlationId(), List.of()));
    }

    /** Conflitos de concorrência chegam encapsulados pela transação. O detalhe interno nunca vai para a resposta. */
    @ServerExceptionMapper
    public RestResponse<ErrorBody> map(Exception e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof ApiException api) return map(api);
            if (t instanceof OptimisticLockException || t instanceof org.hibernate.StaleStateException) {
                return error(409, new ErrorBody("STALE_VERSION", "O registro foi alterado por outra pessoa. Recarregue a página.", correlationId(), List.of()));
            }
            if (t instanceof org.hibernate.exception.ConstraintViolationException || t instanceof PersistenceException && t.getMessage() != null && t.getMessage().contains("constraint")) {
                return error(409, new ErrorBody("CONFLICT", "A operação conflita com um registro existente.", correlationId(), List.of()));
            }
        }
        LOG.errorf(e, "Erro não tratado");
        return error(500, new ErrorBody("INTERNAL", "Ocorreu um erro inesperado. Informe o código de correlação ao suporte.", correlationId(), List.of()));
    }

    static FileService.Upload upload(FileUpload file) {
        if (file == null) throw ApiException.badRequest("FILE_REQUIRED", "Selecione um arquivo.");
        return new FileService.Upload(file.uploadedFile(), file.fileName());
    }

    /** Sempre como anexo: o navegador não renderiza arquivo recebido. */
    static Response attachment(FileService.Download download) {
        StreamingOutput stream = out -> {
            try (var in = download.content()) {
                in.transferTo(out);
            }
        };
        String encoded = URLEncoder.encode(download.file().originalName, StandardCharsets.UTF_8).replace("+", "%20");
        return Response.ok(stream)
                .header("Content-Type", download.file().mediaType)
                .header("Content-Length", download.file().sizeBytes)
                .header("Content-Disposition", "attachment; filename*=UTF-8''" + encoded)
                .build();
    }
}
