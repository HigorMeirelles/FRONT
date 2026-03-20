(() => {
  const root = document.querySelector(".guias");
  if (!root) return;

  const menu = root.querySelector("nav > menu");
  if (!menu) return;

  const getTabs = () => Array.from(menu.querySelectorAll('[role="tab"]'));
  const getPanels = () => Array.from(root.querySelectorAll('[role="tabpanel"]'));

  function activate(tab, { focus = false } = {}) {
    const tabs = getTabs();
    const panels = getPanels();

    tabs.forEach(t => {
      const selected = t === tab;
      t.setAttribute("aria-selected", String(selected));
      t.tabIndex = selected ? 0 : -1;
    });

    const panelId = tab.getAttribute("aria-controls");
    panels.forEach(p => (p.hidden = p.id !== panelId));

    if (focus) tab.focus();
  }

  function tabFromTarget(target) {
    if (!(target instanceof Element)) return null;
    if (target.matches('[role="tab"]')) return target;
    return target.closest("li")?.querySelector('[role="tab"]') ?? null;
  }

  function slugify(s) {
    return String(s ?? "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "guia";
  }

  function uniqueId(prefix) {
    // garante único dentro do documento
    let i = 1;
    let id = `${prefix}-${i}`;
    while (document.getElementById(id)) id = `${prefix}-${++i}`;
    return id;
  }

  function setCloseButtonsState() {
    // opcional: deixa visual/semântico consistente (seu CSS já bloqueia pointer-events)
    const canClose = getTabs().length > 1;
    menu.querySelectorAll("[data-close]").forEach(btn => {
      btn.disabled = !canClose;
      btn.setAttribute("aria-disabled", String(!canClose));
    });
  }

  // CLICK (ativar / fechar)
  menu.addEventListener("click", e => {
    const close = e.target.closest("[data-close]");
    if (close) {
      const tabs = getTabs();
      if (tabs.length <= 1) return; // não fecha a última

      const li = close.closest("li");
      const tab = li?.querySelector('[role="tab"]');
      if (!li || !tab) return;

      const wasActive = tab.getAttribute("aria-selected") === "true";

      let next = null;
      if (wasActive) {
        const list = getTabs();
        const i = list.indexOf(tab);
        next = list[i + 1] || list[i - 1];
      }

      // remove painel
      const panelId = tab.getAttribute("aria-controls");
      root.querySelector(`#${CSS.escape(panelId)}`)?.remove();

      // remove guia
      li.remove();

      if (wasActive) {
        const remaining = getTabs();
        if (remaining[0]) activate(next && remaining.includes(next) ? next : remaining[0], { focus: true });
      }

      setCloseButtonsState();
      return;
    }

    const tab = tabFromTarget(e.target);
    if (tab) activate(tab, { focus: true });
  });

  // TECLADO (setas / Home / End)
  menu.addEventListener("keydown", e => {
    const tab = tabFromTarget(e.target);
    if (!tab) return;

    const tabs = getTabs();
    const i = tabs.indexOf(tab);

    let next = null;
    switch (e.key) {
      case "ArrowLeft": next = tabs[i - 1] || tabs.at(-1); break;
      case "ArrowRight": next = tabs[i + 1] || tabs[0]; break;
      case "Home": next = tabs[0]; break;
      case "End": next = tabs.at(-1); break;
      default: return;
    }

    e.preventDefault();
    activate(next, { focus: true });
  });

  /**
   * Cria uma nova guia (tab + panel)
   *
   * @param {Object} opt
   * @param {string} opt.titulo - texto exibido na guia
   * @param {string|Element|DocumentFragment|function(HTMLElement):void} [opt.container]
   *        - string: será inserida como HTML dentro do panel
   *        - Element/Fragment: será anexado ao panel
   *        - function(panel): você monta o DOM dentro do panel (ideal)
   * @param {string} [opt.key] - chave opcional para evitar duplicar (ex.: "usuarios-lista")
   * @param {boolean} [opt.ativar=true] - ativa a guia criada
   * @param {boolean} [opt.foco=true] - foca na guia criada quando ativar
   * @param {boolean} [opt.fechavel=true] - cria botão de fechar
   * @returns {{li: HTMLElement, tab: HTMLButtonElement, panel: HTMLElement}}
   */
  function novaGuia(opt) {
    const {
      titulo,
      container,
      key,
      ativar = true,
      foco = true,
      fechavel = true
    } = opt || {};

    if (!titulo || String(titulo).trim() === "") {
      throw new Error("novaGuia: 'titulo' é obrigatório.");
    }

    // evita duplicar se key existir
	if (key) {
	  const tabExistente = menu.querySelector(`[role="tab"][data-key="${CSS.escape(key)}"]`);
	  if (tabExistente) {
	    const panelId = tabExistente.getAttribute("aria-controls");
	    const panel = root.querySelector(`#${CSS.escape(panelId)}`);

	    // (opcional) atualiza título do tab existente
	    if (titulo) tabExistente.textContent = titulo;

	    // 1) remove DOM antigo -> seu UI.destroy entra via MutationObserver
	    panel.replaceChildren();

	    // 2) injeta novo conteúdo
	    if (typeof container === "function") container(panel);
	    else if (typeof container === "string") panel.innerHTML = container;
	    else if (container instanceof Node) panel.appendChild(container);

	    // 3) ativa se quiser
	    if (ativar) activate(tabExistente, { focus: foco });

	    setCloseButtonsState();
	    return { li: tabExistente.closest("li"), tab: tabExistente, panel };
	  }
	}

    const base = slugify(key || titulo);
    const tabId = uniqueId(`tab-${base}`);
    const panelId = uniqueId(`panel-${base}`);

    // LI
    const li = document.createElement("li");
    li.setAttribute("role", "presentation");

    // TAB
    const tab = document.createElement("button");
    tab.type = "button";
    tab.setAttribute("role", "tab");
    tab.id = tabId;
    tab.textContent = titulo;
    tab.setAttribute("aria-controls", panelId);
    tab.setAttribute("aria-selected", "false");
    tab.tabIndex = -1;
    if (key) tab.dataset.key = key;

    li.appendChild(tab);

    // CLOSE
    if (fechavel) {
      const close = document.createElement("button");
      close.type = "button";
      close.className = "icone";
      close.setAttribute("data-close", "");
      close.setAttribute("aria-label", `Fechar guia: ${titulo}`);

      // se você usa Material Symbols via span (seu padrão):
      const icon = document.createElement("span");
      icon.className = "material-symbols-outlined";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "close";
      close.appendChild(icon);

      li.appendChild(close);
    }

    // PANEL
    const panel = document.createElement("section");
    panel.setAttribute("role", "tabpanel");
    panel.id = panelId;
    panel.setAttribute("aria-labelledby", tabId);
    panel.hidden = true;

    // conteúdo do panel
    if (typeof container === "function") {
      container(panel);
    } else if (typeof container === "string") {
      panel.innerHTML = container;
    } else if (container instanceof Node) {
      panel.appendChild(container);
    } else if (container != null) {
      // fallback: evita inserir objeto estranho
      panel.textContent = String(container);
    }

    // adiciona no DOM
    menu.appendChild(li);
    root.appendChild(panel);

    setCloseButtonsState();

    // ativa se quiser
    if (ativar) activate(tab, { focus: foco });

    return { li, tab, panel };
  }

  // expõe a função (se quiser chamar de fora)
  window.novaGuia = novaGuia;

  // init: garante que existe uma ativa
  const initial =
    getTabs().find(t => t.getAttribute("aria-selected") === "true") || getTabs()[0];
  if (initial) activate(initial);

  setCloseButtonsState();
})();
