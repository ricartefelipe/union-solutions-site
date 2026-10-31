// O modelo do provedor mostra a conta em tentativa num campo sem rótulo associado. Leitores de tela precisam do nome.
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('kc-attempted-username')?.setAttribute('aria-label', 'Conta usada neste login');
});
