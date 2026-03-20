import Tabs from "./tabs.js";
import SelectRadio from "./select.js";
import Modal from "./modal.js";

class UI {
  static #observer;
  static #inst = new WeakMap();
  static modal;

    static start(root = document.body) {
      // modal fixa
      if (!this.modal) {
        this.modal = new Modal();
        window.MODAL = this.modal; // opcional
      }

      this.init(root);

      this.#observer = new MutationObserver(muts => {
        for (const m of muts) {
          m.addedNodes.forEach(n => n instanceof Element && this.init(n));
          m.removedNodes.forEach(n => n instanceof Element && this.destroy(n));
        }
      });

      this.#observer.observe(root, { childList: true, subtree: true });
    }
  static init(scope) {
    scope.querySelectorAll(".tabs:not([data-ui])").forEach(el => {
      el.dataset.ui = "1";
      const inst = new Tabs(el);
      this.#inst.set(el, inst);
    });

    scope.querySelectorAll(".select-container[data-select]:not([data-ui])").forEach(el => {
      el.dataset.ui = "1";
      const inst = new SelectRadio(el);
      this.#inst.set(el, inst);
    });
  }

  static destroy(scope) {
    // destrói o próprio nó
    if (scope.matches?.("[data-ui]")) {
      this.#inst.get(scope)?.destroy?.();
    }
    // e filhos
    scope.querySelectorAll?.("[data-ui]").forEach(el => {
      this.#inst.get(el)?.destroy?.();
    });
  }
}

UI.start(document.body);

