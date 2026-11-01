# Destino SFTP de prova: um servidor OpenSSH que só aceita a chave do backup. Substitui, no ensaio, a conta de hospedagem.
FROM alpine:3.22@sha256:2e0b81d60597f449baa56dc25d355367869d2dca4cd57e866f1e2b52af3eb55f
RUN apk add --no-cache openssh-server && adduser -D -s /bin/sh backup && sed -i 's/^backup:!/backup:*/' /etc/shadow \
  && printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\nAllowUsers backup\nSubsystem sftp internal-sftp\n' >> /etc/ssh/sshd_config
COPY --chmod=0755 sftp-alvo-entrada.sh /usr/local/bin/sftp-alvo-entrada
EXPOSE 22
ENTRYPOINT ["/usr/local/bin/sftp-alvo-entrada"]
