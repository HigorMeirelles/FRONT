(function() {
	"use strict";

	class Grafico {

		#elemento;
		#container;
		#grade;
		#filtros;
		#lista;
		#rem;
		#valores;
		#maiorValor;
		#rangeHTML;
		#rangeSVG;
		#observer;
		#eventoChange;
		#subfiltros;
		#eventoChangeSelect;
		#resizeObserver;
		#roDebounce;
		#internalResize = false;
		#lastSize = { w: 0, h: 0 };
		#roReady = false;

		constructor(id, config) {
			this.#elemento = document.getElementById(id);
			this.#rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
			if (config.subfiltros) {
				this.#valores = config.valores[0].valores;
			} else {
				this.#valores = config.valores;
			}

			this.#maiorValor = Math.max(...this.#valores.map(v => Math.max(...v.valores)));

			this.#rangeHTML = (conteudo) => {
				return document.createRange().createContextualFragment(conteudo);
			};

			this.#rangeSVG = (conteudo) => {
				const parser = new DOMParser();
				const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${conteudo}</svg>`, "image/svg+xml");
				return doc.documentElement.firstChild; // Retorna o fragmento SVG
			};

			this._inicializar(config);

			this.#monitorarRemocao();


		}

		_inicializar(config) {
			// define o handler antes de criar o menu
			if (this.#elemento.classList.contains("circulo")) {
				this.#eventoChange = () => this._criarCirculos();
			} else if (this.#elemento.classList.contains("setor")) {
				this.#eventoChange = () => this._criarSetores();
			} else if (this.#elemento.classList.contains("barra")) {
				this.#eventoChange = this._removerBarrasComAnimacao.bind(this);
			} else {
				// linhas
				this.#eventoChange = () => {
					this.#container.innerHTML = "";
					this._criarLinhas();
				};
			}
			this.criarMenu(config);

			if (this.#elemento.classList.contains("circulo") || this.#elemento.classList.contains("setor")) {
				this._criarContainer();
				this.#container.setAttribute("viewBox", "0 0 100 100");
				this.#container.setAttribute("preserveAspectRatio", "xMidYMid meet");
				this._criarLista();
				if (this.#elemento.classList.contains("circulo")) {
					this._criarCirculos();
				} else {
					this._criarSetores();
				}

			} else {
				this.#eventoChange = this._removerBarrasComAnimacao.bind(this);
				this.criarGrade();
				this._criarContainer();
				if (this.#elemento.classList.contains("barra")) {
					this._criarBarras();
				} else {
					this._criarLinhas();
				}

			}

		}

		_animarSetor(setor) {
			let escala = 0;
			const duracao = 1000; // Tempo da animação em ms
			const passos = duracao / 16; // Aproximadamente 60fps
			const incremento = 1 / passos; // Cresce até `1`

			function animar() {
				escala += incremento;
				if (escala >= 1) {
					setor.setAttribute("transform", "scale(1)"); // Garante o valor final
				} else {
					setor.setAttribute("transform", `scale(${escala})`);
					requestAnimationFrame(animar);
				}
			}

			requestAnimationFrame(animar);
		}


		_criarSetores() {
			this.#container.innerHTML = ""; // Limpa o SVG anterior
			this.#lista.innerHTML = ""; // Limpa a lista de legendas

			const raio = 40; // Raio do gráfico de pizza
			const centro = 50; // Centro do círculo
			const total = this.#valores.reduce((sum, grupo) => sum + grupo.valores[0], 0);
			if (total <= 0) {
				// nada a desenhar: manter UI limpa e sair
				return;
			}
			let startAngle = 0; // Ângulo inicial
			const gapSize = 0; // Define o espaço entre os setores

			this.#valores.forEach((grupo, index) => {
				if (!this.#filtros[index].checked) return;

				const valor = grupo.valores[0];
				const percentage = (valor / total) * 100;
				let angle = (percentage / 100) * 360;

				// Aplica o gap reduzindo o ângulo do setor
				const adjustedAngle = angle - gapSize;
				const endAngle = startAngle + adjustedAngle;

				// Converte ângulos para coordenadas no SVG
				const startX = centro + raio * Math.cos((Math.PI * startAngle) / 180);
				const startY = centro + raio * Math.sin((Math.PI * startAngle) / 180);
				const endX = centro + raio * Math.cos((Math.PI * endAngle) / 180);
				const endY = centro + raio * Math.sin((Math.PI * endAngle) / 180);

				// Define se o arco é maior que 180° (flag do SVG)
				const largeArcFlag = adjustedAngle > 180 ? 1 : 0;

				// Criando o `<path>` do setor
				const pathData = `
			            M ${centro},${centro} 
			            L ${startX},${startY} 
			            A ${raio},${raio} 0 ${largeArcFlag},1 ${endX},${endY} 
			            Z
			        `;

				const setor = this._criarElementoSVG("path", {
					"d": pathData,
					"id": `setor${index}`,
					"fill": "currentColor",
					"data-value": valor,
					"transform": "scale(0)", // Começa invisível
					"transform-origin": "50% 50%", // Origem do crescimento
				});

				this.#container.appendChild(setor);

				// Criando legenda correspondente
				const li = this.#rangeHTML(`
			            <li>
			                <p>${grupo.label}</p>
			                <p id="registro${index}">${valor} (${percentage.toFixed(1)}%)</p>
			                <progress id="progress${index}" max="${total}" value="0"></progress>
			            </li>
			        `);
				this.#lista.appendChild(li);

				// Animação da progress bar
				const progressBar = this.#lista.querySelector(`#progress${index}`);
				this._animarProgress(progressBar, valor);

				// Animação do setor crescendo do centro
				this._animarSetor(setor);

				// Atualiza o ângulo de início para o próximo setor, adicionando o gap
				startAngle = endAngle + gapSize;
			});
		}


		_criarCirculos() {
			this.#container.innerHTML = ""; // Limpa o SVG anterior
			this.#lista.innerHTML = ""; // Limpa a lista anterior

			const radius = 40;
			const totalLength = 2 * Math.PI * radius; // Comprimento total do círculo
			const total = this.#valores.reduce((sum, grupo) => sum + grupo.valores[0], 0);
			if (total <= 0) {
				// círculo de contorno já é criado; apenas um 0 central opcional
				this.#container.appendChild(this._criarElementoSVG("text", { x: "50", y: "60" })).textContent = "0";
				return;
			}
			let startAngle = -90;
			const gapSize = 2; // Tamanho do espaço

			//circulo de contorno visual
			this.#container.appendChild(this._criarElementoSVG("circle", {
				"cx": "50",
				"cy": "50",
				"r": radius,
			}));

			this.#valores.forEach((grupo, index) => {
				if (!this.#filtros[index].checked) return;

				const valor = grupo.valores[0];
				const percentage = (valor / total) * 100;

				if (valor > -1) {
					const angle = (percentage / 100) * 360;
					const adjustedAngle = angle - gapSize; // Reduz o ângulo para criar o gap
					const length = (adjustedAngle / 360) * totalLength;

					// Criando cada segmento do círculo
					const circle = this._criarElementoSVG("circle", {
						"id": `circle${index}`,
						"cx": "50",
						"cy": "50",
						"r": radius,
						"stroke-dasharray": `0 ${totalLength}`, // Começa invisível
						"stroke-dashoffset": totalLength, // Escondido no início
						"transform": `rotate(${startAngle}, 50, 50)`,
					});
					if (valor == 0) {
						circle.setAttribute("hidden", true);
					}
					// Ativa a animação após renderização
					requestAnimationFrame(() => {
						circle.setAttribute("stroke-dasharray", `${length} ${totalLength}`);
						circle.setAttribute("stroke-dashoffset", "0");
					});
					startAngle += angle; // Atualiza o ângulo para o próximo segmento
					this.#container.appendChild(circle);
				}
				// Criando a legenda correspondente
				const li = this.#rangeHTML(`
		            <li>
		                <p>${grupo.label}</p>
		                <p id="registro${index}">${valor} (${percentage.toFixed(1)}%)</p>
		                <progress id="progress${index}" max="${total}" value="0"></progress>
		            </li>
		        `);
				this.#lista.appendChild(li);

				// Referência ao progresso e animação do preenchimento
				const progressBar = this.#lista.querySelector(`#progress${index}`);
				this._animarProgress(progressBar, valor);

			});
			let texto = this._criarElementoSVG("text", {
				"x": "50",
				"y": "60"
			});
			texto.textContent = total;
			this.#container.appendChild(texto);
		}

		_animarProgress(progress, valorFinal) {
			let valorAtual = 0;
			const duracao = 1000; // Duração total da animação (1s)
			const passos = duracao / 16; // Aproximadamente 60fps
			const incremento = valorFinal / passos;

			function animar() {
				valorAtual += incremento;
				if (valorAtual >= valorFinal) {
					progress.value = valorFinal; // Garante o valor final exato
				} else {
					progress.value = valorAtual;
					requestAnimationFrame(animar);
				}
			}

			requestAnimationFrame(animar);
		}




		//GRADE
		_removerBarrasComAnimacao() {
			const eVertical = this.#elemento.classList.contains("vertical");
			const barras = Array.from(this.#container.querySelectorAll("rect"));

			if (barras.length === 0) {
				this._criarBarras();
				return;
			}

			let animacoesConcluidas = 0;

			barras.forEach((barra) => {
				const atributo = eVertical ? "height" : "width";
				const valorInicial = parseFloat(barra.getAttribute(atributo));
				const passo = valorInicial / 10; // 10 passos para animação

				const diminuir = () => {

					let novoValor = parseFloat(barra.getAttribute(atributo)) - passo;
					if (novoValor <= 0) {
						novoValor = 0;
						animacoesConcluidas++;
						if (animacoesConcluidas === barras.length) {
							this.#container.innerHTML = ""; // Remove barras ao final
							this._criarBarras(); // Recria as barras
						}
					} else {
						requestAnimationFrame(diminuir);
					}
					setTimeout(() => { }, 100); // Pequena pausa para suavizar a animação
					barra.setAttribute(atributo, novoValor);

				};

				requestAnimationFrame(diminuir);
			});
		}


		criarMenu(config) {
			const h2 = document.createElement("h2");
			h2.textContent = config.titulo;

			const form = document.createElement("form");

			config.filtros.forEach((filtro, index) => {
				const input = this._criarCheckbox(index);

				input.addEventListener("change",
					this.#eventoChange
				);

				const label = this._criarLabel(index, filtro);
				form.appendChild(input);
				form.appendChild(label);
			});

			if (config.subfiltros) {
				this.#subfiltros = document.createElement("select");
				config.valores.map((subfiltro, index) => {
					const option = this._criarOption(index, subfiltro.label);
					this.#subfiltros.appendChild(option);
				});

				this.#eventoChangeSelect = () => {
					const selecionado = this.#subfiltros.value;
					this.#valores = config.valores.find(item => item.label === selecionado)?.valores || [];

					// recalc maiorValor com base no novo conjunto
					this.#maiorValor = Math.max(...this.#valores.map(v => Math.max(...v.valores)));

					// redesenhar grade/plot de acordo com o tipo
					if (this.#elemento.classList.contains("circulo")) {
						this._criarCirculos();
					} else if (this.#elemento.classList.contains("setor")) {
						this._criarSetores();
					} else {
						// barra/linha usa grade + container
						this.#elemento.removeChild(this.#grade);
						this.criarGrade();                 // depende de #maiorValor
						this.#container.innerHTML = "";
						if (this.#elemento.classList.contains("barra")) {
							this._criarBarras();
						} else {
							this._criarLinhas();
						}
					}
				};

				this.#subfiltros.addEventListener("change",
					this.#eventoChangeSelect
				);

				form.appendChild(this.#subfiltros);

			}
			this.#elemento.append(h2, form);
			this.#filtros = Array.from(form.querySelectorAll("input[type='checkbox']"));

		}

		_criarCheckbox(index) {
			const input = document.createElement("input");
			input.id = `${this.#elemento.id}Filtro${index}`;
			input.type = "checkbox";
			input.checked = true;
			return input;
		}

		_criarLabel(index, texto) {
			const label = document.createElement("label");
			label.setAttribute("for", `${this.#elemento.id}Filtro${index}`);
			label.innerHTML = `${texto}`;
			return label;
		}
		_criarOption(index, subfiltro) {
			const option = document.createElement("option");
			option.id = `${this.#elemento.id}SubFiltro${index}`;
			option.value = subfiltro;
			option.innerHTML = `${subfiltro}`;
			return option;
		}

		criarGrade() {
			const larguraTexto = this._calcularLarguraTexto(this.#maiorValor.toString()) + 0.5 * this.#rem;
			const fracoes = Array.from({ length: 11 }, (_, i) => Math.ceil((this.#maiorValor / 10) * i)).reverse();

			const svg = this._criarElementoSVG("svg");

			if (this.#elemento.classList.contains("vertical")) {
				svg.appendChild(this._criarEixo(larguraTexto + 0.25 * this.#rem, larguraTexto + 0.25 * this.#rem, ".75rem", "calc(100% - .75rem)", "eixo-y"));
				svg.appendChild(this._criarEixo(larguraTexto, "100%", "calc(100% - 1rem)", "calc(100% - 1rem)", "eixo-x"));
				svg.appendChild(this._criarLines(fracoes, larguraTexto, "horizontal"));
				svg.appendChild(this._criarTextos(fracoes, larguraTexto, "horizontal"));
			} else if (this.#elemento.classList.contains("horizontal")) {
				svg.appendChild(this._criarEixo("0.25rem", "0.25rem", ".75rem", `calc(100% - ${larguraTexto}px)`, "eixo-y"));
				svg.appendChild(this._criarEixo("0", "100%", `calc(100% - ${larguraTexto + 0.25 * this.#rem}px)`, `calc(100% - ${larguraTexto + 0.25 * this.#rem}px)`, "eixo-x"));
				svg.appendChild(this._criarLines(fracoes, larguraTexto, "vertical"));
				svg.appendChild(this._criarTextos(fracoes, larguraTexto, "vertical"));
			}
			this.#grade = svg;
			this.#elemento.appendChild(this.#grade);
		}


		_criarEixo(x1, x2, y1, y2, classe) {
			return this._criarElementoSVG("line", {
				x1, x2, y1, y2, class: classe,
			});
		}

		_criarLines(fracoes, larguraTexto, orientacao) {
			const gLinhas = this._criarElementoSVG("g", {
				"class": orientacao === "horizontal" ? "eixos-x" : "eixos-y",
			});

			// Define os atributos e valores com base na orientação
			const atributos = orientacao === "horizontal"
				? { coord1: "x1", coord2: "x2", valor1: larguraTexto, valor2: "100%" }
				: { coord1: "y1", coord2: "y2", valor1: ".75rem", valor2: `calc(100% - ${larguraTexto}px)` };

			// Define o índice inicial com base na orientação
			let indice = orientacao === "horizontal" ? 0 : 1;

			fracoes.slice(0, -1).forEach(() => {
				const linha = this._criarElementoSVG("line", {
					[atributos.coord1]: atributos.valor1,
					[atributos.coord2]: atributos.valor2,
				});
				linha.style.setProperty("--i", indice);
				indice++;
				gLinhas.appendChild(linha);
			});

			return gLinhas;
		}

		_criarTextos(fracoes, larguraTexto, orientacao) {
			const gTextos = this._criarElementoSVG("g", {
				"class": orientacao === "horizontal" ? "labels-x" : "labels-y",
			});

			// Define o atributo e o valor com base na orientação
			const atributo = orientacao === "horizontal" ? "x" : "y";
			const valor = orientacao === "horizontal"
				? larguraTexto - 0.5 * this.#rem
				: this._obterAlturaEixoY(larguraTexto) + 2 * this.#rem;

			// Inverte as frações apenas se for vertical
			const fracoesProcessadas = orientacao === "vertical" ? [...fracoes].reverse() : fracoes;

			fracoesProcessadas.forEach((fracao, i) => {
				const texto = this._criarElementoSVG("text", {
					[atributo]: `${valor}px`,
				});
				texto.textContent = fracao; // Define o texto
				texto.style.setProperty("--i", i); // Define o índice como uma variável CSS
				gTextos.appendChild(texto);
			});

			if (this.#maiorValor < 10) {
				const textos = gTextos.querySelectorAll("text");
				for (let i = 1; i < textos.length - 1; i++) {
					textos[i].textContent = "";
				}
				if (this.#maiorValor == 0) {
					textos[textos.length - 1].textContent = "";
				}
			}

			return gTextos;
		}

		_calcularLarguraTexto(texto) {
			const span = document.createElement("span");
			span.style.position = "absolute";
			span.style.whiteSpace = "nowrap";
			span.style.visibility = "hidden";
			span.style.fontSize = getComputedStyle(this.#elemento).fontSize;
			span.textContent = texto;
			document.body.appendChild(span);
			const largura = span.offsetWidth;
			document.body.removeChild(span);
			return largura;
		}


		_obterAlturaEixoY(larguraTexto) {
			// Cria um SVG temporário para calcular a altura do eixo Y
			// A altura depende de estilos CSS aplicados ao elemento principal
			const tempSvg = this._criarElementoSVG("svg", {
				xmlns: "http://www.w3.org/2000/svg",
			});
			tempSvg.style.position = "absolute"; // Fora do fluxo visual
			tempSvg.style.visibility = "hidden";

			// Adiciona um eixo Y temporário
			const eixoY = this._criarEixo("0.25rem", "0.25rem", ".75rem", `calc(100% - ${larguraTexto}px)`, "eixo-y");
			tempSvg.appendChild(eixoY);

			// Adiciona ao elemento principal para permitir cálculo baseado em CSS
			this.#elemento.appendChild(tempSvg);

			// Calcula a altura do eixo Y renderizado
			const tamanho = eixoY.getBBox().height;

			// Remove o SVG temporário
			this.#elemento.removeChild(tempSvg);

			return tamanho;
		}

		//CONTAINER
		_criarContainer() {
			// Cria o container principal
			const container = document.createElement("div");
			this.#container = this._criarElementoSVG("svg", {
				"xmlns": "http://www.w3.org/2000/svg",
				"width": "100%",
				"height": "100%"
			});

			// Adiciona o SVG ao container e o container ao elemento principal
			container.appendChild(this.#container);
			this.#elemento.appendChild(container);
			// depois do requestAnimationFrame que seta width/height
			requestAnimationFrame(() => {
				const { offsetWidth, offsetHeight } = container;
				this.#container.setAttribute("width", offsetWidth);
				this.#container.setAttribute("height", offsetHeight);
				// inicializa a memória do tamanho
				this.#lastSize = { w: offsetWidth, h: offsetHeight };
			});

			// substitua TODO o bloco do ResizeObserver atual por este:
			this.#resizeObserver = new ResizeObserver(entries => {
				const entry = entries[0];
				const { width, height } = entry.contentRect;

				// 1) ignora o primeiro disparo (criação / pintura inicial)
				if (!this.#roReady) {
					this.#roReady = true;
					this.#lastSize = { w: width, h: height };
					return;
				}

				// 2) tolerância de 1px pra evitar ruídos de layout
				const dw = Math.abs(width - this.#lastSize.w);
				const dh = Math.abs(height - this.#lastSize.h);
				if (dw < 100 && dh < 100) return;

				// 3) evita reentrada quando nós mesmos alteramos width/height
				if (this.#internalResize) return;

				// 4) debounce para não redesenhar a cada pixel
				clearTimeout(this.#roDebounce);
				this.#roDebounce = setTimeout(() => {
					this.#internalResize = true;

					this.#lastSize = { w: width, h: height };
					this.#container.setAttribute("width", width);
					this.#container.setAttribute("height", height);

					// redesenho conforme o tipo
					if (this.#elemento.classList.contains("circulo")) this._criarCirculos();
					else if (this.#elemento.classList.contains("setor")) this._criarSetores();
					else if (this.#elemento.classList.contains("barra")) this._criarBarras();
					else this._criarLinhas();

					this.#internalResize = false;
				}, 80);
			});

			// observa só depois do primeiro ciclo de layout
			setTimeout(() => this.#resizeObserver.observe(container), 0);

		}
		_criarLista() {

			this.#lista = document.createElement("ul");
			this.#elemento.appendChild(this.#lista);

		}


		_criarElementoSVG(tipo, atributos = {}) {
			if (!["line", "text", "rect", "circle", "polyline", "path", "g", "svg"].includes(tipo)) {
				throw new Error(`Tipo de elemento SVG inválido: ${tipo}`);
			}
			const elemento = document.createElementNS("http://www.w3.org/2000/svg", tipo);
			Object.entries(atributos).forEach(([key, value]) => elemento.setAttribute(key, value));
			return elemento;
		}
		_calcularGruposEBarras() {
			let TOTAL_GRUPOS = 0;
			let TOTAL_BARRAS = 0;
			let GRUPO = false;

			// Verifica se há pelo menos um grupo com mais de uma barra ativa
			this.#valores.forEach((grupo, indexGrupo) => {
				let barrasAtivas;

				if (this.#valores[0].valores.length === 1) {
					// Caso especial: Cada grupo tem apenas UMA barra (GRUPO = false)
					barrasAtivas = this.#filtros[indexGrupo]?.checked ? [grupo.valores[0]] : [];
				} else {
					// Caso normal: Cada grupo tem várias barras
					barrasAtivas = grupo.valores.filter((_, indexBarra) => this.#filtros[indexBarra]?.checked);
				}

				if (barrasAtivas.length > 0) {
					TOTAL_GRUPOS++; // Conta os grupos com ao menos uma barra ativa
					TOTAL_BARRAS = barrasAtivas.length; // Armazena a quantidade de barras ativas (será sempre a mesma)
					if (TOTAL_BARRAS > 1) {
						GRUPO = true; // Se há mais de uma barra ativa, é um grupo
					}
				}
			});
			if (TOTAL_GRUPOS == 0) TOTAL_GRUPOS = this.#valores.length;

			return {
				TOTAL_GRUPOS,
				GRUPO,
				TOTAL_BARRAS
			};
		}

		_criarBarras() {
			// Limpa o conteúdo anterior do SVG de barras
			this.#container.innerHTML = "";

			const eVertical = this.#elemento.classList.contains("vertical")

			let posicaoInicial = this.#rem * 2;
			const TAMANHO_CONTAINER = Math.ceil(eVertical ? this.#grade.getBoundingClientRect().height : this.#grade.getBoundingClientRect().width + 8) - (2 * this.#rem);
			const LARGURA_CONTAINER = Math.ceil(eVertical ? this.#grade.getBoundingClientRect().width : this.#grade.getBoundingClientRect().height) - (2 * this.#rem);

			const MARGEM_INICIO = (eVertical ? (this.#rem * 2) : (this.#container.getBoundingClientRect().width - (TAMANHO_CONTAINER + this.#rem * 3)));

			const { TOTAL_GRUPOS, GRUPO, TOTAL_BARRAS } = this._calcularGruposEBarras();

			const GAP = Math.ceil(this.#rem * (GRUPO ? 2 : 2));

			const LARGURA_GRUPO = Math.ceil((LARGURA_CONTAINER / TOTAL_GRUPOS) - GAP);

			const LARGURA_BARRA = Math.ceil(Math.max(((LARGURA_GRUPO / TOTAL_BARRAS) - (GAP * 2)), (this.#rem * 2.5)));


			// Percorre os valores e cria os grupos de barras
			this.#valores.forEach((grupo, indiceGrupo) => {
				const g = this._criarElementoSVG("g", { "data-index": indiceGrupo });

				grupo.valores.forEach((valor, idx) => {
					const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
					const textRect = document.createElementNS("http://www.w3.org/2000/svg", "text");
					textRect.textContent = valor;

					if (this.#filtros[idx].checked) {
						posicaoInicial = Math.ceil(posicaoInicial + (GAP / 2));

						const TAMANHO_BARRA = this.#maiorValor > 0
							? Math.ceil((valor / this.#maiorValor) * TAMANHO_CONTAINER)
							: 0;

						if (eVertical) {
							const posicaoY = (MARGEM_INICIO + (TAMANHO_CONTAINER - TAMANHO_BARRA));

							// Gráfico Vertical
							rect.setAttribute("x", posicaoInicial);
							rect.setAttribute("y", posicaoY);
							rect.setAttribute("width", LARGURA_BARRA);
							rect.setAttribute("height", "0"); // Começa sem altura

							// Animação de crescimento vertical
							const animateHeight = document.createElementNS("http://www.w3.org/2000/svg", "animate");
							animateHeight.setAttribute("attributeName", "height");
							animateHeight.setAttribute("from", "0");
							animateHeight.setAttribute("to", TAMANHO_BARRA);
							animateHeight.setAttribute("dur", "0.3s");
							animateHeight.setAttribute("fill", "freeze");

							const animateY = document.createElementNS("http://www.w3.org/2000/svg", "animate");
							animateY.setAttribute("attributeName", "y");
							animateY.setAttribute("from", MARGEM_INICIO + TAMANHO_CONTAINER);
							animateY.setAttribute("to", posicaoY);
							animateY.setAttribute("dur", "0.3s");
							animateY.setAttribute("fill", "freeze");

							rect.appendChild(animateHeight);
							rect.appendChild(animateY);

							textRect.setAttribute("x", posicaoInicial + (textRect.textContent.length * 3.5) + (LARGURA_BARRA / 2.5));
							textRect.setAttribute("y", posicaoY - (this.#rem / 2));
						} else {
							// Gráfico Horizontal
							rect.setAttribute("x", MARGEM_INICIO);
							rect.setAttribute("y", posicaoInicial);
							rect.setAttribute("width", "0"); // Começa sem largura
							rect.setAttribute("height", LARGURA_BARRA);

							// Animação de crescimento horizontal
							const animateWidth = document.createElementNS("http://www.w3.org/2000/svg", "animate");
							animateWidth.setAttribute("attributeName", "width");
							animateWidth.setAttribute("from", "0");
							animateWidth.setAttribute("to", TAMANHO_BARRA);
							animateWidth.setAttribute("dur", "0.3s");
							animateWidth.setAttribute("fill", "freeze");

							rect.appendChild(animateWidth);

							textRect.setAttribute("x", MARGEM_INICIO + TAMANHO_BARRA + (this.#rem / 2));
							textRect.setAttribute("y", posicaoInicial + this.#rem);
						}
						posicaoInicial = Math.ceil(posicaoInicial + LARGURA_BARRA);
					} else {
						rect.setAttribute("x", "0");
						rect.setAttribute("y", "0");
						rect.setAttribute("width", "0");
						rect.setAttribute("height", "0");
						rect.setAttribute("hidden", true);
						textRect.setAttribute("hidden", true);
					}
					rect.setAttribute("class", "barra");
					g.appendChild(rect);

					g.appendChild(textRect);

				});

				let label = this._criarElementoSVG("text");
				label.textContent = grupo.label;
				let line = this._criarElementoSVG("line");

				if (eVertical) {
					label.setAttribute("style", `translate : calc(${(posicaoInicial - (LARGURA_GRUPO / 2))}px + 1.25rem) calc(${TAMANHO_CONTAINER}px + 3rem);`);
					line.setAttribute("x1", posicaoInicial + (this.#rem * 1.5));
					line.setAttribute("x2", posicaoInicial + (this.#rem * 1.5));
					line.setAttribute("y1", MARGEM_INICIO);
					line.setAttribute("y2", TAMANHO_CONTAINER + GAP);
				} else {
					label.setAttribute("style", `translate : calc(${MARGEM_INICIO}px - .5rem) calc(${(posicaoInicial - (LARGURA_GRUPO / 2))}px + 1rem);`);
					line.setAttribute("y1", (posicaoInicial - (this.#rem * 2.5) - (LARGURA_BARRA * 2)));
					line.setAttribute("y2", (posicaoInicial - (this.#rem * 2.5) - (LARGURA_BARRA * 2)));
					line.setAttribute("x1", MARGEM_INICIO);
					line.setAttribute("x2", MARGEM_INICIO + TAMANHO_CONTAINER);
				}
				g.appendChild(label);
				g.appendChild(line);
				posicaoInicial = Math.ceil(posicaoInicial + GAP);
				this.#container.appendChild(g);
			});

			// Atualiza a largura/altura do container de acordo com as barras geradas
			requestAnimationFrame(() => {
				this.#container.setAttribute(eVertical ? "width" : "height", posicaoInicial);
			});

		}

		_criarLinhas() {
			this.#container.innerHTML = ""; // Limpa o conteúdo anterior do SVG

			const eVertical = this.#elemento.classList.contains("vertical");

			let posicaoInicial = this.#rem * 0.25; // Ajustado para evitar gap
			const TAMANHO_CONTAINER = Math.ceil(
				eVertical
					? this.#grade.getBoundingClientRect().height
					: this.#grade.getBoundingClientRect().width
			) - (2 * this.#rem);
			const LARGURA_CONTAINER = Math.ceil(
				eVertical
					? this.#grade.getBoundingClientRect().width
					: this.#grade.getBoundingClientRect().height
			) - (4 * this.#rem);

			const MARGEM_INICIO = (eVertical ? (this.#rem * 2) : (this.#container.getBoundingClientRect().width - (TAMANHO_CONTAINER + this.#rem * 3)));


			const { TOTAL_GRUPOS, TOTAL_BARRAS } = this._calcularGruposEBarras();
			const GAP = Math.ceil(this.#rem * 0.5); // Mantém um espaçamento pequeno

			const LARGURA_GRUPO = Math.ceil((LARGURA_CONTAINER / TOTAL_GRUPOS) - GAP);

			let series = Array.from({ length: TOTAL_BARRAS }, () => []);

			this.#valores.forEach((grupo, indiceGrupo) => {
				const g = this._criarElementoSVG("g", { "data-index": indiceGrupo });

				grupo.valores.forEach((valor, idx) => {
					if (!this.#filtros[idx].checked) return;

					const TAMANHO_BARRA = this.#maiorValor > 0
						? Math.ceil((valor / this.#maiorValor) * TAMANHO_CONTAINER)
						: 0;

					let pontoX, pontoY;

					if (eVertical) {
						// Lógica para gráficos **VERTICAIS**
						pontoX = posicaoInicial;
						pontoY = Math.ceil(MARGEM_INICIO + (TAMANHO_CONTAINER - TAMANHO_BARRA));
					} else {
						// Lógica para gráficos **HORIZONTAIS**
						pontoX = Math.ceil(MARGEM_INICIO + TAMANHO_BARRA);
						pontoY = posicaoInicial; // Mantém os pontos alinhados na horizontal
					}

					series[idx].push(`${pontoX},${pontoY}`);

					// Criando cada ponto do gráfico
					const circle = this._criarElementoSVG("circle", {
						"cx": pontoX,
						"cy": pontoY,
						"r": 4, // Tamanho do ponto
						"fill": "currentColor",
						"opacity": "0", // Começa invisível para animação
					});

					// Animação para os pontos aparecerem suavemente
					requestAnimationFrame(() => {
						circle.setAttribute("opacity", "1");
					});

					g.appendChild(circle);
				});

				// Adicionando a linha vertical entre grupos (se for gráfico vertical)
				if (indiceGrupo > 0 && eVertical) {
					const linhaSeparadora = this._criarElementoSVG("line", {
						"x1": posicaoInicial,
						"x2": posicaoInicial,
						"y1": MARGEM_INICIO,
						"y2": MARGEM_INICIO + TAMANHO_CONTAINER,
						"stroke": "currentColor",
						"stroke-width": "1",
						"opacity": "0.5",
					});



					this.#container.appendChild(linhaSeparadora);
				}

				this.#container.appendChild(g);
				posicaoInicial += LARGURA_GRUPO;
			});

			// Criando as polylines para conectar os pontos das séries
			series.forEach((serie) => {
				if (serie.length > 1) {
					const polyline = this._criarElementoSVG("polyline", {
						"points": "0,0", // Começa vazia para animação
						"fill": "none",
						"stroke": "currentColor",
						"stroke-width": "2",
						"stroke-linecap": "round",
						"stroke-linejoin": "round",
						"opacity": "0",
					});

					this.#container.appendChild(polyline);

					// Animação para a linha crescer
					requestAnimationFrame(() => {
						polyline.setAttribute("points", serie.join(" "));
						polyline.setAttribute("opacity", "1");
					});
				}
			});
		}

		#monitorarRemocao() {
			this.#observer = new MutationObserver((mutations) => {
				mutations.forEach((mutation) => {
					mutation.removedNodes.forEach((node) => {
						if (node === this.#elemento) {
							this.destroy();
						}
					});
				});
			});

			this.#observer.observe(document.body, { childList: true, subtree: true });
		}

		destroy() {
		
			if (this.#resizeObserver) this.#resizeObserver.disconnect();

			// Remove eventos associados
			this.#filtros.forEach(input => input.removeEventListener("change", this.#eventoChange));

			// Desconecta o observador
			this.#observer.disconnect();

			// Limpa referências internas
			this.#elemento = null;
			this.#container = null;
			this.#grade = null;
			this.#filtros = null;
			this.#lista = null;
			this.#rem = null;
			this.#valores = null;
			this.#maiorValor = null;
			this.#rangeHTML = null;
			this.#rangeSVG = null;
		}

	}

	window.Grafico = Grafico;
})();