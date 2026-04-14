const SVG_NS = "http://www.w3.org/2000/svg";
const PASSOS_GRADE = 5;
const SERIES_MAX = 6;

function clamp(valor, minimo, maximo) {
  return Math.min(Math.max(valor, minimo), maximo);
}

function numeroSeguro(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function soma(valores) {
  return valores.reduce((total, valor) => total + numeroSeguro(valor), 0);
}

function formatarNumero(valor) {
  const numero = numeroSeguro(valor);
  const casas = Number.isInteger(numero) ? 0 : 1;
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(numero);
}

function normalizarTexto(valor) {
  return (valor ?? "").toString().trim();
}

function criarSVG(tipo, atributos = {}) {
  const elemento = document.createElementNS(SVG_NS, tipo);
  Object.entries(atributos).forEach(([atributo, valor]) => {
    if (valor == null) return;
    elemento.setAttribute(atributo, String(valor));
  });
  return elemento;
}

function lerJSONDoElemento(elemento) {
  const script = elemento.querySelector(':scope > script[type="application/json"]');
  if (!script) {
    throw new Error("[Grafico] config JSON nao encontrada.");
  }

  try {
    return JSON.parse(script.textContent || "{}");
  } catch (erro) {
    throw new Error(`[Grafico] config JSON invalida: ${erro.message}`);
  }
}

function medirTexto(texto) {
  const span = document.createElement("span");
  span.style.position = "absolute";
  span.style.visibility = "hidden";
  span.style.whiteSpace = "nowrap";
  span.style.font = '12px "Segoe UI", sans-serif';
  span.textContent = texto;
  document.body.appendChild(span);
  const largura = span.offsetWidth;
  span.remove();
  return largura;
}

function obterMaximoBonito(valor) {
  const numero = numeroSeguro(valor);
  if (numero <= 0) return 1;

  const potencia = 10 ** Math.floor(Math.log10(numero));
  const base = numero / potencia;

  if (base <= 1) return 1 * potencia;
  if (base <= 2) return 2 * potencia;
  if (base <= 5) return 5 * potencia;
  return 10 * potencia;
}

function descreverSetor(cx, cy, raio, inicio, fim) {
  const pontoInicial = polarParaCartesiano(cx, cy, raio, fim);
  const pontoFinal = polarParaCartesiano(cx, cy, raio, inicio);
  const arcoGrande = fim - inicio <= 180 ? 0 : 1;

  return [
    `M ${cx} ${cy}`,
    `L ${pontoInicial.x} ${pontoInicial.y}`,
    `A ${raio} ${raio} 0 ${arcoGrande} 0 ${pontoFinal.x} ${pontoFinal.y}`,
    "Z",
  ].join(" ");
}

function polarParaCartesiano(cx, cy, raio, angulo) {
  const radianos = ((angulo - 90) * Math.PI) / 180;
  return {
    x: cx + raio * Math.cos(radianos),
    y: cy + raio * Math.sin(radianos),
  };
}

function arraysIguais(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((valor, indice) => valor === b[indice]);
}

export default class Grafico {
  static mount(root = document.body) {
    const elementos = [];

    if (root instanceof Element && root.matches('.grafico[data-grafico]')) {
      elementos.push(root);
    }

    root.querySelectorAll?.('.grafico[data-grafico]').forEach((elemento) => {
      elementos.push(elemento);
    });

    return elementos;
  }

  static corSerie(indice) {
    const slot = (indice % SERIES_MAX) + 1;
    return {
      forte: `var(--chart-series-${slot})`,
      suave: `var(--chart-series-${slot}-soft)`,
    };
  }

  constructor(root, config = null) {
    this.root = typeof root === "string" ? document.querySelector(root) : root;
    if (!this.root) throw new Error("[Grafico] root nao encontrado.");

    this.ativos = [];
    this.labelsAtuais = [];
    this.subfiltroIndice = 0;
    this.resizeTimer = null;

    this.config = this.normalizarConfig(config ?? lerJSONDoElemento(this.root));
    this.tipo = this.descobrirTipo();
    this.orientacao = this.descobrirOrientacao();
    this.idBase = this.root.id || `grafico-${Math.random().toString(36).slice(2, 8)}`;

    this.onFiltroChange = this.onFiltroChange.bind(this);
    this.onSubfiltroChange = this.onSubfiltroChange.bind(this);

    this.montarEstrutura();
    this.render();
    this.observarResize();
  }

  atualizar(config) {
    this.config = this.normalizarConfig(config);
    this.subfiltroIndice = 0;
    this.labelsAtuais = [];
    this.ativos = [];
    this.montarSelectSubfiltro();
    this.render();
  }

  render() {
    const dados = this.obterDadosCorrentes();
    const labels = this.obterLabels(dados);

    this.garantirFiltros(labels);
    this.titulo.textContent = this.config.titulo;
    this.svg.innerHTML = "";
    this.legenda.innerHTML = "";
    this.vazio.hidden = true;
    this.legenda.hidden = !this.usaLegenda();

    if (!dados.length) {
      this.mostrarVazio("Nenhum dado disponivel.");
      return;
    }

    if (this.tipo === "circulo" || this.tipo === "setor") {
      this.renderizarCircular(dados);
      return;
    }

    this.renderizarCartesiano(dados);
  }

  destroy() {
    this.filtros?.removeEventListener("change", this.onFiltroChange);
    this.subfiltro?.removeEventListener("change", this.onSubfiltroChange);

    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
  }

  normalizarConfig(config) {
    const titulo = normalizarTexto(config?.titulo) || "Grafico";
    const filtros = Array.isArray(config?.filtros)
      ? config.filtros.map((item) => normalizarTexto(item) || "Serie")
      : [];

    const subfiltros = Boolean(config?.subfiltros);
    const valores = Array.isArray(config?.valores)
      ? config.valores.map((item) => this.normalizarGrupo(item, subfiltros))
      : [];

    return {
      titulo,
      filtros,
      subfiltros,
      valores,
    };
  }

  normalizarGrupo(item, temSubfiltros) {
    if (temSubfiltros) {
      return {
        label: normalizarTexto(item?.label) || "Grupo",
        valores: Array.isArray(item?.valores)
          ? item.valores.map((grupo) => this.normalizarGrupo(grupo, false))
          : [],
      };
    }

    return {
      label: normalizarTexto(item?.label) || "Grupo",
      valores: Array.isArray(item?.valores)
        ? item.valores.map((valor) => numeroSeguro(valor))
        : [numeroSeguro(item?.valor)],
    };
  }

  descobrirTipo() {
    if (this.root.classList.contains("linha")) return "linha";
    if (this.root.classList.contains("circulo")) return "circulo";
    if (this.root.classList.contains("setor")) return "setor";
    return "barra";
  }

  descobrirOrientacao() {
    if (this.root.classList.contains("horizontal")) return "horizontal";
    return "vertical";
  }

  montarEstrutura() {
    this.root.innerHTML = "";
    this.root.dataset.chartType = this.tipo;
    this.root.dataset.chartOrientation = this.orientacao;

    this.topo = document.createElement("header");
    this.topo.className = "grafico__topo";

    this.titulo = document.createElement("h2");
    this.topo.appendChild(this.titulo);

    this.subfiltro = document.createElement("select");
    this.subfiltro.className = "grafico__subfiltro";
    this.subfiltro.addEventListener("change", this.onSubfiltroChange);
    this.topo.appendChild(this.subfiltro);

    this.filtros = document.createElement("form");
    this.filtros.className = "grafico__filtros";
    this.filtros.addEventListener("change", this.onFiltroChange);

    this.corpo = document.createElement("div");
    this.corpo.className = "grafico__corpo";

    this.rolagem = document.createElement("div");
    this.rolagem.className = "grafico__rolagem";

    this.svg = criarSVG("svg", {
      class: "grafico__svg",
      role: "img",
      "aria-label": this.config.titulo,
    });
    this.rolagem.appendChild(this.svg);

    this.vazio = document.createElement("p");
    this.vazio.className = "grafico__vazio";
    this.vazio.hidden = true;
    this.rolagem.appendChild(this.vazio);

    this.legenda = document.createElement("ul");
    this.legenda.className = "grafico__legenda";
    this.legenda.hidden = true;

    this.corpo.append(this.rolagem, this.legenda);
    this.root.append(this.topo, this.filtros, this.corpo);

    this.montarSelectSubfiltro();
  }

  montarSelectSubfiltro() {
    this.subfiltro.innerHTML = "";

    if (!this.config.subfiltros) {
      this.subfiltro.hidden = true;
      return;
    }

    this.config.valores.forEach((item, indice) => {
      const option = document.createElement("option");
      option.value = String(indice);
      option.textContent = item.label;
      this.subfiltro.appendChild(option);
    });

    this.subfiltro.value = String(this.subfiltroIndice);
    this.subfiltro.hidden = false;
  }

  obterDadosCorrentes() {
    if (!this.config.subfiltros) return this.config.valores;
    return this.config.valores[this.subfiltroIndice]?.valores || [];
  }

  obterLabels(dados) {
    if (this.tipo === "circulo" || this.tipo === "setor") {
      return dados.map((item, indice) => this.config.filtros[indice] || item.label || `Serie ${indice + 1}`);
    }

    const quantidadeSeries = Math.max(
      this.config.filtros.length,
      ...dados.map((item) => item.valores.length),
      1
    );

    return Array.from({ length: quantidadeSeries }, (_, indice) => {
      return this.config.filtros[indice] || `Serie ${indice + 1}`;
    });
  }

  garantirFiltros(labels) {
    if (arraysIguais(labels, this.labelsAtuais)) return;

    const estadoAnterior = this.ativos;
    this.labelsAtuais = labels;
    this.ativos = labels.map((_, indice) => estadoAnterior[indice] ?? true);

    this.filtros.innerHTML = "";
    this.filtros.hidden = labels.length <= 1;

    labels.forEach((label, indice) => {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = this.ativos[indice];
      input.id = `${this.idBase}-filtro-${indice}`;
      input.dataset.indice = String(indice);

      const legenda = document.createElement("label");
      const cor = Grafico.corSerie(indice);
      legenda.setAttribute("for", input.id);
      legenda.textContent = label;
      legenda.style.setProperty("--grafico-cor", cor.forte);
      legenda.style.setProperty("--grafico-cor-suave", cor.suave);

      this.filtros.append(input, legenda);
    });
  }

  indicesAtivos() {
    return this.ativos
      .map((ativo, indice) => (ativo ? indice : -1))
      .filter((indice) => indice >= 0);
  }

  usaLegenda() {
    return this.tipo === "circulo" || this.tipo === "setor";
  }

  mostrarVazio(texto) {
    this.vazio.textContent = texto;
    this.vazio.hidden = false;
  }

  renderizarCartesiano(dados) {
    const ativos = this.indicesAtivos();
    if (!ativos.length) {
      this.mostrarVazio("Nenhuma serie ativa.");
      return;
    }

    const grupos = dados.map((item) => ({
      label: item.label,
      valores: ativos.map((indice) => ({
        indice,
        label: this.labelsAtuais[indice],
        valor: numeroSeguro(item.valores[indice]),
      })),
    }));

    const maiorValorBruto = Math.max(
      0,
      ...grupos.flatMap((grupo) => grupo.valores.map((item) => item.valor))
    );

    if (maiorValorBruto <= 0) {
      this.mostrarVazio("Sem valores para plotar.");
      return;
    }

    if (this.orientacao === "horizontal") {
      this.renderizarCartesianoHorizontal(grupos, maiorValorBruto);
      return;
    }

    this.renderizarCartesianoVertical(grupos, maiorValorBruto);
  }

  renderizarCartesianoVertical(grupos, maiorValorBruto) {
    const larguraVisivel = Math.max(this.rolagem.clientWidth || 0, 520);
    const slotGrupo = Math.max(84, grupos[0].valores.length * 32 + 20);
    const largura = Math.max(larguraVisivel, 72 + grupos.length * slotGrupo);
    const altura = 360;
    const padding = { top: 20, right: 18, bottom: 86, left: 58 };
    const innerWidth = largura - padding.left - padding.right;
    const innerHeight = altura - padding.top - padding.bottom;
    const maximo = obterMaximoBonito(maiorValorBruto);

    this.svg.setAttribute("viewBox", `0 0 ${largura} ${altura}`);
    this.svg.setAttribute("width", largura);
    this.svg.setAttribute("height", altura);

    this.desenharGradeVertical({ largura, altura, padding, innerWidth, innerHeight, maximo });

    if (this.tipo === "barra") {
      this.desenharBarrasVerticais({ grupos, largura, altura, padding, innerWidth, innerHeight, maximo });
      return;
    }

    this.desenharLinhasVerticais({ grupos, largura, altura, padding, innerWidth, innerHeight, maximo });
  }

  desenharGradeVertical({ largura, altura, padding, innerWidth, innerHeight, maximo }) {
    const grade = criarSVG("g");
    const eixo = criarSVG("g");

    for (let passo = 0; passo <= PASSOS_GRADE; passo += 1) {
      const proporcao = passo / PASSOS_GRADE;
      const y = padding.top + innerHeight - proporcao * innerHeight;
      const valor = (maximo / PASSOS_GRADE) * passo;

      grade.appendChild(
        criarSVG("line", {
          x1: padding.left,
          x2: largura - padding.right,
          y1: y,
          y2: y,
          class: "grafico__grade-linha",
        })
      );

      const texto = criarSVG("text", {
        x: padding.left - 10,
        y: y + 4,
        class: "grafico__grade-texto",
        "text-anchor": "end",
      });
      texto.textContent = formatarNumero(valor);
      grade.appendChild(texto);
    }

    eixo.append(
      criarSVG("line", {
        x1: padding.left,
        x2: padding.left,
        y1: padding.top,
        y2: altura - padding.bottom,
        class: "grafico__eixo",
      }),
      criarSVG("line", {
        x1: padding.left,
        x2: largura - padding.right,
        y1: altura - padding.bottom,
        y2: altura - padding.bottom,
        class: "grafico__eixo",
      })
    );

    this.svg.append(grade, eixo);
  }

  desenharBarrasVerticais({ grupos, largura, altura, padding, innerWidth, innerHeight, maximo }) {
    const slotGrupo = innerWidth / grupos.length;

    grupos.forEach((grupo, indiceGrupo) => {
      const grupoInner = slotGrupo * 0.72;
      const gapBarra = 6;
      const larguraBarra = Math.max(
        10,
        (grupoInner - gapBarra * Math.max(grupo.valores.length - 1, 0)) / grupo.valores.length
      );
      const inicioGrupo = padding.left + indiceGrupo * slotGrupo + (slotGrupo - grupoInner) / 2;
      const centroGrupo = padding.left + indiceGrupo * slotGrupo + slotGrupo / 2;

      grupo.valores.forEach((item, indiceSerie) => {
        const alturaBarra = (item.valor / maximo) * innerHeight;
        const x = inicioGrupo + indiceSerie * (larguraBarra + gapBarra);
        const y = padding.top + innerHeight - alturaBarra;
        const cor = Grafico.corSerie(item.indice);

        const barra = criarSVG("rect", {
          x,
          y,
          width: larguraBarra,
          height: alturaBarra,
          rx: 4,
          class: "grafico__barra",
        });
        barra.style.fill = cor.forte;
        barra.style.setProperty("--grafico-cor", cor.forte);
        this.svg.appendChild(barra);

        const valor = criarSVG("text", {
          x: x + larguraBarra / 2,
          y: y - 8,
          class: "grafico__valor",
          "text-anchor": "middle",
        });
        valor.textContent = formatarNumero(item.valor);
        this.svg.appendChild(valor);
      });

      const rotulo = criarSVG("text", {
        x: centroGrupo,
        y: altura - padding.bottom + 24,
        class: "grafico__rotulo",
        "text-anchor": "middle",
      });
      rotulo.textContent = grupo.label;

      if (grupo.label.length > 12) {
        rotulo.setAttribute("transform", `rotate(-28 ${centroGrupo} ${altura - padding.bottom + 24})`);
        rotulo.setAttribute("text-anchor", "end");
      }

      this.svg.appendChild(rotulo);
    });
  }

  desenharLinhasVerticais({ grupos, largura, altura, padding, innerWidth, innerHeight, maximo }) {
    const slotGrupo = innerWidth / grupos.length;
    const series = new Map();

    grupos.forEach((grupo, indiceGrupo) => {
      const centroGrupo = padding.left + indiceGrupo * slotGrupo + slotGrupo / 2;

      grupo.valores.forEach((item) => {
        const y = padding.top + innerHeight - (item.valor / maximo) * innerHeight;
        if (!series.has(item.indice)) series.set(item.indice, []);
        series.get(item.indice).push({ x: centroGrupo, y, valor: item.valor });
      });

      const rotulo = criarSVG("text", {
        x: centroGrupo,
        y: altura - padding.bottom + 24,
        class: "grafico__rotulo",
        "text-anchor": "middle",
      });
      rotulo.textContent = grupo.label;

      if (grupo.label.length > 12) {
        rotulo.setAttribute("transform", `rotate(-28 ${centroGrupo} ${altura - padding.bottom + 24})`);
        rotulo.setAttribute("text-anchor", "end");
      }

      this.svg.appendChild(rotulo);
    });

    Array.from(series.entries()).forEach(([indiceSerie, pontos]) => {
      const cor = Grafico.corSerie(indiceSerie);
      const polyline = criarSVG("polyline", {
        points: pontos.map((ponto) => `${ponto.x},${ponto.y}`).join(" "),
        class: "grafico__serie",
      });
      polyline.style.stroke = cor.forte;
      this.svg.appendChild(polyline);

      pontos.forEach((ponto) => {
        const circulo = criarSVG("circle", {
          cx: ponto.x,
          cy: ponto.y,
          r: 5,
          class: "grafico__ponto",
        });
        circulo.style.fill = cor.forte;
        this.svg.appendChild(circulo);
      });
    });
  }

  renderizarCartesianoHorizontal(grupos, maiorValorBruto) {
    const larguraVisivel = Math.max(this.rolagem.clientWidth || 0, 640);
    const maiorRotulo = Math.max(...grupos.map((grupo) => medirTexto(grupo.label)), 90);
    const largura = Math.max(larguraVisivel, 640);
    const slotGrupo = Math.max(52, grupos[0].valores.length * 28 + 18);
    const altura = Math.max(240, 46 + grupos.length * slotGrupo);
    const padding = {
      top: 20,
      right: 24,
      bottom: 24,
      left: clamp(maiorRotulo + 22, 110, 220),
    };
    const innerWidth = largura - padding.left - padding.right;
    const innerHeight = altura - padding.top - padding.bottom;
    const maximo = obterMaximoBonito(maiorValorBruto);

    this.svg.setAttribute("viewBox", `0 0 ${largura} ${altura}`);
    this.svg.setAttribute("width", largura);
    this.svg.setAttribute("height", altura);

    this.desenharGradeHorizontal({ largura, altura, padding, innerWidth, innerHeight, maximo });

    if (this.tipo === "barra") {
      this.desenharBarrasHorizontais({ grupos, largura, altura, padding, innerWidth, innerHeight, maximo });
      return;
    }

    this.desenharLinhasHorizontais({ grupos, largura, altura, padding, innerWidth, innerHeight, maximo });
  }

  desenharGradeHorizontal({ largura, altura, padding, innerWidth, innerHeight, maximo }) {
    const grade = criarSVG("g");
    const eixo = criarSVG("g");

    for (let passo = 0; passo <= PASSOS_GRADE; passo += 1) {
      const proporcao = passo / PASSOS_GRADE;
      const x = padding.left + proporcao * innerWidth;
      const valor = (maximo / PASSOS_GRADE) * passo;

      grade.appendChild(
        criarSVG("line", {
          x1: x,
          x2: x,
          y1: padding.top,
          y2: altura - padding.bottom,
          class: "grafico__grade-linha",
        })
      );

      const texto = criarSVG("text", {
        x,
        y: padding.top - 6,
        class: "grafico__grade-texto",
        "text-anchor": "middle",
      });
      texto.textContent = formatarNumero(valor);
      grade.appendChild(texto);
    }

    eixo.append(
      criarSVG("line", {
        x1: padding.left,
        x2: padding.left,
        y1: padding.top,
        y2: altura - padding.bottom,
        class: "grafico__eixo",
      }),
      criarSVG("line", {
        x1: padding.left,
        x2: largura - padding.right,
        y1: altura - padding.bottom,
        y2: altura - padding.bottom,
        class: "grafico__eixo",
      })
    );

    this.svg.append(grade, eixo);
  }

  desenharBarrasHorizontais({ grupos, largura, altura, padding, innerWidth, innerHeight, maximo }) {
    const slotGrupo = innerHeight / grupos.length;

    grupos.forEach((grupo, indiceGrupo) => {
      const grupoInner = slotGrupo * 0.72;
      const gapBarra = 6;
      const alturaBarra = Math.max(
        10,
        (grupoInner - gapBarra * Math.max(grupo.valores.length - 1, 0)) / grupo.valores.length
      );
      const inicioGrupo = padding.top + indiceGrupo * slotGrupo + (slotGrupo - grupoInner) / 2;
      const centroGrupo = padding.top + indiceGrupo * slotGrupo + slotGrupo / 2;

      const rotulo = criarSVG("text", {
        x: padding.left - 10,
        y: centroGrupo + 4,
        class: "grafico__rotulo",
        "text-anchor": "end",
      });
      rotulo.textContent = grupo.label;
      this.svg.appendChild(rotulo);

      grupo.valores.forEach((item, indiceSerie) => {
        const larguraBarra = (item.valor / maximo) * innerWidth;
        const y = inicioGrupo + indiceSerie * (alturaBarra + gapBarra);
        const cor = Grafico.corSerie(item.indice);

        const barra = criarSVG("rect", {
          x: padding.left,
          y,
          width: larguraBarra,
          height: alturaBarra,
          rx: 8,
          class: "grafico__barra",
        });
        barra.style.fill = cor.forte;
        this.svg.appendChild(barra);

        const valor = criarSVG("text", {
          x: padding.left + larguraBarra + 8,
          y: y + alturaBarra / 2 + 4,
          class: "grafico__valor",
          "text-anchor": "start",
        });
        valor.textContent = formatarNumero(item.valor);
        this.svg.appendChild(valor);
      });
    });
  }

  desenharLinhasHorizontais({ grupos, padding, innerWidth, innerHeight, maximo }) {
    const slotGrupo = innerHeight / grupos.length;
    const series = new Map();

    grupos.forEach((grupo, indiceGrupo) => {
      const centroGrupo = padding.top + indiceGrupo * slotGrupo + slotGrupo / 2;

      const rotulo = criarSVG("text", {
        x: padding.left - 10,
        y: centroGrupo + 4,
        class: "grafico__rotulo",
        "text-anchor": "end",
      });
      rotulo.textContent = grupo.label;
      this.svg.appendChild(rotulo);

      grupo.valores.forEach((item) => {
        const x = padding.left + (item.valor / maximo) * innerWidth;
        if (!series.has(item.indice)) series.set(item.indice, []);
        series.get(item.indice).push({ x, y: centroGrupo });
      });
    });

    Array.from(series.entries()).forEach(([indiceSerie, pontos]) => {
      const cor = Grafico.corSerie(indiceSerie);
      const polyline = criarSVG("polyline", {
        points: pontos.map((ponto) => `${ponto.x},${ponto.y}`).join(" "),
        class: "grafico__serie",
      });
      polyline.style.stroke = cor.forte;
      this.svg.appendChild(polyline);

      pontos.forEach((ponto) => {
        const circulo = criarSVG("circle", {
          cx: ponto.x,
          cy: ponto.y,
          r: 5,
          class: "grafico__ponto",
        });
        circulo.style.fill = cor.forte;
        this.svg.appendChild(circulo);
      });
    });
  }

  renderizarCircular(dados) {
    const ativos = this.indicesAtivos();
    if (!ativos.length) {
      this.mostrarVazio("Nenhum grupo ativo.");
      return;
    }

    const itens = dados
      .map((item, indice) => ({
        indice,
        label: this.labelsAtuais[indice] || item.label,
        valor: numeroSeguro(item.valores[0]),
      }))
      .filter((item) => ativos.includes(item.indice));

    const total = soma(itens.map((item) => item.valor));
    if (total <= 0) {
      this.mostrarVazio("Sem valores para plotar.");
      return;
    }

    this.svg.setAttribute("viewBox", "0 0 100 100");
    this.svg.setAttribute("width", 280);
    this.svg.setAttribute("height", 280);

    if (this.tipo === "circulo") {
      this.desenharCirculo(itens, total);
    } else {
      this.desenharSetor(itens, total);
    }

    this.desenharLegendaCircular(itens, total);
  }

  desenharCirculo(itens, total) {
    const raio = 34;
    const circunferencia = 2 * Math.PI * raio;
    const gap = 3;
    let angulo = -90;

    const trilha = criarSVG("circle", {
      cx: 50,
      cy: 50,
      r: raio,
      class: "grafico__anel-base",
    });
    this.svg.appendChild(trilha);

    itens.forEach((item) => {
      const proporcao = item.valor / total;
      const anguloSetor = proporcao * 360;
      const visivel = Math.max(0, anguloSetor - gap);
      const comprimento = (visivel / 360) * circunferencia;
      const restante = circunferencia - comprimento;
      const cor = Grafico.corSerie(item.indice);

      const segmento = criarSVG("circle", {
        cx: 50,
        cy: 50,
        r: raio,
        class: "grafico__anel-segmento",
        "stroke-dasharray": `${comprimento} ${restante}`,
        transform: `rotate(${angulo} 50 50)`,
      });
      segmento.style.stroke = cor.forte;
      this.svg.appendChild(segmento);

      angulo += anguloSetor;
    });

    const totalLabel = criarSVG("text", {
      x: 50,
      y: 48,
      class: "grafico__total",
      "text-anchor": "middle",
    });
    totalLabel.textContent = formatarNumero(total);

    const totalSub = criarSVG("text", {
      x: 50,
      y: 60,
      class: "grafico__total-subtitulo",
      "text-anchor": "middle",
    });
    totalSub.textContent = "total";

    this.svg.append(totalLabel, totalSub);
  }

  desenharSetor(itens, total) {
    let angulo = 0;

    itens.forEach((item) => {
      const cor = Grafico.corSerie(item.indice);
      const fatia = (item.valor / total) * 360;
      const path = criarSVG("path", {
        d: descreverSetor(50, 50, 38, angulo, angulo + fatia),
        class: "grafico__setor",
      });
      path.style.fill = cor.forte;
      this.svg.appendChild(path);
      angulo += fatia;
    });

    const totalLabel = criarSVG("text", {
      x: 50,
      y: 96,
      class: "grafico__total-subtitulo",
      "text-anchor": "middle",
    });
    totalLabel.textContent = `Total ${formatarNumero(total)}`;
    this.svg.appendChild(totalLabel);
  }

  desenharLegendaCircular(itens, total) {
    this.legenda.innerHTML = "";

    itens.forEach((item) => {
      const proporcao = total > 0 ? (item.valor / total) * 100 : 0;
      const cor = Grafico.corSerie(item.indice);

      const li = document.createElement("li");
      li.style.setProperty("--grafico-cor", cor.forte);
      li.style.setProperty("--grafico-cor-suave", cor.suave);

      const marcador = document.createElement("span");
      marcador.className = "grafico__marcador";

      const texto = document.createElement("div");
      texto.className = "grafico__legenda-texto";

      const forte = document.createElement("strong");
      forte.textContent = item.label;

      const fraco = document.createElement("small");
      fraco.textContent = `${formatarNumero(proporcao)}%`;

      texto.append(forte, fraco);

      const progresso = document.createElement("progress");
      progresso.max = total;
      progresso.value = item.valor;

      const valor = document.createElement("output");
      valor.textContent = formatarNumero(item.valor);

      li.append(marcador, texto, progresso, valor);
      this.legenda.appendChild(li);
    });
  }

  onFiltroChange(event) {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input) return;

    const indice = Number(input.dataset.indice);
    if (!Number.isInteger(indice)) return;

    this.ativos[indice] = input.checked;
    this.render();
  }

  onSubfiltroChange(event) {
    this.subfiltroIndice = Number(event.target.value) || 0;
    this.labelsAtuais = [];
    this.render();
  }

  observarResize() {
    if (typeof ResizeObserver !== "function") return;

    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => this.render(), 80);
    });

    this.resizeObserver.observe(this.root);
  }
}

if (typeof window !== "undefined") {
  window.Grafico = Grafico;
}
