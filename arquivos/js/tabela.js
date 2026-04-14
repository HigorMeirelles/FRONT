const PAGINAS_VISIVEIS = 7;
const FILTRO_DEBOUNCE_MS = 180;
const WS_PING_INTERVALO_MS = 50000;
const WS_RECONEXAO_MAX = 5;
const WS_RECONEXAO_TETO_MS = 30000;

function clamp(valor, minimo, maximo) {
    return Math.min(Math.max(valor, minimo), maximo);
}

function textoBase(valor) {
    return (valor ?? "")
        .toString()
        .replace(/\s+/g, " ")
        .trim();
}

function normalizarTextoEstrito(valor) {
    return textoBase(valor).toLocaleLowerCase("pt-BR");
}

function normalizarTextoFlexivel(valor) {
    return normalizarTextoEstrito(valor)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
}

function extrairTextoCelula(celula) {
    if (!celula) return "";
    return textoBase(celula.textContent || "");
}

function extrairNumero(valor) {
    const texto = textoBase(valor);
    if (!texto) return null;

    let limpo = texto.replace(/[^\d,.-]/g, "");
    if (!limpo) return null;

    const ultimoPonto = limpo.lastIndexOf(".");
    const ultimaVirgula = limpo.lastIndexOf(",");

    if (ultimoPonto > -1 && ultimaVirgula > -1) {
        if (ultimaVirgula > ultimoPonto) {
            limpo = limpo.replace(/\./g, "").replace(",", ".");
        } else {
            limpo = limpo.replace(/,/g, "");
        }
    } else if (ultimaVirgula > -1) {
        limpo = limpo.replace(",", ".");
    }

    const numero = Number(limpo);
    return Number.isFinite(numero) ? numero : null;
}

function extrairData(valor) {
    const texto = textoBase(valor);
    if (!texto) return null;

    let combinacao = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (combinacao) {
        const [, ano, mes, dia] = combinacao;
        return Number(`${ano}${mes}${dia}`);
    }

    combinacao = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (combinacao) {
        const [, dia, mes, ano] = combinacao;
        return Number(`${ano}${mes}${dia}`);
    }

    return null;
}

function normalizarIntervalo(inicio, fim) {
    if (inicio == null || fim == null) return null;

    return inicio <= fim
        ? { inicio, fim }
        : { inicio: fim, fim: inicio };
}

function montarPaginas(totalPaginas, paginaAtual) {
    if (totalPaginas <= PAGINAS_VISIVEIS) {
        return Array.from({ length: totalPaginas }, (_, indice) => indice + 1);
    }

    const paginas = [1];
    let inicio = Math.max(2, paginaAtual - 1);
    let fim = Math.min(totalPaginas - 1, paginaAtual + 1);

    if (paginaAtual <= 3) {
        inicio = 2;
        fim = 4;
    }

    if (paginaAtual >= totalPaginas - 2) {
        inicio = totalPaginas - 3;
        fim = totalPaginas - 1;
    }

    if (inicio > 2) paginas.push("...");

    for (let pagina = inicio; pagina <= fim; pagina += 1) {
        paginas.push(pagina);
    }

    if (fim < totalPaginas - 1) paginas.push("...");

    paginas.push(totalPaginas);
    return paginas;
}

function detectarTipoFiltro(input, wrapper) {
    const tipo = (input?.getAttribute("type") || "text").toLowerCase();
    if (tipo === "number") return "number";
    if (tipo === "date") return "date";

    const operadores = Array.from(
        wrapper?.querySelectorAll(".sub-filtro input[type='radio']") || []
    ).map((radio) => (radio.value || "").toUpperCase());

    if (operadores.some((valor) => ["ANTES", "DEPOIS"].includes(valor))) {
        return "date";
    }

    if (operadores.some((valor) => ["MENOR", "MAIOR"].includes(valor))) {
        return "number";
    }

    return "text";
}

function compararTexto(a, b) {
    return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

function registroAtendeCriterios(registro, criterios) {
    if (criterios.filtroGeral && criterios.filtroGeral !== "todos") {
        if (registro.filtroGeral !== criterios.filtroGeral) {
            return false;
        }
    }

    if (criterios.pesquisaGlobal && !registro.globalFlexivel.includes(criterios.pesquisaGlobal)) {
        return false;
    }

    for (let indice = 0; indice < criterios.colunas.length; indice += 1) {
        const criterio = criterios.colunas[indice];
        if (!criterio.ativo) continue;

        const valor = registro.colunas[indice];
        if (!valor) return false;

        if (criterio.tipo === "number") {
            if (criterio.operador === "ENTRE") {
                const intervalo = normalizarIntervalo(criterio.number, criterio.numberFinal);
                if (valor.number == null || !intervalo) return false;
                if (valor.number < intervalo.inicio || valor.number > intervalo.fim) return false;
                continue;
            }

            if (valor.number == null || criterio.number == null) return false;

            if (criterio.operador === "MENOR" && !(valor.number < criterio.number)) return false;
            if (criterio.operador === "MAIOR" && !(valor.number > criterio.number)) return false;
            if (criterio.operador === "IGUAL" && valor.number !== criterio.number) return false;
            continue;
        }

        if (criterio.tipo === "date") {
            if (criterio.operador === "ENTRE") {
                const intervalo = normalizarIntervalo(criterio.date, criterio.dateFinal);
                if (valor.date == null || !intervalo) return false;
                if (valor.date < intervalo.inicio || valor.date > intervalo.fim) return false;
                continue;
            }

            if (valor.date == null || criterio.date == null) return false;

            if (criterio.operador === "ANTES" && !(valor.date < criterio.date)) return false;
            if (criterio.operador === "DEPOIS" && !(valor.date > criterio.date)) return false;
            if (criterio.operador === "IGUAL" && valor.date !== criterio.date) return false;
            continue;
        }

        const base = criterio.ignorarEspeciais ? valor.flexivel : valor.estrito;
        const termo = criterio.ignorarEspeciais ? criterio.textoFlexivel : criterio.textoEstrito;

        if (criterio.operador === "IGUAL" && base !== termo) return false;
        if (criterio.operador === "NAO_CONTEM" && base.includes(termo)) return false;
        if (criterio.operador === "CONTEM" && !base.includes(termo)) return false;
    }

    return true;
}

class Tabela {
    static mount(root = document.body) {
        const containers = [];

        if (root instanceof Element && root.matches(".tabela-container")) {
            containers.push(root);
        }

        root.querySelectorAll?.(".tabela-container").forEach((container) => {
            containers.push(container);
        });

        return containers;
    }

    constructor(container) {
        this.container = container;
        this.range = document.createRange();
        this.range.selectNode(document.body);

        this.toolbar = container.querySelector(":scope > form:not(.paginacao)");
        this.wrapper = container.querySelector(":scope > .tabela");
        this.table = this.wrapper?.querySelector("table") || null;
        this.thead = this.table?.tHead || null;
        this.tbody = this.table?.tBodies?.[0] || null;
        this.pagination = container.querySelector(":scope > .paginacao");
        this.paginationStatus = this.pagination?.querySelector("span") || null;
        this.paginationNav = this.pagination?.querySelector("nav") || null;

        if (!this.table || !this.thead || !this.tbody) {
            throw new Error("Tabela: estrutura incompleta.");
        }

        this.headerRow = this.thead.rows[0] || null;
        this.filterRow = this.thead.rows[1] || null;
        this.headerCheckbox = this.filterRow?.querySelector("input[name='selecionar-todos']") || null;
        this.globalSearch = this.toolbar?.querySelector("input[name='pesquisar']") || null;
        this.filtroGeralInputs = Array.from(
            this.container.querySelectorAll("input[name='filtro-geral']")
        );
        this.exibicaoInputs = Array.from(
            this.container.querySelectorAll("input[name='exibir']")
        );

        this.colunas = this.coletarColunas();
        this.registros = [];
        this.filtrados = [];
        this.paginaAtual = 1;
        this.exibicao = Number(this.obterValorSelecionado(this.exibicaoInputs, "10")) || 10;
        this.filtroGeral = normalizarTextoFlexivel(
            this.obterValorSelecionado(this.filtroGeralInputs, "todos")
        ) || "todos";
        this.ordenacao = this.lerOrdenacaoInicial();

        this.worker = null;
        this.workerToken = 0;
        this.filtroAgendado = null;
        this.filtroAgendadoResetaPagina = false;

        this.ws = null;
        this.wsReconectando = false;
        this.wsTentativas = 0;
        this.wsPing = null;
        this.destruida = false;

        this.onClick = this.onClick.bind(this);
        this.onInput = this.onInput.bind(this);
        this.onChange = this.onChange.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onContextMenu = this.onContextMenu.bind(this);
        this.onDocumentPointerDown = this.onDocumentPointerDown.bind(this);
        this.onDocumentKeyDown = this.onDocumentKeyDown.bind(this);
        this.onWorkerMessage = this.onWorkerMessage.bind(this);

        this.normalizarTiposDoCabecalho();
        this.iniciarWorker();
        this.registrarEventos();
        this.definirLinhas(Array.from(this.tbody.rows));
        this.iniciarWebSocket();
    }

    obterValorSelecionado(inputs, padrao = "") {
        return inputs.find((input) => input.checked)?.value ?? padrao;
    }

    coletarColunas() {
        if (!this.headerRow || !this.filterRow) return [];

        return Array.from(this.headerRow.cells)
            .map((header, indice) => {
                const filtro = this.filterRow.cells[indice]?.querySelector(".tabela-filter");
                const input = filtro?.querySelector(":scope > input:not([type='radio']):not([type='checkbox'])");
                if (!filtro || !input) return null;

                const type = detectarTipoFiltro(input, filtro);
                const inputFinal = filtro.querySelector(".tabela-filter-range input[data-range-end]") || null;
                const range = filtro.querySelector(".tabela-filter-range") || null;

                return {
                    indice,
                    header,
                    filtro,
                    input,
                    inputFinal,
                    inputs: [input, inputFinal].filter(Boolean),
                    range,
                    type,
                    radios: Array.from(filtro.querySelectorAll(".sub-filtro input[type='radio']")),
                    checkboxEspecial: filtro.querySelector(".sub-filtro input[type='checkbox']") || null,
                };
            })
            .filter(Boolean);
    }

    normalizarTiposDoCabecalho() {
        this.colunas.forEach((coluna) => {
            if (coluna.type === "date" && coluna.input.type !== "date") {
                coluna.input.type = "date";
            }

            if (coluna.type === "date" && coluna.inputFinal && coluna.inputFinal.type !== "date") {
                coluna.inputFinal.type = "date";
            }

            if (coluna.type === "number" && coluna.input.type !== "number") {
                coluna.input.type = "number";
            }

            if (coluna.type === "number" && coluna.inputFinal && coluna.inputFinal.type !== "number") {
                coluna.inputFinal.type = "number";
            }

            this.atualizarModoIntervalo(coluna);

            if (coluna.header.hasAttribute("aria-sort")) {
                coluna.header.dataset.sortable = "1";
            }
        });
    }

    encontrarColunaPorCampo(target) {
        return this.colunas.find((coluna) =>
            coluna.input === target ||
            coluna.inputFinal === target ||
            coluna.checkboxEspecial === target ||
            coluna.radios.includes(target)
        ) || null;
    }

    atualizarModoIntervalo(coluna) {
        const radio = coluna.radios.find((item) => item.checked);
        const operador = (radio?.value || "IGUAL").toUpperCase();
        const usarIntervalo = operador === "ENTRE" && Boolean(coluna.inputFinal);

        if (coluna.range) {
            coluna.range.hidden = !usarIntervalo;
        }

        if (coluna.inputFinal) {
            coluna.inputFinal.disabled = !usarIntervalo;
        }

        return usarIntervalo;
    }

    lerOrdenacaoInicial() {
        if (!this.headerRow) return { indice: -1, direcao: "ascending" };

        const header = Array.from(this.headerRow.cells).find((th) => {
            const valor = th.getAttribute("aria-sort");
            return valor === "ascending" || valor === "descending";
        });

        if (!header) return { indice: -1, direcao: "ascending" };

        return {
            indice: header.cellIndex,
            direcao: header.getAttribute("aria-sort"),
        };
    }

    iniciarWorker() {
        try {
            this.worker = new Worker(new URL("./tabela-processo-filtrar.js", import.meta.url));
            this.worker.addEventListener("message", this.onWorkerMessage);
        } catch (erro) {
            console.warn("Tabela: worker indisponivel, filtrando no processo principal.", erro);
            this.worker = null;
        }
    }

    registrarEventos() {
        this.toolbar?.addEventListener("submit", (event) => event.preventDefault());
        this.pagination?.addEventListener("submit", (event) => event.preventDefault());

        this.container.addEventListener("click", this.onClick);
        this.container.addEventListener("input", this.onInput);
        this.container.addEventListener("change", this.onChange);
        this.container.addEventListener("keydown", this.onKeyDown);
        this.container.addEventListener("contextmenu", this.onContextMenu);

        document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
        document.addEventListener("keydown", this.onDocumentKeyDown);
    }

    removerEventos() {
        this.container.removeEventListener("click", this.onClick);
        this.container.removeEventListener("input", this.onInput);
        this.container.removeEventListener("change", this.onChange);
        this.container.removeEventListener("keydown", this.onKeyDown);
        this.container.removeEventListener("contextmenu", this.onContextMenu);

        document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
        document.removeEventListener("keydown", this.onDocumentKeyDown);
    }

    onClick(event) {
        const toggleFiltro = event.target.closest(".tabela-filter-toggle");
        if (toggleFiltro && this.container.contains(toggleFiltro)) {
            event.preventDefault();

            const filtro = toggleFiltro.closest(".tabela-filter");
            if (!filtro) return;

            if (filtro.hasAttribute("data-open")) {
                this.fecharSubFiltro(filtro);
            } else {
                this.abrirSubFiltro(filtro);
            }

            return;
        }

        const toggleMenu = event.target.closest("[data-menu-toggle]");
        if (toggleMenu && this.container.contains(toggleMenu)) {
            event.preventDefault();

            const menu = toggleMenu.closest(".tabela-acoes");
            if (!menu) return;

            if (menu.hasAttribute("data-open") && !menu.classList.contains("menu")) {
                this.fecharMenu(menu);
            } else {
                this.abrirMenu(menu, "linha");
            }

            return;
        }

        const fecharMenu = event.target.closest("[data-menu-close]");
        if (fecharMenu && this.container.contains(fecharMenu)) {
            event.preventDefault();
            const menu = fecharMenu.closest(".tabela-acoes");
            if (menu) this.fecharMenu(menu);
            return;
        }

        const header = event.target.closest("thead tr:first-child th[aria-sort]");
        if (header && this.container.contains(header) && !event.target.closest("button, input, label, a")) {
            this.ordenarPorColuna(header.cellIndex);
            return;
        }

        const botaoPaginacao = event.target.closest(".paginacao nav button");
        if (botaoPaginacao && this.container.contains(botaoPaginacao) && !botaoPaginacao.disabled) {
            event.preventDefault();
            this.processarPaginacao(botaoPaginacao);
        }
    }

    onInput(event) {
        if (event.target === this.globalSearch) {
            this.agendarFiltro({ resetarPagina: true });
            return;
        }

        const coluna = this.encontrarColunaPorCampo(event.target);
        if (coluna) {
            this.agendarFiltro({ resetarPagina: true });
        }
    }

    onChange(event) {
        if (this.filtroGeralInputs.includes(event.target)) {
            this.filtroGeral = normalizarTextoFlexivel(event.target.value) || "todos";
            this.aplicarFiltros({ resetarPagina: true });
            return;
        }

        if (this.exibicaoInputs.includes(event.target)) {
            this.exibicao = Number(event.target.value) || 10;
            this.paginaAtual = 1;
            this.renderizar();
            return;
        }

        if (event.target === this.headerCheckbox) {
            this.marcarLinhasFiltradas(event.target.checked);
            return;
        }

        if (event.target.matches("tbody td:first-child input[type='checkbox']")) {
            this.sincronizarSelecionarTodos();
            return;
        }

        const coluna = this.encontrarColunaPorCampo(event.target);
        if (coluna) {
            const usandoIntervalo = this.atualizarModoIntervalo(coluna);
            if (usandoIntervalo && coluna.radios.includes(event.target)) {
                coluna.inputFinal?.focus?.();
            }

            this.agendarFiltro({ resetarPagina: true });
            return;
        }

        if (event.target.closest(".sub-filtro")) {
            this.agendarFiltro({ resetarPagina: true });
        }
    }

    onKeyDown(event) {
        const linha = event.target.closest("tbody tr");
        if (!linha || !this.container.contains(linha)) return;

        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            const menu = linha.querySelector(".tabela-acoes");
            if (!menu) return;

            event.preventDefault();
            this.abrirMenu(menu, "menu");
        }
    }

    onContextMenu(event) {
        const linha = event.target.closest("tbody tr");
        if (!linha || !this.container.contains(linha)) return;
        if (event.target.closest("input, button, label, a")) return;

        const menu = linha.querySelector(".tabela-acoes");
        if (!menu) return;

        event.preventDefault();
        this.abrirMenu(menu, "menu");
    }

    onDocumentPointerDown(event) {
        if (!this.container.isConnected) return;

        if (!this.container.contains(event.target)) {
            this.fecharSubFiltros();
            this.fecharMenus();
            return;
        }

        if (!event.target.closest(".tabela-filter")) {
            this.fecharSubFiltros();
        }

        if (!event.target.closest(".tabela-acoes")) {
            this.fecharMenus();
        }
    }

    onDocumentKeyDown(event) {
        if (event.key !== "Escape") return;
        this.fecharSubFiltros();
        this.fecharMenus();
    }

    abrirSubFiltro(filtro) {
        this.fecharSubFiltros(filtro);

        const painel = filtro.querySelector(".sub-filtro");
        const botao = filtro.querySelector(".tabela-filter-toggle");

        filtro.classList.add("ativo");
        filtro.setAttribute("data-open", "");

        if (painel) painel.hidden = false;
        if (botao) botao.setAttribute("aria-expanded", "true");

        painel?.querySelector("input:checked, input")?.focus?.();
    }

    fecharSubFiltro(filtro) {
        const painel = filtro.querySelector(".sub-filtro");
        const botao = filtro.querySelector(".tabela-filter-toggle");

        filtro.classList.remove("ativo");
        filtro.removeAttribute("data-open");

        if (painel) painel.hidden = true;
        if (botao) botao.setAttribute("aria-expanded", "false");
    }

    fecharSubFiltros(excecao = null) {
        this.container.querySelectorAll(".tabela-filter[data-open]").forEach((filtro) => {
            if (filtro === excecao) return;
            this.fecharSubFiltro(filtro);
        });
    }

    abrirMenu(menu, modo = "linha") {
        this.fecharMenus(menu);

        const botao = menu.querySelector("[data-menu-toggle]");
        menu.setAttribute("data-open", "");
        menu.classList.toggle("menu", modo === "menu");

        if (botao) {
            botao.setAttribute("aria-expanded", "true");
            botao.textContent = "close";
            botao.setAttribute("aria-label", "Fechar opcoes da linha");
        }

        if (modo === "menu") {
            menu.querySelector(".tabela-acoes__lista button")?.focus?.();
        }
    }

    fecharMenu(menu) {
        const botao = menu.querySelector("[data-menu-toggle]");
        menu.removeAttribute("data-open");
        menu.classList.remove("menu");

        if (botao) {
            botao.setAttribute("aria-expanded", "false");
            botao.textContent = "more_horiz";
            botao.setAttribute("aria-label", "Abrir opcoes da linha");
        }
    }

    fecharMenus(excecao = null) {
        this.container.querySelectorAll(".tabela-acoes[data-open]").forEach((menu) => {
            if (menu === excecao) return;
            this.fecharMenu(menu);
        });
    }

    ordenarPorColuna(indice) {
        const header = this.headerRow?.cells[indice];
        if (!header || !header.hasAttribute("aria-sort")) return;

        const atual = header.getAttribute("aria-sort");
        const proximaDirecao = atual === "ascending" ? "descending" : "ascending";

        Array.from(this.headerRow.cells).forEach((th) => {
            if (th.hasAttribute("aria-sort")) th.setAttribute("aria-sort", "none");
        });

        header.setAttribute("aria-sort", proximaDirecao);
        this.ordenacao = { indice, direcao: proximaDirecao };
        this.renderizar();
    }

    processarPaginacao(botao) {
        const pagina = Number(botao.dataset.page);
        if (Number.isFinite(pagina) && pagina > 0) {
            this.paginaAtual = pagina;
            this.renderizar();
            return;
        }

        if (botao.dataset.action === "prev") {
            this.paginaAtual = Math.max(1, this.paginaAtual - 1);
            this.renderizar();
            return;
        }

        if (botao.dataset.action === "next") {
            const totalPaginas = this.totalPaginas();
            this.paginaAtual = Math.min(totalPaginas, this.paginaAtual + 1);
            this.renderizar();
        }
    }

    agendarFiltro({ resetarPagina = false } = {}) {
        this.filtroAgendadoResetaPagina = this.filtroAgendadoResetaPagina || resetarPagina;
        clearTimeout(this.filtroAgendado);

        this.filtroAgendado = setTimeout(() => {
            const resetar = this.filtroAgendadoResetaPagina;
            this.filtroAgendadoResetaPagina = false;
            this.aplicarFiltros({ resetarPagina: resetar });
        }, FILTRO_DEBOUNCE_MS);
    }

    coletarCriterios() {
        return {
            filtroGeral: this.filtroGeral || "todos",
            pesquisaGlobal: normalizarTextoFlexivel(this.globalSearch?.value || ""),
            colunas: this.colunas.map((coluna) => {
                const valor = coluna.input.value || "";
                const valorFinal = coluna.inputFinal?.value || "";
                const radio = coluna.radios.find((item) => item.checked);
                const operador = (radio?.value || "IGUAL").toUpperCase();
                const textoEstrito = normalizarTextoEstrito(valor);
                const textoFlexivel = normalizarTextoFlexivel(valor);
                const ativo = operador === "ENTRE"
                    ? Boolean(textoBase(valor) && textoBase(valorFinal))
                    : Boolean(textoBase(valor));

                return {
                    indice: coluna.indice,
                    tipo: coluna.type,
                    ativo,
                    operador,
                    ignorarEspeciais: Boolean(coluna.checkboxEspecial?.checked),
                    textoEstrito,
                    textoFlexivel,
                    number: coluna.type === "number" ? extrairNumero(valor) : null,
                    numberFinal: coluna.type === "number" ? extrairNumero(valorFinal) : null,
                    date: coluna.type === "date" ? extrairData(valor) : null,
                    dateFinal: coluna.type === "date" ? extrairData(valorFinal) : null,
                };
            }),
        };
    }

    aplicarFiltros({ resetarPagina = false } = {}) {
        if (resetarPagina) {
            this.paginaAtual = 1;
        }

        const criterios = this.coletarCriterios();
        this.tbody.setAttribute("aria-busy", "true");

        if (!this.worker) {
            this.filtrados = this.registros.filter((registro) => registroAtendeCriterios(registro, criterios));
            this.renderizar();
            this.tbody.removeAttribute("aria-busy");
            return;
        }

        this.workerToken += 1;
        this.worker.postMessage({
            tipo: "filtrar",
            token: this.workerToken,
            criterios,
        });
    }

    onWorkerMessage(event) {
        const { token, indices = [] } = event.data || {};
        if (token !== this.workerToken) return;

        this.filtrados = indices.map((indice) => this.registros[indice]).filter(Boolean);
        this.renderizar();
        this.tbody.removeAttribute("aria-busy");
    }

    definirLinhas(linhas) {
        this.fecharSubFiltros();
        this.fecharMenus();

        const base = linhas.map((linha, indice) => this.criarRegistro(linha, indice));

        this.registros = base;
        this.enviarBaseAoWorker();
        this.aplicarFiltros();
    }

    criarRegistro(linha, indice) {
        linha.tabIndex = 0;

        const colunas = this.colunas.map((coluna) => {
            const texto = extrairTextoCelula(linha.cells[coluna.indice]);

            return {
                estrito: normalizarTextoEstrito(texto),
                flexivel: normalizarTextoFlexivel(texto),
                number: extrairNumero(texto),
                date: extrairData(texto),
            };
        });

        const globais = colunas.reduce(
            (acumulado, coluna) => {
                if (coluna.estrito) acumulado.estrito.push(coluna.estrito);
                if (coluna.flexivel) acumulado.flexivel.push(coluna.flexivel);
                return acumulado;
            },
            { estrito: [], flexivel: [] }
        );

        const ordenacao = Array.from(linha.cells).map((celula) => {
            const texto = extrairTextoCelula(celula);
            const checkbox = celula.querySelector("input[type='checkbox']");

            return {
                estrito: normalizarTextoEstrito(texto),
                flexivel: normalizarTextoFlexivel(texto),
                number: extrairNumero(texto),
                date: extrairData(texto),
                checked: checkbox ? checkbox.checked : null,
            };
        });

        return {
            indice,
            linha,
            filtroGeral: normalizarTextoFlexivel(linha.dataset.filtro || linha.dataset.tipo || ""),
            colunas,
            globalEstrito: globais.estrito.join(" "),
            globalFlexivel: globais.flexivel.join(" "),
            ordenacao,
        };
    }

    enviarBaseAoWorker() {
        if (!this.worker) return;

        this.worker.postMessage({
            tipo: "base",
            registros: this.registros.map((registro) => ({
                indice: registro.indice,
                filtroGeral: registro.filtroGeral,
                globalFlexivel: registro.globalFlexivel,
                colunas: registro.colunas,
            })),
        });
    }

    totalPaginas() {
        return Math.max(1, Math.ceil(this.filtrados.length / this.exibicao));
    }

    ordenarRegistros(registros) {
        if (this.ordenacao.indice < 0) return [...registros];

        const coluna = this.colunas.find((item) => item.indice === this.ordenacao.indice);
        const direcao = this.ordenacao.direcao === "descending" ? -1 : 1;

        return [...registros].sort((a, b) => {
            const valorA = a.ordenacao[this.ordenacao.indice];
            const valorB = b.ordenacao[this.ordenacao.indice];

            if (!valorA || !valorB) return 0;

            if (valorA.checked != null || valorB.checked != null) {
                return ((valorA.checked ? 1 : 0) - (valorB.checked ? 1 : 0)) * direcao;
            }

            if (coluna?.type === "number" && valorA.number != null && valorB.number != null) {
                return (valorA.number - valorB.number) * direcao;
            }

            if (coluna?.type === "date" && valorA.date != null && valorB.date != null) {
                return (valorA.date - valorB.date) * direcao;
            }

            if (valorA.date != null && valorB.date != null) {
                return (valorA.date - valorB.date) * direcao;
            }

            if (valorA.number != null && valorB.number != null) {
                return (valorA.number - valorB.number) * direcao;
            }

            return compararTexto(valorA.flexivel, valorB.flexivel) * direcao;
        });
    }

    renderizar() {
        const ordenados = this.ordenarRegistros(this.filtrados);
        const total = ordenados.length;
        const totalPaginas = this.totalPaginas();

        this.paginaAtual = clamp(this.paginaAtual, 1, totalPaginas);

        const inicio = total === 0 ? 0 : (this.paginaAtual - 1) * this.exibicao;
        const fim = total === 0 ? 0 : Math.min(inicio + this.exibicao, total);
        const visiveis = ordenados.slice(inicio, fim);

        this.tbody.textContent = "";

        if (!visiveis.length) {
            const linhaVazia = document.createElement("tr");
            linhaVazia.className = "tabela-vazia";

            const celula = document.createElement("td");
            celula.colSpan = this.headerRow?.cells.length || 1;
            celula.textContent = "Nenhum registro encontrado.";

            linhaVazia.append(celula);
            this.tbody.append(linhaVazia);
        } else {
            visiveis.forEach((registro, indice) => {
                const linha = registro.linha;
                linha.classList.remove("tr-odd", "tr-even");
                linha.classList.add((indice % 2 === 0) ? "tr-odd" : "tr-even");
                linha.tabIndex = 0;
                this.tbody.append(linha);
            });
        }

        this.renderizarPaginacao(totalPaginas, total, inicio, fim);
        this.sincronizarSelecionarTodos();
    }

    renderizarPaginacao(totalPaginas, total, inicio, fim) {
        if (this.paginationStatus) {
            const totalBase = this.registros.length;
            const inicioVisivel = total === 0 ? 0 : inicio + 1;
            const fimVisivel = total === 0 ? 0 : fim;
            const complemento = total < totalBase ? ` (filtrados de ${totalBase})` : "";

            this.paginationStatus.textContent =
                `Exibindo de ${inicioVisivel} ate ${fimVisivel} de ${total} registros${complemento}`;
        }

        if (!this.paginationNav) return;

        this.paginationNav.textContent = "";

        const fragmento = document.createDocumentFragment();

        fragmento.append(
            this.criarBotaoPaginacao({
                acao: "prev",
                rotulo: "Pagina anterior",
                texto: "navigate_before",
                disabled: this.paginaAtual <= 1 || total === 0,
            })
        );

        montarPaginas(totalPaginas, this.paginaAtual).forEach((pagina) => {
            if (pagina === "...") {
                fragmento.append(
                    this.criarBotaoPaginacao({
                        rotulo: "Mais paginas",
                        texto: "more_horiz",
                        disabled: true,
                    })
                );
                return;
            }

            fragmento.append(
                this.criarBotaoPaginacao({
                    pagina,
                    texto: pagina.toString().padStart(2, "0"),
                    atual: pagina === this.paginaAtual,
                    disabled: total === 0,
                })
            );
        });

        fragmento.append(
            this.criarBotaoPaginacao({
                acao: "next",
                rotulo: "Proxima pagina",
                texto: "navigate_next",
                disabled: this.paginaAtual >= totalPaginas || total === 0,
            })
        );

        this.paginationNav.append(fragmento);
    }

    criarBotaoPaginacao({ pagina, acao, rotulo, texto, atual = false, disabled = false }) {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.textContent = texto;
        botao.disabled = disabled;

        if (pagina) botao.dataset.page = String(pagina);
        if (acao) botao.dataset.action = acao;
        if (rotulo) botao.setAttribute("aria-label", rotulo);

        if (atual) {
            botao.classList.add("ativo");
            botao.setAttribute("aria-current", "page");
        }

        return botao;
    }

    marcarLinhasFiltradas(marcado) {
        this.filtrados.forEach((registro) => {
            const checkbox = registro.linha.querySelector("td:first-child input[type='checkbox']");
            if (checkbox) checkbox.checked = marcado;
        });

        this.sincronizarSelecionarTodos();
    }

    sincronizarSelecionarTodos() {
        if (!this.headerCheckbox) return;

        const checkboxes = this.filtrados
            .map((registro) => registro.linha.querySelector("td:first-child input[type='checkbox']"))
            .filter(Boolean);

        const total = checkboxes.length;
        const selecionados = checkboxes.filter((checkbox) => checkbox.checked).length;

        this.headerCheckbox.checked = total > 0 && selecionados === total;
        this.headerCheckbox.indeterminate = selecionados > 0 && selecionados < total;
    }

    substituirLinhas(html) {
        const documento = this.range.createContextualFragment(`<table><tbody>${html}</tbody></table>`);
        const linhas = Array.from(documento.querySelectorAll("tr"));
        this.definirLinhas(linhas);
    }

    carregar(html) {
        this.substituirLinhas(html);
    }

    atualizar(html) {
        this.substituirLinhas(html);
    }

    exportar(mapear = (linha) => linha.dataset.id) {
        return this.filtrados
            .map((registro) => registro.linha)
            .filter((linha) => linha.querySelector("td:first-child input[type='checkbox']:checked"))
            .map(mapear);
    }

    iniciarWebSocket() {
        if (this.destruida) return;

        if (!window.WS || !window.ROTA || !window.ID_USUARIO || !this.table.id || !("WebSocket" in window)) {
            return;
        }

        this.conectarWebSocket();
    }

    conectarWebSocket() {
        if (this.destruida) return;
        if (this.wsTentativas >= WS_RECONEXAO_MAX) return;

        try {
            this.ws = new WebSocket(
                `${window.WS}/${window.ROTA}ws/tabela/${this.table.id}/${window.ID_USUARIO}`
            );
        } catch (_erro) {
            this.agendarReconexaoWS();
            return;
        }

        this.ws.addEventListener("open", () => {
            this.wsReconectando = false;
            this.wsTentativas = 0;
            this.iniciarPingWS();
        });

        this.ws.addEventListener("message", (evento) => {
            this.processarMensagemWS(evento);
        });

        this.ws.addEventListener("close", () => {
            this.agendarReconexaoWS();
        });

        this.ws.addEventListener("error", () => {
            this.agendarReconexaoWS();
        });
    }

    iniciarPingWS() {
        clearInterval(this.wsPing);
        this.wsPing = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.enviar({ rota: "ping" });
            }
        }, WS_PING_INTERVALO_MS);
    }

    agendarReconexaoWS() {
        if (this.destruida) return;
        clearInterval(this.wsPing);

        if (this.wsReconectando) return;
        this.wsReconectando = true;
        this.wsTentativas += 1;

        const espera = Math.min(1000 * 2 ** this.wsTentativas, WS_RECONEXAO_TETO_MS);

        setTimeout(() => {
            if (this.destruida) return;
            this.wsReconectando = false;
            if (this.container.isConnected) this.conectarWebSocket();
        }, espera);
    }

    processarMensagemWS(evento) {
        if (this.destruida) return;

        try {
            const resposta = JSON.parse(evento.data);
            if (!resposta || typeof resposta !== "object") return;

            if (["carregar", "atualizar"].includes(resposta.modo)) {
                const html = resposta.data ?? resposta.tr ?? "";
                if (typeof html === "string") this.atualizar(html);
            }
        } catch (erro) {
            console.error("Tabela: erro ao processar retorno do WebSocket.", erro);
        }
    }

    enviar(payload) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        }
    }

    destroy() {
        this.destruida = true;
        clearTimeout(this.filtroAgendado);
        clearInterval(this.wsPing);

        this.removerEventos();
        this.fecharSubFiltros();
        this.fecharMenus();

        if (this.worker) {
            this.worker.removeEventListener("message", this.onWorkerMessage);
            this.worker.terminate();
            this.worker = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

if (typeof window !== "undefined") {
    window.Tabela = Tabela;
}

export default Tabela;
