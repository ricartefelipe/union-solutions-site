# Sites adicionais do proxy

Cada arquivo `*.caddy` aqui vira um site servido pelo proxy do portal, com certificado próprio por ACME. Só `00-vazio.caddy` é versionado. As demonstrações de produtos não usam mais esta pasta: rodam em outra VPS, com proxy próprio (`demos/proxy`).

Depois de alterar um arquivo, reinicie o proxy: `docker compose --env-file .env restart proxy` (o portal fica indisponível por poucos segundos).
