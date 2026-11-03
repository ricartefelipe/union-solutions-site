// O modelo do provedor mostra a conta em tentativa num campo sem rótulo associado. Leitores de tela precisam do nome.
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('kc-attempted-username')?.setAttribute('aria-label', 'Conta usada neste login');

  const conteudo = document.querySelector('.pf-v5-c-login__main-body') ?? document.querySelector('main');
  if (conteudo) {
    const aviso = document.createElement('p');
    aviso.className = 'union-privacidade';
    const link = document.createElement('a');
    link.href = 'https://unionsolutions.tech/privacidade/';
    link.textContent = 'Política de privacidade';
    aviso.append(link);
    conteudo.append(aviso);
  }
});
