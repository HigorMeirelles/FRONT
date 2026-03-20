export default class SelectRadio {
  static LIMITE_FILTRO = 2;
  static FECHAR_DELAY_MS = 180;

  #root;
  #itens = []; // [{ el, input, texto }]
  #search = null;
  #modo = "radio"; // radio | checkbox

  #closeTimer = null;
  #observer = null;
  #silenciarObserver = false;

  // handlers
  #onRootClick;
  #onRootKeyDown;
  #onDocPointerDown;
  #onSearchInput;
  #onSearchKeyDown;

  constructor(root) {
    this.#root = typeof root === "string" ? document.querySelector(root) : root;
    if (!this.#root) throw new Error("[Select] root não encontrado");

    this.#recoletar();

    // observa alterações internas (HTML injetado, opções mudando etc.)
    this.#observer = new MutationObserver(() => {
      if (this.#silenciarObserver) return;
      this.#recoletar();
    });
    this.#observer.observe(this.#root, { childList: true, subtree: true });

    // eventos
    this.#onRootClick = e => this.#handleClick(e);
    this.#onRootKeyDown = e => this.#handleKeyDown(e);
    this.#onDocPointerDown = e => this.#handleCliqueFora(e);

    this.#root.addEventListener("click", this.#onRootClick);
    this.#root.addEventListener("keydown", this.#onRootKeyDown);
    document.addEventListener("pointerdown", this.#onDocPointerDown, true);

    // acessibilidade
    this.#root.setAttribute("role", "listbox");
    this.#root.tabIndex = this.#root.tabIndex >= 0 ? this.#root.tabIndex : 0;

    this.#render();
  }

  /* ================= API ================= */

  abrir() {
    this.#limparTimer();
    if (!this.aberto()) {
      this.#root.setAttribute("data-open", "");
      this.#renderBotao();
    }
    this.#search?.focus?.();
    if (this.#search) this.#aplicarFiltro(this.#search.value);
  }

  fechar({ aplicarMatchDoFiltro = false } = {}) {
    this.#limparTimer();

    if (aplicarMatchDoFiltro) this.#autoSelecionarPorFiltro();

    if (this.aberto()) {
      this.#root.removeAttribute("data-open");
      this.#renderBotao();
    }

    if (this.#search) {
      this.#search.value = "";
      this.#aplicarFiltro("");
    }
  }

  aberto() {
    return this.#root.hasAttribute("data-open");
  }

  destroy() {
    this.#limparTimer();
    this.#observer?.disconnect();

    this.#root.removeEventListener("click", this.#onRootClick);
    this.#root.removeEventListener("keydown", this.#onRootKeyDown);
    document.removeEventListener("pointerdown", this.#onDocPointerDown, true);

    if (this.#search) {
      this.#search.removeEventListener("input", this.#onSearchInput);
      this.#search.removeEventListener("keydown", this.#onSearchKeyDown);
    }
  }

  /* ============== Internos ============== */

  #recoletar() {
    const labels = Array.from(this.#root.querySelectorAll(":scope > label"));

    this.#itens = labels
      .map(el => {
        const input = el.querySelector('input[type="radio"], input[type="checkbox"]');
        if (!input) return null;
        return {
          el,
          input,
          texto: SelectRadio.#norm(el.textContent)
        };
      })
      .filter(Boolean);

    this.#modo = this.#itens.some(i => i.input.type === "checkbox")
      ? "checkbox"
      : "radio";

    // search
    this.#search = this.#root.querySelector(':scope > input[type="search"]');
    if (this.#itens.length > SelectRadio.LIMITE_FILTRO) {
      this.#garantirSearch();
    }

    this.#render();
  }

  #render() {
    // evita que mudanças internas disparem o próprio observer
    this.#silenciarObserver = true;
    try {
      this.#renderResumoCheckbox();
      this.#renderBotao();
    } finally {
      this.#silenciarObserver = false;
    }
  }

  #garantirSearch() {
    if (!this.#search) {
      const s = document.createElement("input");
      s.type = "search";
      s.placeholder = "Pesquisar...";
      s.setAttribute("aria-label", "Pesquisar opções");
      s.setAttribute("data-ignore-submit", "");
      this.#root.prepend(s);
      this.#search = s;
    }

    if (!this.#search.dataset.bind) {
      this.#search.dataset.bind = "1";

      this.#onSearchInput = () => this.#aplicarFiltro(this.#search.value);

      this.#onSearchKeyDown = e => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.#autoSelecionarPorFiltro(true);
          if (this.#modo === "radio") this.#agendarFechar();
          else this.#renderResumoCheckbox();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          this.fechar({ aplicarMatchDoFiltro: true });
          this.#root.blur();
        }
      };

      this.#search.addEventListener("input", this.#onSearchInput);
      this.#search.addEventListener("keydown", this.#onSearchKeyDown);
    }
  }

  #handleClick(e) {
    // botão OK/Fechar (expand up/down)
    const btn = e.target.closest("button[data-select-ok]");
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      this.#renderResumoCheckbox();
      this.fechar();
      this.#root.blur();
      return;
    }

    const label = e.target.closest("label");

    // clicou no “corpo” do select
    if (!label) {
      this.abrir();
      return;
    }

    const item = this.#itens.find(i => i.el === label);
    if (!item) return;

    // se estava fechado, abre primeiro e não troca ainda
    if (!this.aberto()) {
      this.abrir();
      e.preventDefault();
      return;
    }

    if (this.#modo === "radio") {
      item.input.checked = true;
      item.input.dispatchEvent(new Event("change", { bubbles: true }));
      this.#agendarFechar();
      return;
    }

    // checkbox: não fecha ao selecionar
    item.input.dispatchEvent(new Event("change", { bubbles: true }));
    this.#renderResumoCheckbox();
  }

  #handleKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      this.fechar({ aplicarMatchDoFiltro: true });
      this.#root.blur();
    }
  }

  #handleCliqueFora(e) {
    if (!this.aberto()) return;
    const clicouDentro = e.target.closest("[data-select]") === this.#root;
    if (!clicouDentro) this.fechar({ aplicarMatchDoFiltro: true });
  }

  #agendarFechar() {
    this.#limparTimer();
    this.#closeTimer = setTimeout(() => this.fechar(), SelectRadio.FECHAR_DELAY_MS);
  }

  #limparTimer() {
    if (this.#closeTimer) {
      clearTimeout(this.#closeTimer);
      this.#closeTimer = null;
    }
  }

  #aplicarFiltro(texto) {
    const q = SelectRadio.#norm(texto);
    if (!q) {
      this.#itens.forEach(i => (i.el.hidden = false));
      return;
    }
    this.#itens.forEach(i => {
      const v = SelectRadio.#norm(i.input.value);
      i.el.hidden = !(i.texto.includes(q) || v.includes(q));
    });
  }

  #autoSelecionarPorFiltro(forcar = false) {
    if (!this.#search) return;
    const raw = this.#search.value ?? "";
    const q = SelectRadio.#norm(raw);
    if (!q || (!forcar && raw.length < 1)) return;

    const pick =
      this.#itens.find(i => SelectRadio.#norm(i.input.value) === q) ||
      this.#itens.find(i => i.texto === q) ||
      this.#itens.find(i => SelectRadio.#norm(i.input.value).startsWith(q)) ||
      this.#itens.find(i => i.texto.startsWith(q)) ||
      this.#itens.find(i => !i.el.hidden);

    if (!pick) return;

    if (this.#modo === "radio") {
      pick.input.checked = true;
      pick.input.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    pick.input.checked = !pick.input.checked;
    pick.input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  #renderResumoCheckbox() {
    if (this.#modo !== "checkbox") return;

    const span = this.#root.querySelector(":scope > span");
    if (!span) return;

    const total = this.#itens.reduce((acc, i) => acc + (i.input.checked ? 1 : 0), 0);

    const txt =
      total === 0 ? "Nenhum selecionado" :
      total === 1 ? "1 selecionado" :
      `${total} selecionados`;

    // anti-loop: só altera se mudou
    if (span.textContent !== txt) span.textContent = txt;
  }

  #renderBotao() {
    const btn = this.#root.querySelector("button");
    if (!btn) return;

    const txt = this.aberto() ? "expand_circle_up" : "expand_circle_down";

    // anti-loop: só altera se mudou
    if (btn.textContent !== txt) btn.textContent = txt;
  }

  static #norm(str) {
    return (str ?? "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }
}
