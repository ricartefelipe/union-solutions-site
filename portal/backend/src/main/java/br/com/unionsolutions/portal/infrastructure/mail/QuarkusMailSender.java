package br.com.unionsolutions.portal.infrastructure.mail;

import br.com.unionsolutions.portal.application.Ports;
import io.quarkus.mailer.Mail;
import io.quarkus.mailer.Mailer;
import io.quarkus.arc.DefaultBean;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
@DefaultBean
public class QuarkusMailSender implements Ports.MailSender {
    @Inject Mailer mailer;

    @Override
    public void send(String recipient, String subject, String text) {
        mailer.send(Mail.withText(recipient, subject, text));
    }
}
