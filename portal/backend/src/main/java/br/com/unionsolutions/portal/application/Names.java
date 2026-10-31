package br.com.unionsolutions.portal.application;

import br.com.unionsolutions.portal.domain.AppUser;
import br.com.unionsolutions.portal.domain.Organization;
import br.com.unionsolutions.portal.domain.Project;
import java.util.UUID;

/** Nomes usados nas respostas. Consultas por ID: quem chama já verificou o acesso ao registro. */
final class Names {
    private Names() {}

    static String user(UUID id) {
        if (id == null) return null;
        AppUser user = AppUser.findById(id);
        if (user == null) return null;
        return user.displayName != null ? user.displayName : user.email;
    }

    static String organization(UUID id) {
        if (id == null) return null;
        Organization org = Organization.findById(id);
        return org == null ? null : org.name;
    }

    static String project(UUID id) {
        if (id == null) return null;
        Project project = Project.findById(id);
        return project == null ? null : project.name;
    }
}
