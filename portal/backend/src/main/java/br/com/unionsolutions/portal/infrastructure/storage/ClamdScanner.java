package br.com.unionsolutions.portal.infrastructure.storage;

import br.com.unionsolutions.portal.application.Ports;
import io.quarkus.arc.DefaultBean;
import jakarta.enterprise.context.ApplicationScoped;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/** Protocolo INSTREAM do clamd. Qualquer resposta diferente de OK ou FOUND é erro, e erro não libera o arquivo. */
@DefaultBean
@ApplicationScoped
public class ClamdScanner implements Ports.MalwareScanner {
    @ConfigProperty(name = "portal.scan.host") String host;
    @ConfigProperty(name = "portal.scan.port") int port;
    @ConfigProperty(name = "portal.scan.chunk-timeout-ms") int timeoutMs;

    @Override
    public Ports.ScanVerdict scan(InputStream content) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), 5000);
            socket.setSoTimeout(timeoutMs);
            DataOutputStream out = new DataOutputStream(socket.getOutputStream());
            out.write("zINSTREAM\0".getBytes(StandardCharsets.US_ASCII));
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = content.read(buffer)) > 0) {
                out.writeInt(read);
                out.write(buffer, 0, read);
            }
            out.writeInt(0);
            out.flush();
            String reply = new String(socket.getInputStream().readAllBytes(), StandardCharsets.US_ASCII).replace("\0", "").trim();
            if (reply.endsWith("OK")) return new Ports.ScanVerdict(true, null);
            if (reply.endsWith("FOUND")) {
                String signature = reply.substring(reply.indexOf(':') + 1, reply.length() - "FOUND".length()).trim();
                return new Ports.ScanVerdict(false, signature);
            }
            throw new IllegalStateException("Resposta inesperada do scanner");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
