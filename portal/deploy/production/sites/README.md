# Sites adicionais do proxy

Cada arquivo `*.caddy` aqui vira um site servido pelo mesmo proxy do portal, com certificado próprio por ACME. É assim que as
demonstrações de produtos (`demos/` na raiz do repositório) entram na mesma VPS: os containers delas ficam na rede `demos`,
que o proxy alcança e o restante do portal não. Só `00-vazio.caddy` é versionado; os demais são copiados por `demos/<produto>/demo.sh instalar`.
Depois de alterar um arquivo, reinicie o proxy: `docker compose --env-file .env restart proxy` (o portal fica indisponível por poucos segundos).
