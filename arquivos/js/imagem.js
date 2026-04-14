const MAX_ARQUIVO_BYTES = 10 * 1024 * 1024;
const PLACEHOLDER_SRC =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 960 640'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%23ffb26d'/%3E%3Cstop offset='1' stop-color='%23ff7f3f'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='960' height='640' rx='32' fill='url(%23g)'/%3E%3Crect x='72' y='72' width='816' height='496' rx='24' fill='%23ffffff' fill-opacity='.22'/%3E%3Ccircle cx='200' cy='220' r='74' fill='%23fff7ef'/%3E%3Cpath d='M332 180h404v40H332zm0 88h300v40H332zm0 88h250v40H332z' fill='%23fff7ef'/%3E%3Cpath d='M146 406c32-46 88-74 146-74s114 28 146 74v70H146z' fill='%23fff7ef'/%3E%3Ctext x='72' y='560' fill='%23fff7ef' font-family='Segoe UI, sans-serif' font-size='44' font-weight='700'%3EEditor de Imagem Demo%3C/text%3E%3C/svg%3E";
const LIMITE_CROP_MIN = 160;
const LIMITE_CROP_MIN_VERTICAL = 120;
const LIMITE_CROP_MAX_WIDTH_RATIO = 1;
const LIMITE_CROP_MAX_HEIGHT_RATIO = 1;

function parseRatio(valor) {
  if (!valor || valor === "free" || valor === "livre" || valor === "NaN") {
    return NaN;
  }

  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : NaN;
}

function parseOption(valor) {
  if (valor == null || valor === "") return undefined;
  if (valor === "true") return true;
  if (valor === "false") return false;
  if (valor === "NaN") return NaN;

  if (/^-?\d+(?:\.\d+)?$/.test(valor)) {
    return Number(valor);
  }

  try {
    return JSON.parse(valor);
  } catch {
    return valor;
  }
}

function clamp(valor, minimo, maximo) {
  return Math.min(Math.max(valor, minimo), maximo);
}

function extrairNomeBase(nomeOriginal) {
  return (nomeOriginal || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .trim();
}

function montarNomeCampo(nomeOriginal) {
  const base = extrairNomeBase(nomeOriginal) || "imagem";
  return /-recorte$/i.test(base) ? base : `${base}-recorte`;
}

function montarNomeRecorte(nomeOriginal, tipoMime) {
  const base = (extrairNomeBase(nomeOriginal) || "imagem-recorte")
    .trim()
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ");
  const baseFinal = /-recorte$/i.test(base) ? base : `${base}-recorte`;

  const extensao = tipoMime === "image/png" ? "png" : "jpg";
  return `${baseFinal || "imagem-recorte"}.${extensao}`;
}

export default class Imagem {
  static LIMITE_ARQUIVO_BYTES = MAX_ARQUIVO_BYTES;

  #root;
  #source;
  #preview;
  #input;
  #nome;
  #output;
  #toggleModo;
  #form;
  #cropper = null;
  #urlObjeto = "";
  #scaleX = 1;
  #scaleY = 1;
  #tipoArquivo = "image/png";
  #nomeArquivo = "imagem-recorte.png";
  #modoInteracao = "image";
  #ativo = false;
  #outputToken = 0;
  #liberarSubmit = false;
  #ultimoSync = null;

  #onClick;
  #onChange;
  #onInput;
  #onKeyDown;
  #onSubmit;

  constructor(root) {
    this.#root = typeof root === "string" ? document.querySelector(root) : root;

    if (!(this.#root instanceof Element)) {
      return;
    }

    this.#source = this.#root.querySelector("[data-imagem-source]");
    this.#preview = this.#root.querySelector("[data-imagem-preview]");
    this.#input = this.#root.querySelector("[data-imagem-input]");
    this.#nome = this.#root.querySelector("[data-imagem-filename]");
    this.#output = this.#root.querySelector("[data-imagem-output]");
    this.#toggleModo = this.#root.querySelector("[data-imagem-mode-toggle]");
    this.#form = this.#root.closest("form");

    if (!(this.#source instanceof HTMLImageElement) || !(this.#input instanceof HTMLInputElement)) {
      this.#marcarIndisponivel();
      return;
    }

    if (!window.Cropper) {
      this.#marcarIndisponivel();
      return;
    }

    if (!this.#source.getAttribute("src")) {
      this.#source.src = PLACEHOLDER_SRC;
    }

    this.#tipoArquivo = this.#source.currentSrc.startsWith("data:image/jpeg")
      ? "image/jpeg"
      : "image/png";

    this.#definirNomeVisivel(montarNomeCampo("imagem-demo"));
    this.#sincronizarNomeArquivo();

    if (!this.#root.hasAttribute("tabindex")) {
      this.#root.tabIndex = 0;
    }

    this.#ativo = true;
    this.#onClick = (event) => this.#handleClick(event);
    this.#onChange = (event) => this.#handleChange(event);
    this.#onInput = (event) => this.#handleInput(event);
    this.#onKeyDown = (event) => this.#handleKeyDown(event);
    this.#onSubmit = (event) => this.#handleSubmit(event);

    this.#root.addEventListener("click", this.#onClick);
    this.#root.addEventListener("change", this.#onChange);
    this.#root.addEventListener("input", this.#onInput);
    this.#root.addEventListener("keydown", this.#onKeyDown);
    this.#form?.addEventListener("submit", this.#onSubmit);

    this.#sincronizarPreviewRatio();
    this.#renderModoInteracao();
    this.#criarCropper();
  }

  destroy() {
    this.#root?.removeEventListener("click", this.#onClick);
    this.#root?.removeEventListener("change", this.#onChange);
    this.#root?.removeEventListener("input", this.#onInput);
    this.#root?.removeEventListener("keydown", this.#onKeyDown);
    this.#form?.removeEventListener("submit", this.#onSubmit);

    this.#destruirCropper();
    this.#limparUrlObjeto();
  }

  getCanvas(options = {}) {
    if (!this.#cropper) return null;

    return this.#cropper.getCroppedCanvas({
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
      maxWidth: 1200,
      maxHeight: 1200,
      ...options
    });
  }

  async getImagem({ type = this.#tipoArquivo, quality = 0.92, ...canvasOptions } = {}) {
    const canvas = this.getCanvas(canvasOptions);

    if (!canvas) {
      throw new Error("Editor de imagem indisponivel.");
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Nao foi possivel gerar o recorte."));
          return;
        }

        resolve(blob);
      }, type, quality);
    });
  }

  #handleClick(event) {
    const botao = event.target.closest("button[data-method], button[data-action]");
    if (!botao || !this.#root.contains(botao)) return;

    event.preventDefault();

    if (botao.dataset.action === "pick-file") {
      this.#input?.click();
      return;
    }

    if (!this.#cropper) return;

    if (botao.dataset.action === "toggle-mode") {
      this.#alternarModoInteracao();
      return;
    }

    if (botao.dataset.action === "preview") {
      this.#atualizarPreview();
      return;
    }

    const method = botao.dataset.method;
    if (!method || typeof this.#cropper[method] !== "function") return;

    let option = parseOption(botao.dataset.option);
    const secondOption = parseOption(botao.dataset.secondOption);

    if (method === "scaleX") {
      this.#scaleX *= -1;
      option = this.#scaleX;
    }

    if (method === "scaleY") {
      this.#scaleY *= -1;
      option = this.#scaleY;
    }

    if (method === "reset") {
      this.#scaleX = 1;
      this.#scaleY = 1;
    }

    if (typeof secondOption === "undefined") {
      this.#cropper[method](option);
    } else {
      this.#cropper[method](option, secondOption);
    }

    if (method === "reset") {
      this.#cropper.setAspectRatio(this.#aspectRatioAtual());
      this.#ajustarAreaUtil({ fit: true, centralizar: true });
    }

    this.#atualizarPreview();
  }

  #handleChange(event) {
    const alvo = event.target;
    if (!(alvo instanceof HTMLInputElement)) return;

    if (alvo.matches("[data-imagem-input]")) {
      this.#carregarArquivo(alvo.files?.[0] || null);
      return;
    }

    if (alvo.matches(".imagem-editor__ratio input[type='radio']")) {
      if (!this.#cropper) return;

      const ratio = parseRatio(alvo.value);
      this.#cropper.setAspectRatio(ratio);
      this.#sincronizarPreviewRatio();
      this.#ajustarAreaUtil({ fit: true, centralizar: true });
      this.#atualizarPreview();
      return;
    }

    if (alvo.matches("[data-imagem-filename]")) {
      this.#sincronizarNomeArquivo();
    }
  }

  #handleKeyDown(event) {
    if (!this.#cropper) return;

    if (event.target.closest("input, button, a, select, textarea")) {
      return;
    }

    const passo = event.shiftKey ? 10 : 1;

    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        this.#cropper.move(-passo, 0);
        break;
      case "ArrowRight":
        event.preventDefault();
        this.#cropper.move(passo, 0);
        break;
      case "ArrowUp":
        event.preventDefault();
        this.#cropper.move(0, -passo);
        break;
      case "ArrowDown":
        event.preventDefault();
        this.#cropper.move(0, passo);
        break;
      default:
        return;
    }

    this.#atualizarPreview();
  }

  #handleInput(event) {
    const alvo = event.target;
    if (!(alvo instanceof HTMLInputElement)) return;

    if (alvo.matches("[data-imagem-filename]")) {
      this.#sincronizarNomeArquivo();
    }
  }

  async #handleSubmit(event) {
    if (event.target !== this.#form) return;
    if (!(this.#output instanceof HTMLInputElement)) return;

    if (this.#liberarSubmit) {
      this.#liberarSubmit = false;
      return;
    }

    event.preventDefault();

    try {
      await (this.#ultimoSync ?? this.#sincronizarOutputInput());
    } finally {
      this.#liberarSubmit = true;
      const submitter = event.submitter;

      if (typeof this.#form?.requestSubmit === "function") {
        if (submitter instanceof HTMLElement) {
          this.#form.requestSubmit(submitter);
        } else {
          this.#form.requestSubmit();
        }
      }
    }
  }

  #carregarArquivo(arquivo) {
    if (!arquivo) return;

    if (!arquivo.type.startsWith("image/")) {
      this.#input.value = "";
      return;
    }

    if (arquivo.size > MAX_ARQUIVO_BYTES) {
      this.#input.value = "";
      return;
    }

    this.#tipoArquivo = arquivo.type === "image/png" ? "image/png" : "image/jpeg";
    this.#definirNomeVisivel(montarNomeCampo(arquivo.name));
    this.#sincronizarNomeArquivo();

    this.#limparUrlObjeto();
    this.#urlObjeto = URL.createObjectURL(arquivo);
    this.#source.src = this.#urlObjeto;

    this.#criarCropper();
  }

  #criarCropper() {
    if (!this.#ativo || !this.#source) return;

    this.#destruirCropper();

    this.#cropper = new window.Cropper(this.#source, {
      aspectRatio: this.#aspectRatioAtual(),
      viewMode: 2,
      dragMode: "move",
      autoCropArea: 0.78,
      background: false,
      responsive: true,
      movable: true,
      zoomable: true,
      rotatable: true,
      scalable: true,
      cropBoxMovable: this.#modoInteracao === "crop",
      cropBoxResizable: true,
      minCropBoxWidth: LIMITE_CROP_MIN,
      minCropBoxHeight: LIMITE_CROP_MIN_VERTICAL,
      toggleDragModeOnDblclick: false,
      ready: () => {
        this.#sincronizarPreviewRatio();
        this.#ajustarAreaUtil({ fit: true, centralizar: true });
        this.#alternarModoInteracao(this.#modoInteracao);
        this.#atualizarPreview();
      },
      cropend: () => {
        this.#ajustarAreaUtil();
        this.#atualizarPreview();
      }
    });
  }

  #destruirCropper() {
    this.#cropper?.destroy();
    this.#cropper = null;
  }

  #aspectRatioAtual() {
    const marcado = this.#root.querySelector(".imagem-editor__ratio input[type='radio']:checked");
    return parseRatio(marcado?.value);
  }

  #atualizarPreview() {
    const canvas = this.getCanvas();
    if (!canvas) return;

    const mime = this.#tipoArquivo === "image/png" ? "image/png" : "image/jpeg";
    const dataUrl = canvas.toDataURL(mime, 0.92);
    this.#sincronizarNomeArquivo();

    this.#sincronizarPreviewRatio(canvas.width, canvas.height);

    if (this.#preview) {
      this.#preview.src = dataUrl;
      this.#preview.hidden = false;
    }

    this.#ultimoSync = this.#sincronizarOutputInput();

    this.#root.dispatchEvent(new CustomEvent("imagem:change", {
      detail: {
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        fileName: this.#nomeArquivo,
        mimeType: mime
      }
    }));
  }

  #sincronizarPreviewRatio(largura = null, altura = null) {
    let ratio = this.#aspectRatioAtual();

    if (!Number.isFinite(ratio) || ratio <= 0) {
      if (Number.isFinite(largura) && Number.isFinite(altura) && altura > 0) {
        ratio = largura / altura;
      } else {
        const imagem = this.#cropper?.getImageData?.();
        const larguraImagem = imagem?.naturalWidth || this.#source?.naturalWidth || this.#source?.width;
        const alturaImagem = imagem?.naturalHeight || this.#source?.naturalHeight || this.#source?.height;
        ratio = larguraImagem > 0 && alturaImagem > 0 ? larguraImagem / alturaImagem : 1;
      }
    }

    this.#root.style.setProperty("--image-editor-preview-ratio", String(ratio > 0 ? ratio : 1));
  }

  #ajustarAreaUtil({ fit = false, centralizar = false } = {}) {
    if (!this.#cropper) return;

    const containerData = this.#cropper.getContainerData?.();
    const cropBoxData = this.#cropper.getCropBoxData?.();

    if (!containerData || !cropBoxData) return;

    const maxWidth = Math.max(LIMITE_CROP_MIN, containerData.width * LIMITE_CROP_MAX_WIDTH_RATIO);
    const maxHeight = Math.max(LIMITE_CROP_MIN_VERTICAL, containerData.height * LIMITE_CROP_MAX_HEIGHT_RATIO);
    const minWidth = Math.min(LIMITE_CROP_MIN, maxWidth);
    const minHeight = Math.min(LIMITE_CROP_MIN_VERTICAL, maxHeight);
    const ratio = this.#aspectRatioAtual();

    this.#cropper.options.minCropBoxWidth = minWidth;
    this.#cropper.options.minCropBoxHeight = minHeight;

    let width = fit ? maxWidth : cropBoxData.width;
    let height = fit ? maxHeight : cropBoxData.height;

    if (Number.isFinite(ratio) && ratio > 0) {
      if (fit) {
        width = maxWidth;
        height = width / ratio;
      }

      if (width > maxWidth) {
        width = maxWidth;
        height = width / ratio;
      }

      if (height > maxHeight) {
        height = maxHeight;
        width = height * ratio;
      }

      if (width < minWidth) {
        width = minWidth;
        height = width / ratio;
      }

      if (height < minHeight) {
        height = minHeight;
        width = height * ratio;
      }

      if (width > maxWidth) {
        width = maxWidth;
        height = width / ratio;
      }

      if (height > maxHeight) {
        height = maxHeight;
        width = height * ratio;
      }
    } else {
      width = clamp(width, minWidth, maxWidth);
      height = clamp(height, minHeight, maxHeight);
    }

    const left = centralizar
      ? (containerData.width - width) / 2
      : clamp(cropBoxData.left, 0, Math.max(0, containerData.width - width));
    const top = centralizar
      ? (containerData.height - height) / 2
      : clamp(cropBoxData.top, 0, Math.max(0, containerData.height - height));

    this.#cropper.setCropBoxData({ left, top, width, height });
  }

  #alternarModoInteracao(force = null) {
    this.#modoInteracao = force ?? (this.#modoInteracao === "image" ? "crop" : "image");
    this.#renderModoInteracao();

    if (!this.#cropper) return;

    const movendoRecorte = this.#modoInteracao === "crop";

    this.#cropper.options.cropBoxMovable = movendoRecorte;
    this.#cropper.renderCropBox?.();

    if (movendoRecorte) {
      this.#cropper.setDragMode("none");
      this.#cropper.face?.setAttribute("data-cropper-action", "all");
      this.#cropper.face?.classList.remove("cropper-crop", "cropper-move");
      this.#cropper.face?.classList.add("cropper-move");
      this.#cropper.dragBox?.setAttribute("data-cropper-action", "none");
      this.#cropper.dragBox?.classList.remove("cropper-move", "cropper-crop");
      return;
    }

    this.#cropper.setDragMode("move");
    this.#cropper.face?.setAttribute("data-cropper-action", "move");
    this.#cropper.face?.classList.remove("cropper-crop");
    this.#cropper.face?.classList.add("cropper-move");
  }

  #renderModoInteracao() {
    if (!this.#toggleModo) return;

    const movendoRecorte = this.#modoInteracao === "crop";
    const icone = this.#toggleModo.querySelector(".icone");
    const texto = this.#toggleModo.querySelector("p");

    if (icone) {
      icone.textContent = movendoRecorte ? "crop_free" : "pan_tool_alt";
    }

    if (texto) {
      texto.textContent = movendoRecorte ? "Mover recorte" : "Mover imagem";
    }

    this.#toggleModo.setAttribute("aria-pressed", movendoRecorte ? "true" : "false");
    this.#toggleModo.title = movendoRecorte
      ? "Arraste a area de corte para reposicionar o enquadramento."
      : "Arraste a imagem ao fundo para reposicionar dentro do recorte.";
  }

  #definirNomeVisivel(nome) {
    if (this.#nome instanceof HTMLInputElement) {
      this.#nome.value = nome;
      return;
    }
  }

  #sincronizarNomeArquivo() {
    const nomeDigitado = this.#nome instanceof HTMLInputElement
      ? this.#nome.value
      : "";

    this.#nomeArquivo = montarNomeRecorte(
      nomeDigitado || "imagem-recorte",
      this.#tipoArquivo
    );
  }

  async #sincronizarOutputInput() {
    if (!(this.#output instanceof HTMLInputElement)) return;

    const token = ++this.#outputToken;

    try {
      const blob = await this.getImagem();
      if (!blob || token !== this.#outputToken) return;

      const arquivo = new File([blob], this.#nomeArquivo, {
        type: this.#tipoArquivo,
        lastModified: Date.now()
      });

      const transferencia = new DataTransfer();
      transferencia.items.add(arquivo);
      this.#output.files = transferencia.files;
      this.#output.dispatchEvent(new Event("change", { bubbles: true }));
    } catch {
      this.#output.value = "";
    }
  }

  #marcarIndisponivel() {
    this.#root?.setAttribute("data-disabled", "true");

    this.#root?.querySelectorAll("button, input").forEach((elemento) => {
      elemento.disabled = true;
    });
  }

  #limparUrlObjeto() {
    if (!this.#urlObjeto) return;
    URL.revokeObjectURL(this.#urlObjeto);
    this.#urlObjeto = "";
  }
}
