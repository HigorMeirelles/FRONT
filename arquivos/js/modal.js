export default class Modal {
  #dialog;
  #main;
  #h2;
  #onClose;

  constructor(seletor = "dialog") {
    this.#dialog = document.querySelector(seletor);
    this.#main = this.#dialog.querySelector("main");
    this.#h2 = this.#dialog.querySelector("h2");

    this.#dialog.addEventListener("click", e => {
      if (e.target.closest('button[aria-label="Fechar modal"]')) {
        this.fechar();
      }
    });

    this.#dialog.addEventListener("close", () => {
      this.#onClose?.();
      this.#onClose = null;
      this.#main.innerHTML = "";
    });
  }

  abrirHtml(html, { titulo = null, onClose = null } = {}) {
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
    this.#dialog.open && this.#dialog.close();
  }
}
