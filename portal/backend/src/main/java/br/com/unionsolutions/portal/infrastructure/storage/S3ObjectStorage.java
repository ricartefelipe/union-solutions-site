package br.com.unionsolutions.portal.infrastructure.storage;

import br.com.unionsolutions.portal.application.Ports;
import io.quarkus.arc.DefaultBean;
import jakarta.enterprise.context.ApplicationScoped;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Path;
import java.util.Optional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3ClientBuilder;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;

/** Bucket privado com interface S3. Arquivos só saem pela API, depois da autorização: não há URL pública. */
@DefaultBean
@ApplicationScoped
public class S3ObjectStorage implements Ports.ObjectStorage {
    @ConfigProperty(name = "portal.storage.endpoint") Optional<String> endpoint;
    @ConfigProperty(name = "portal.storage.region") String region;
    @ConfigProperty(name = "portal.storage.bucket") String bucket;
    @ConfigProperty(name = "portal.storage.access-key") Optional<String> accessKey;
    @ConfigProperty(name = "portal.storage.secret-key") Optional<String> secretKey;
    @ConfigProperty(name = "portal.storage.path-style") boolean pathStyle;
    @ConfigProperty(name = "portal.storage.create-bucket") boolean createBucket;

    private volatile S3Client client;

    private S3Client client() {
        if (client == null) {
            synchronized (this) {
                if (client == null) client = build();
            }
        }
        return client;
    }

    private S3Client build() {
        S3ClientBuilder builder = S3Client.builder()
                .httpClient(UrlConnectionHttpClient.create())
                .region(Region.of(region))
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(pathStyle).build())
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey.orElse(""), secretKey.orElse(""))));
        endpoint.filter(e -> !e.isBlank()).ifPresent(e -> builder.endpointOverride(URI.create(e)));
        S3Client s3 = builder.build();
        if (createBucket) {
            try {
                s3.headBucket(b -> b.bucket(bucket));
            } catch (NoSuchBucketException e) {
                s3.createBucket(b -> b.bucket(bucket));
            }
        }
        return s3;
    }

    @Override
    public void put(String key, Path content, long size, String contentType) {
        client().putObject(b -> b.bucket(bucket).key(key).contentLength(size).contentType(contentType), RequestBody.fromFile(content));
    }

    @Override
    public InputStream open(String key) {
        return client().getObject(b -> b.bucket(bucket).key(key));
    }

    @Override
    public void copy(String fromKey, String toKey) {
        client().copyObject(b -> b.sourceBucket(bucket).sourceKey(fromKey).destinationBucket(bucket).destinationKey(toKey));
    }

    @Override
    public void delete(String key) {
        client().deleteObject(b -> b.bucket(bucket).key(key));
    }
}
