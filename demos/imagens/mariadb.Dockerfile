# Banco da demonstração do cards. Mesmo caso do PostgreSQL: o gosu da imagem oficial foi compilado com um Go antigo
# e só serve para trocar de root para mysql. O container inicia como mysql, dono de /var/lib/mysql e /run/mysqld.
# mariadb:10.11, fixada pelo digest.
FROM mariadb@sha256:d769e37960821dfdcf096954f6e7ac89f747e116c1bba98e48edd265dfc7deae
RUN rm -f /usr/local/bin/gosu
USER mysql
