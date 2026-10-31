# Só para o ambiente de prova. Chromium, Firefox e WebKit reais, com a autoridade de teste confiada apenas dentro deste container.
FROM mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea
COPY --from=docker:29-cli@sha256:5e6baf67325a79f64ed3bed6863954d5e05d0f3d4e57cbdb14809346814bbfdb /usr/local/bin/docker /usr/local/bin/docker
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends libnss3-tools >/dev/null && rm -rf /var/lib/apt/lists/*
WORKDIR /e2e
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY playwright.config.js ./
COPY tests ./tests
COPY --chmod=0755 prova-entrada.sh /usr/local/bin/prova-entrada
ENTRYPOINT ["/usr/local/bin/prova-entrada"]
