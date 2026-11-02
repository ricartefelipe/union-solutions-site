# A imagem do produto compila sem OpenSSL e, ao rodar com ele, o Prisma baixa o motor de migração na subida. A demonstração
# não tem saída para a internet: o motor certo já vai dentro da imagem.
FROM demo-fluxe-orders-base
RUN ./node_modules/.bin/prisma version
