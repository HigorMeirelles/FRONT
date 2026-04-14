export default class Modal {
  #dialog;
  #main;
  #h2;
  #onClose;
  #managed = false;
  #tituloOriginal = "";

  constructor(seletor = "dialog") {
    this.#dialog = document.querySelector(seletor);
    if (!this.#dialog) return;

    this.#main = this.#dialog.querySelector("main");
    this.#h2 = this.#dialog.querySelector("h2");
    this.#tituloOriginal = this.#h2?.textContent ?? "";

    this.#dialog.addEventListener("click", e => {
      if (e.target.closest('button[aria-label="Fechar modal"]')) {
        this.fechar();
      }
    });

    this.#dialog.addEventListener("close", () => {
      this.#onClose?.();
      this.#onClose = null;

      if (this.#managed) {
        if (this.#main) this.#main.innerHTML = "";
        if (this.#h2) this.#h2.textContent = this.#tituloOriginal;
      }

      this.#managed = false;
    });
  }

  abrirHtml(html, { titulo = null, onClose = null } = {}) {
    if (!this.#dialog || !this.#main) return;

    this.#managed = true;
    this.#onClose = onClose;
    if (titulo != null && this.#h2) this.#h2.textContent = titulo;
    this.#main.innerHTML = html ?? "";
    this.#dialog.showModal();
  }

  abrirMensagem(msg, opts = {}) {
    const temTag = /<[^>]+>/.test(msg);
    this.abrirHtml(
      temTag ? msg : `<p>${msg}</p>`,
      opts
    );
  }

  fechar() {
    this.#dialog?.open && this.#dialog.close();
  }
}
