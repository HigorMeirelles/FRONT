function reflexo(el) {
  const selecionado = el.tagName === 'SELECT' ? el.selectedOptions[0] : el;
  const refId = selecionado?.dataset.reflexo;
  document.querySelectorAll('[data-reflexo]').forEach(opt => {
    const destinoId = opt.dataset.reflexo;
    const box = document.getElementById(destinoId)?.closest('[class^="box-"]');
    if (box) box.style.display = (refId === destinoId) ? 'flex' : 'none';
  });
}