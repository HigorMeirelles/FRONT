export default class Tabs {
  #root;
  #nav;
  #botoes = [];
  #paineis = [];
  #index = 0;

  #onClick;
  #onKeyDown;

  constructor(root) {
    this.#root = typeof root === "string" ? document.querySelector(root) : root;
    if (!this.#root) throw new Error("[Tabs] root não encontrado");

    this.#nav = this.#root.querySelector(":scope > nav");
    const main = this.#root.querySelector(":scope > main");
    if (!this.#nav || !main) throw new Error("[Tabs] estrutura nav/main inválida");

    this.#botoes = Array.from(this.#nav.querySelectorAll(":scope > button"));
    this.#paineis = Array.from(main.querySelectorAll(":scope > section"));

    const n = Math.min(this.#botoes.length, this.#paineis.length);
    this.#botoes = this.#botoes.slice(0, n);
    this.#paineis = this.#paineis.slice(0, n);

    // ARIA
    this.#nav.setAttribute("role", "tablist");
    if (!this.#nav.hasAttribute("aria-label")) this.#nav.setAttribute("aria-label", "Seções");

    const uid = Math.random().toString(36).slice(2, 9);

    this.#botoes.forEach((btn, i) => {
      btn.type = "button";
      btn.setAttribute("role", "tab");
      if (!btn.id) btn.id = `tab-${uid}-${i}`;

      const panel = this.#paineis[i];
      panel.setAttribute("role", "tabpanel");
      if (!panel.id) panel.id = `panel-${uid}-${i}`;

      btn.setAttribute("aria-controls", panel.id);
      panel.setAttribute("aria-labelledby", btn.id);

      btn.setAttribute("aria-selected", "false");
      btn.tabIndex = -1;
      panel.hidden = true;
    });

    // eventos (delegação no nav)
    this.#onClick = (e) => {
      const btn = e.target.closest('button[role="tab"]');
      if (!btn) return;
      const idx = this.#botoes.indexOf(btn);
      if (idx >= 0) this.ativar(idx);
    };

    this.#onKeyDown = (e) => {
      const btn = e.target.closest('button[role="tab"]');
      if (!btn) return;

      const current = this.#botoes.indexOf(btn);
      if (current < 0) return;

      let next = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = current + 1;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = current - 1;
      if (e.key === "Home") next = 0;
      if (e.key === "End") next = this.#botoes.length - 1;
      if (next == null) return;

      e.preventDefault();
      if (next < 0) next = this.#botoes.length - 1;
      if (next >= this.#botoes.length) next = 0;
      this.ativar(next);
    };

    this.#nav.addEventListener("click", this.#onClick);
    this.#nav.addEventListener("keydown", this.#onKeyDown);

    // inicial: primeiro painel visível ou 0
    const idxHtml = this.#paineis.findIndex(p => p.hidden === false);
    this.ativar(idxHtml >= 0 ? idxHtml : 0, { focus: false });
  }

  ativar(index, { focus = true } = {}) {
    index = Math.max(0, Math.min(index, this.#paineis.length - 1));
    this.#index = index;

    this.#botoes.forEach((btn, i) => {
      const ativo = i === index;
      btn.setAttribute("aria-selected", ativo ? "true" : "false");
      btn.tabIndex = ativo ? 0 : -1;
      btn.toggleAttribute("data-ativo", ativo);
    });

    this.#paineis.forEach((p, i) => (p.hidden = i !== index));

    if (focus) this.#botoes[index].focus();
  }

  destroy() {
    this.#nav?.removeEventListener("click", this.#onClick);
    this.#nav?.removeEventListener("keydown", this.#onKeyDown);
  }
}
