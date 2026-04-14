(function(window) {
	'use strict';

	class Imagem {
		#imagem;
		#image;
		#controles;
		#URL;
		#options;
		#cropper;
		#originalImageURL;
		#uploadedImageType;
		#uploadedImageName;
		#uploadedImageURL;

		constructor(elemento) {
			this.#imagem = elemento;
			Cropper = window.Cropper;
			this.#image = elemento.querySelector('img');
			this.#controles = this.#imagem.querySelectorAll('.controles');

			this.#URL = window.URL || window.webkitURL;
			this.#options = {
				aspectRatio: 1 / 1
			};
			this.#cropper = new Cropper(this.#image, this.#options);
			this.#originalImageURL = this.#image.src;
			this.#uploadedImageType = 'image/jpeg';
			this.#uploadedImageName = 'cropped.jpg';
			this.#acoes();
		}

		#acoes() {
			let self = this;
			if (!document.createElement('canvas').getContext) {
				$('button[data-method="getCroppedCanvas"]').prop('disabled', true);
			}

			if (typeof document.createElement('cropper').style.transition === 'undefined') {
				$('button[data-method="rotate"]').prop('disabled', true);
				$('button[data-method="scale"]').prop('disabled', true);
			}
			self.#controles[0].querySelector('#aspect-ratio').onchange = function(event) {
				let e = event || window.event;
				let target = e.target || e.srcElement;
				let cropBoxData;
				let canvasData;
				let isCheckbox;
				let isRadio;
				if (!self.#cropper) {
					return;
				}
				if (target.tagName.toLowerCase() === 'label') {
					target = target.querySelector('input');
				}
				isCheckbox = target.type === 'checkbox';
				isRadio = target.type === 'radio';
				if (isCheckbox || isRadio) {
					if (isCheckbox) {
						self.#options[target.name] = target.checked;
						cropBoxData = self.#cropper.getCropBoxData();
						canvasData = self.#cropper.getCanvasData();
						self.#options.ready = function() {
							self.#cropper.setCropBoxData(cropBoxData).setCanvasData(canvasData);
						};
					} else {
						self.#options[target.name] = target.value;
						self.#options.ready = function() {
						};
					}
					self.#cropper.destroy();
					self.#cropper = new Cropper(self.#image, self.#options);
				}
			};
			self.#controles[1].onclick = function(event) {
				let e = event || window.event;
				let target = e.target || e.srcElement;
				let cropped;
				let result;
				let input;
				let data;
				if (!self.#cropper) {
					return;
				}
				while (target !== this) {
					if (target.getAttribute('data-method')) {
						break;
					}
					target = target.parentNode;
				}
				if (target === this || target.disabled || target.className.indexOf('disabled') > -1) {
					return;
				}
				data = {
					method: target.getAttribute('data-method'),
					target: target.getAttribute('data-target'),
					option: target.getAttribute('data-option') || undefined,
					secondOption: target.getAttribute('data-second-option') || undefined
				};
				cropped = self.#cropper.cropped;
				if (data.method) {
					if (typeof data.target !== 'undefined') {
						input = self.#imagem.querySelector(data.target);

						if (!target.hasAttribute('data-option') && data.target && input) {
							try {
								data.option = JSON.parse(input.value);
							} catch (e) {
								console.log(e.message);
							}
						}
					}
					switch (data.method) {
						case 'rotate':
							if (cropped && self.#options.viewMode > 0) {
								self.#cropper.clear();
							}
							break;
						case 'getCroppedCanvas':
							try {
								data.option = JSON.parse(data.option);
							} catch (e) {
								console.log(e.message);
							}
							if (self.#uploadedImageType === 'image/jpeg') {
								if (!data.option) {
									data.option = {};
								}
								data.option.fillColor = 'fff';
							}
							break;
					}
					result = self.#cropper[data.method](data.option, data.secondOption);
					switch (data.method) {
						case 'rotate':
							if (cropped && self.#options.viewMode > 0) {
								self.#cropper.crop();
							}
							break;
						case 'scaleX':
						case 'scaleY':
							target.setAttribute('data-option', -data.option);
							break;
						case 'destroy':
							self.#cropper = null;

							if (self.#uploadedImageURL) {
								self.#URL.revokeObjectURL(self.#uploadedImageURL);
								self.#uploadedImageURL = '';
								self.#image.src = self.#originalImageURL;
							}
							break;
					}
					if (typeof result === 'object' && result !== self.#cropper && input) {
						try {
							input.value = JSON.stringify(result);
						} catch (e) {
							console.log(e.message);
						}
					}
				}
			};
			document.body.onkeydown = function(event) {
				let e = event || window.event;
				if (e.target !== this || !self.#cropper || this.scrollTop > 300) {
					return;
				}
				switch (e.keyCode) {
					case 37:
						e.preventDefault();
						self.#cropper.move(-1, 0);
						break;
					case 38:
						e.preventDefault();
						self.#cropper.move(0, -1);
						break;
					case 39:
						e.preventDefault();
						self.#cropper.move(1, 0);
						break;
					case 40:
						e.preventDefault();
						self.#cropper.move(0, 1);
						break;
				}
			};
			let inputImage = self.#imagem.querySelector('#arquivoImagem');
			if (self.#URL) {
				inputImage.onchange = function() {
					let files = this.files;
					let file;
					if (files && files.length) {
						file = files[0];
						if(file.size >= 10485760){ // 10 MiB
							window.alert('Imagem muito grande');
							this.target.value = null;
						} else if (!/^image\/\w+/.test(file.type)) {
							window.alert('Please choose an image file.');
						} else {
							self.#uploadedImageType = file.type;
							self.#uploadedImageName = file.name;
							if (self.#uploadedImageURL) {
								self.#URL.revokeObjectURL(self.#uploadedImageURL);
							}
							self.#image.src = self.#uploadedImageURL = self.#URL.createObjectURL(file);
							if (self.#cropper) {
								self.#cropper.destroy();
							}
							self.#cropper = new Cropper(self.#image, self.#options);
						}
					}
				};
			} else {
				inputImage.disabled = true;
				inputImage.parentNode.className += ' disabled';
			}
		};
		getImagem() {
			return new Promise((sucesso, falha) => {
				this.#cropper.getCroppedCanvas().toBlob((blob) => sucesso(blob));
			});
		}
	}
	window.Imagem = Imagem;
})(window);