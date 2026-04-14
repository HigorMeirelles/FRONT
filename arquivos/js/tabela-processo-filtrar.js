let registros = [];

function normalizarIntervalo(inicio, fim) {
    if (inicio == null || fim == null) return null;

    return inicio <= fim
        ? { inicio, fim }
        : { inicio: fim, fim: inicio };
}

function atendeCriterios(registro, criterios) {
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

self.onmessage = (event) => {
    const { tipo, token, criterios, registros: base } = event.data || {};

    if (tipo === "base") {
        registros = Array.isArray(base) ? base : [];
        return;
    }

    if (tipo !== "filtrar") {
        return;
    }

    const indices = registros
        .filter((registro) => atendeCriterios(registro, criterios))
        .map((registro) => registro.indice);

    self.postMessage({ token, indices });
};
