# Segurança e limitações

Este relatório descreve o que foi implementado e testado. **Não atesta conformidade com a LGPD nem garante segurança**, e o portal não passou por auditoria nem por teste de invasão independentes.

## Controles implementados

| Tema | Como funciona | Evidência |
| --- | --- | --- |
| Autenticação | OIDC com Authorization Code e PKCE no Keycloak. Não há login próprio nem cadastro público | E2E |
| Sessão | Cookie HttpOnly, SameSite=Lax, Secure e `__Host-`, só com identificador opaco. No servidor ficam o hash do identificador, o `sub` do provedor e os tokens cifrados. Criar e atualizar são operações distintas: renovação e atividade são `UPDATE` condicionais (sessão existente, não vencida, versão lida), então uma sessão encerrada não renasce a partir de uma requisição que começou antes do logout, e duas renovações não sobrescrevem a mais nova. Expira por inatividade (1 h) e por prazo absoluto (12 h) | Testes com PostgreSQL real (`frontend/tests`) e E2E |
| Transição de sessões | Sessões anteriores a esta versão, sem vínculo com a conta do provedor, são encerradas na atualização; nenhuma sessão sem vínculo é aceita, renovada ou tocada | Testes com PostgreSQL real, atualização local |
| Administrador remanescente | Alterações no conjunto de `UNION_ADMIN` serializadas no banco, com releitura do alvo e de quem pede; nunca zero ativos | Integração com concorrência real |
| Cota de arquivos | Reserva por organização sob lock transacional; objeto de transação revertida é apagado ou registrado para limpeza; espaço só é liberado após exclusão confirmada pelo armazenamento | Integração |
| Recuperação de MFA | Procedimento operacional com auditoria antes e depois, verificação final, encerramento de sessões no provedor e no portal, segredo fora de argumentos | Cenários de operação em ambiente de prova |
| MFA | TOTP obrigatório para a equipe da Union em produção, com recuperação pela administração | E2E em produção |
| OIDC | State, nonce e PKCE S256. Retorno fora da lista é recusado, e senha direta no endpoint de token também | E2E em produção |
| Proxy | Só 80 e 443 publicadas. Console, realm `master`, conta, saúde e métricas fechados. TLS 1.3 verificado, HSTS e limite de 40 MB | E2E em produção e auditoria |
| Token na API | Assinatura, emissor e audiência validados pela API, a cada requisição | Integração |
| Revogação | A conta é consultada no banco a cada requisição: efeito imediato, mesmo com token válido | Integração e E2E |
| Isolamento | Tenant resolvido da identidade. Listagens e detalhes filtrados no servidor. IDs fora do alcance respondem 404 | Integração e E2E |
| Vínculos | Chaves compostas com `tenant_id`, gatilhos para tenant imutável e participantes do mesmo tenant | Integração |
| Mass assignment | Registros fechados: campo desconhecido responde 400 | Integração |
| CSRF | Token da sessão e verificação de origem em toda mutação pelo BFF, além de SameSite | E2E |
| XSS | React escapa o conteúdo. CSP com nonce, sem HTML dinâmico. HTML e SVG enviados não são aceitos | E2E |
| Redirecionamentos | `returnTo` só aceita caminho relativo | E2E |
| Convites | Token de 256 bits, guardado só como hash, com validade e uso único atômico. Destinatário conferido com o e-mail verificado do token | Integração e E2E |
| Arquivos | Lista fechada, tipo confirmado pelo conteúdo, chaves internas, quarentena, antivírus e download só como anexo | Integração e E2E |
| Falha do antivírus | Falha nunca libera o arquivo | Integração e E2E |
| Notas internas | Filtradas na consulta da API | Integração e E2E |
| Concorrência | Bloqueio de linha e restrição única nas decisões; versão otimista nas edições | Integração |
| Limite de taxa | Contado no PostgreSQL: convites públicos, aceite, criação de convite e upload. Login: proteção do Keycloak | Integração |
| Cache e indexação | `no-store` e `noindex` em tudo, `Disallow: /` no robots | E2E |
| Produção | Recusa de iniciar com dados de demonstração, hosts fictícios ou locais, SMTP sem TLS, depuração ou valores de exemplo | Containers reais |
| Containers | Sem root, exceto o início do ClamAV. `no-new-privileges`, capacidades retiradas, sistema de arquivos só leitura em proxy, web e API | Auditoria |

## Dados tratados

O inventário, os cookies e os campos a preencher estão em [`PRIVACIDADE.md`](PRIVACIDADE.md).

Avisos e e-mails: o e-mail de aviso leva só título e link; o conteúdo fica no portal, atrás do login. A fila de e-mails mostra destinatários mascarados e descarta o corpo depois do envio. Convites continuam com token em hash e uso único.

## Vulnerabilidades

Resultados, avaliação individual das ocorrências altas e decisão pendente em [`VULNERABILIDADES.md`](VULNERABILIDADES.md).

## Limitações concretas

**Segurança**

- Sem auditoria externa nem teste de invasão.
- MFA só para a equipe da Union. Clientes entram com senha, e não há códigos de recuperação do TOTP.
- Isolamento na aplicação e em restrições do banco, sem Row-Level Security. Uma falha de consulta na aplicação não teria a segunda barreira do banco para leitura.
- Antivírus detecta o que suas assinaturas conhecem: arquivo limpo não significa arquivo inofensivo.
- A verificação de tipo olha assinatura e extensão, sem inspecionar a estrutura de DOCX, XLSX ou PPTX.
- Comunicação entre containers sem TLS, inclusive com o banco e o armazenamento: depende das redes internas do Docker no mesmo servidor.
- Variáveis de ambiente dos containers não são um cofre: quem administra o Docker consegue lê-las.
- A auditoria não é inviolável (ver `OPERACAO.md`).
- Conta desativada só no Keycloak continua com acesso até o token vencer, no máximo 5 minutos. Use a revogação do portal para efeito imediato.
- A recuperação de MFA registra o operador que executa no servidor. Quem tem root ou acesso ao Docker pode contornar o procedimento; o registro não protege contra esse administrador.
- Com o Keycloak fora do ar, sair encerra só a sessão do portal, e a do provedor continua ativa até expirar. A tela avisa a pessoa.
- Provedor de identidade e portal compartilham o mesmo host, em caminhos diferentes. Foi uma escolha para simplificar DNS e certificado, e uma falha de XSS em um alcançaria o outro. A CSP com nonce e a ausência de HTML dinâmico reduzem esse risco.
- O certificado público, o SMTP real e o destino real de backup não foram exercitados.

**Funcionais**

- Não há notificação por e-mail além de convites e dos e-mails do Keycloak. Ninguém é avisado por e-mail de nova entrega ou resposta de suporte.
- Um objeto pode ficar órfão no bucket se a transação falhar logo após o envio. Não há limpeza automática.
- Cada usuário pertence a uma única organização.
- A prioridade e o prazo das solicitações de suporte são informativos: não há cálculo de SLA.
- A aprovação registra concordância com a entrega. Não é assinatura eletrônica, e documentos chamados "contrato" são só arquivos.
- As telas do Keycloak usam o tema próprio com ajustes simples de cor, sem o logotipo, e seus e-mails seguem o modelo padrão.
- Escala: uma instância em uma VPS. Sem teste de capacidade: as medições em `EVIDENCIAS.md` são observações, e não indicam quantos clientes o ambiente suporta.
