package br.com.unionsolutions.portal.application;

/** Erro previsto da aplicação. A mensagem é sempre segura para o usuário final. */
public class ApiException extends RuntimeException {
    public final int status;
    public final String code;

    public ApiException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    /** Recurso inexistente ou fora do alcance do usuário: as duas situações respondem igual. */
    public static ApiException notFound() {
        return new ApiException(404, "NOT_FOUND", "Registro não encontrado.");
    }

    public static ApiException forbidden() {
        return new ApiException(403, "FORBIDDEN", "Você não tem permissão para esta ação.");
    }

    public static ApiException noAccess() {
        return new ApiException(403, "NO_ACCESS", "Sua conta não tem acesso ao portal.");
    }

    public static ApiException badRequest(String code, String message) {
        return new ApiException(400, code, message);
    }

    public static ApiException conflict(String code, String message) {
        return new ApiException(409, code, message);
    }

    public static ApiException invalidInvitation() {
        return new ApiException(404, "INVITATION_INVALID", "Este convite não é válido ou já expirou. Peça um novo convite.");
    }
}
