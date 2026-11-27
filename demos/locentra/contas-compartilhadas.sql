-- Demonstração pública: a senha das contas da carga é publicada, então os dois freios de login por conta do produto
-- (Application::Identity::Authenticate) só serviriam para um visitante travar as contas compartilhadas dos outros:
--   * 5 senhas erradas bloqueiam a conta por 15 minutos (users.failed_login_count e users.locked_until);
--   * o balde login:email:<e-mail> aceita 10 entradas a cada 15 minutos, contando também as certas, somando todos os
--     visitantes.
-- Os gatilhos abaixo neutralizam os dois e mantêm o limite por IP (login:ip, 30 a cada 5 minutos), que vale para cada
-- visitante graças ao TRUSTED_PROXIES. Roda como superusuário depois da carga (demo.sh, ajustar_carga); é idempotente.
SET client_min_messages = warning;
CREATE OR REPLACE FUNCTION public.demo_sem_bloqueio() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.failed_login_count := 0;
  NEW.locked_until := NULL;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS demo_sem_bloqueio ON public.users;
CREATE TRIGGER demo_sem_bloqueio BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.demo_sem_bloqueio();
UPDATE public.users SET failed_login_count = 0, locked_until = NULL
  WHERE failed_login_count <> 0 OR locked_until IS NOT NULL;

-- O contador do balde por e-mail nunca passa de 1 (o INSERT já nasce com 1; o ON CONFLICT DO UPDATE passa por aqui).
CREATE OR REPLACE FUNCTION public.demo_sem_limite_por_conta() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.bucket LIKE 'login:email:%' THEN
    NEW.hits := 1;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS demo_sem_limite_por_conta ON public.rate_limits;
CREATE TRIGGER demo_sem_limite_por_conta BEFORE INSERT OR UPDATE ON public.rate_limits
  FOR EACH ROW EXECUTE FUNCTION public.demo_sem_limite_por_conta();
DELETE FROM public.rate_limits WHERE bucket LIKE 'login:email:%';

-- Com o TRUSTED_PROXIES, o produto grava o IP público de quem aprova um orçamento ou aceita um contrato e o mostra em
-- /orcamentos/:id, /contratos/:id e /auditoria. Numa conta compartilhada, o visitante seguinte leria o IP do anterior.
-- Os gatilhos descartam o IP (e o navegador do aceite) na gravação; as telas mostram "IP não informado". O prefixo
-- demo_ faz o gatilho de quotes rodar antes de quotes_protect_history (os BEFORE disparam em ordem alfabética).
CREATE OR REPLACE FUNCTION public.demo_sem_ip_orcamento() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.approved_ip := NULL;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS demo_sem_ip_orcamento ON public.quotes;
CREATE TRIGGER demo_sem_ip_orcamento BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.demo_sem_ip_orcamento();

CREATE OR REPLACE FUNCTION public.demo_sem_ip_aceite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.accepted_ip := NULL;
  NEW.user_agent := NULL;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS demo_sem_ip_aceite ON public.contract_documents;
CREATE TRIGGER demo_sem_ip_aceite BEFORE INSERT OR UPDATE ON public.contract_documents
  FOR EACH ROW EXECUTE FUNCTION public.demo_sem_ip_aceite();

CREATE OR REPLACE FUNCTION public.demo_sem_ip_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.ip := NULL;
  NEW.details := NEW.details - 'ip';
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS demo_sem_ip_auditoria ON public.audit_events;
CREATE TRIGGER demo_sem_ip_auditoria BEFORE INSERT ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.demo_sem_ip_auditoria();
