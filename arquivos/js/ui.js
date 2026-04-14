import Tabs from "./tabs.js";
import SelectRadio from "./select.js";
import Modal from "./modal.js";
import Tabela from "./tabela.js";
import Grafico from "./grafico.js";
import Imagem from "./imagem.js";

class UI {
  static observer;
  static modal;
  static instancias = new WeakMap();

  static start(root = document.body) {
    if (!this.modal) {
      this.modal = new Modal();
      window.MODAL = this.modal;
    }

    this.init(root);

    this.observer = new MutationObserver((mutacoes) => {
      for (const mutacao of mutacoes) {
        mutacao.addedNodes.forEach((node) => {
          if (node instanceof Element) this.init(node);
        });

        mutacao.removedNodes.forEach((node) => {
          if (node instanceof Element) this.destroy(node);
        });
      }
    });

    this.observer.observe(root, { childList: true, subtree: true });
  }

  static init(scope) {
    const elementos = [];
    const seletores = [
      ".tabs:not([data-ui])",
      ".select-container[data-select]:not([data-ui])",
      ".tabela-container:not([data-ui-table])",
      '.grafico[data-grafico]:not([data-ui-chart])',
      '.imagem-editor[data-imagem]:not([data-ui-image])'
    ];

    if (scope instanceof Element) {
      elementos.push(scope);
    }

    seletores.forEach((seletor) => {
      scope.querySelectorAll?.(seletor).forEach((elemento) => {
        elementos.push(elemento);
      });
    });

    elementos.forEach((elemento) => {
      if (elemento.matches(".tabs:not([data-ui])")) {
        elemento.dataset.ui = "1";
        this.instancias.set(elemento, new Tabs(elemento));
      }

      if (elemento.matches(".select-container[data-select]:not([data-ui])")) {
        elemento.dataset.ui = "1";
        this.instancias.set(elemento, new SelectRadio(elemento));
      }

      if (elemento.matches(".tabela-container:not([data-ui-table])")) {
        elemento.dataset.uiTable = "1";
        this.instancias.set(elemento, new Tabela(elemento));
      }

      if (elemento.matches('.grafico[data-grafico]:not([data-ui-chart])')) {
        elemento.dataset.uiChart = "1";
        this.instancias.set(elemento, new Grafico(elemento));
      }

      if (elemento.matches('.imagem-editor[data-imagem]:not([data-ui-image])')) {
        elemento.dataset.uiImage = "1";
        this.instancias.set(elemento, new Imagem(elemento));
      }
    });
  }

  static destroy(scope) {
    const destruir = (elemento) => {
      this.instancias.get(elemento)?.destroy?.();
      this.instancias.delete(elemento);
    };

    if (scope.matches?.("[data-ui], [data-ui-table], [data-ui-chart], [data-ui-image]")) {
      destruir(scope);
    }

    scope.querySelectorAll?.("[data-ui], [data-ui-table], [data-ui-chart], [data-ui-image]").forEach((elemento) => {
      destruir(elemento);
    });
  }
}

UI.start(document.body);
