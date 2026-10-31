package br.com.unionsolutions.portal.application;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Locale;
import java.util.Map;

/**
 * Lista fechada de formatos. O tipo é decidido pela extensão e confirmado pelo conteúdo: o Content-Type enviado
 * pelo navegador é ignorado. HTML e SVG não são aceitos, e nenhum arquivo é extraído ou executado.
 */
public final class FileRules {
    private FileRules() {}

    private static final byte[] PDF = {'%', 'P', 'D', 'F', '-'};
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] ZIP = {'P', 'K', 0x03, 0x04};

    private record Rule(String mediaType, byte[] signature) {}

    private static final Map<String, Rule> RULES = Map.of(
            "pdf", new Rule("application/pdf", PDF),
            "png", new Rule("image/png", PNG),
            "jpg", new Rule("image/jpeg", JPEG),
            "jpeg", new Rule("image/jpeg", JPEG),
            "docx", new Rule("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ZIP),
            "xlsx", new Rule("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ZIP),
            "pptx", new Rule("application/vnd.openxmlformats-officedocument.presentationml.presentation", ZIP),
            "txt", new Rule("text/plain; charset=utf-8", null),
            "csv", new Rule("text/csv; charset=utf-8", null));

    /** Só o nome-base, sem caminho nem caracteres de controle. O armazenamento usa chave própria. */
    public static String safeName(String name) {
        if (name == null) return "arquivo";
        String base = name.replace('\\', '/');
        base = base.substring(base.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}\"<>:|?*]", "").trim();
        if (base.isEmpty() || base.startsWith(".")) return "arquivo";
        return base.length() > 200 ? base.substring(base.length() - 200) : base;
    }

    /** Retorna o tipo a registrar ou lança erro se o arquivo não for aceito. */
    public static String detect(String safeName, Path content) throws IOException {
        int dot = safeName.lastIndexOf('.');
        String extension = dot < 0 ? "" : safeName.substring(dot + 1).toLowerCase(Locale.ROOT);
        Rule rule = RULES.get(extension);
        if (rule == null) throw notAccepted();
        byte[] head;
        try (InputStream in = Files.newInputStream(content)) {
            head = in.readNBytes(8192);
        }
        if (head.length == 0) throw ApiException.badRequest("FILE_EMPTY", "O arquivo está vazio.");
        if (rule.signature() == null) {
            if (!isPlainText(head)) throw notAccepted();
        } else if (head.length < rule.signature().length
                || !Arrays.equals(Arrays.copyOf(head, rule.signature().length), rule.signature())) {
            throw notAccepted();
        }
        return rule.mediaType();
    }

    private static boolean isPlainText(byte[] head) {
        for (byte b : head) {
            if (b == 0) return false;
        }
        // Um caractere pode estar cortado no fim da amostra.
        int length = head.length == 8192 ? head.length - 3 : head.length;
        try {
            StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(head, 0, length));
            return true;
        } catch (CharacterCodingException e) {
            return false;
        }
    }

    private static ApiException notAccepted() {
        return ApiException.badRequest("FILE_NOT_ACCEPTED", "Formato não aceito ou conteúdo incompatível. Use PDF, PNG, JPG, DOCX, XLSX, PPTX, TXT ou CSV.");
    }
}
