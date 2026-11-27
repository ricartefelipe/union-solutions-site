-- Demonstração pública: a senha é conhecida por todos, então o bloqueio por tentativas (Devise lockable) só serviria
-- para um visitante travar as contas compartilhadas dos outros. O gatilho zera o contador a cada gravação: o Devise
-- nunca chega às 5 falhas, não bloqueia e não envia e-mail de desbloqueio. Roda como superusuário depois da carga
-- (demo.sh, ajustar_carga); é idempotente.
CREATE OR REPLACE FUNCTION public.demo_sem_bloqueio() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.failed_attempts := 0;
  NEW.locked_at := NULL;
  NEW.unlock_token := NULL;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS demo_sem_bloqueio ON public.users;
CREATE TRIGGER demo_sem_bloqueio BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.demo_sem_bloqueio();
UPDATE public.users SET failed_attempts = 0, locked_at = NULL, unlock_token = NULL
  WHERE failed_attempts <> 0 OR locked_at IS NOT NULL OR unlock_token IS NOT NULL;
-- Contas compartilhadas: a ativação do segundo fator fica fechada no proxy, então a exigência para proprietários e
-- financeiro é desligada nas organizações da carga (senão o aviso de ativação aponta para uma página fechada).
UPDATE public.organizations SET mfa_required_for_privileged = false WHERE mfa_required_for_privileged;
