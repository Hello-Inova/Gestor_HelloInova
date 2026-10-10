(function () {
  'use strict';

  const grid = document.getElementById('catalog-grid');
  const filters = document.getElementById('catalog-filters');
  const search = document.getElementById('catalog-search');
  const count = document.getElementById('catalog-count');
  const dialog = document.getElementById('product-dialog');
  const slug = window.location.pathname.split('/').filter(Boolean).pop() || '';
  let products = [];
  let activeCategory = '';
  let mobileScrollObserver = null;
  let productDialogTrigger = null;
  let lightbox = null;
  let lightboxImages = [];
  let lightboxIndex = 0;
  let lightboxZoom = 1;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function priceLabel(product) {
    if (product.price === null || product.price === undefined) return 'Valor sob consulta';
    return Number(product.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function mediaForProduct(product) {
    const images = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
    if (!product.logo) return images;
    return [product.logo, ...images.filter((image) => image !== product.logo)];
  }

  function renderFilters() {
    const categories = [...new Set(products.map((product) => product.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    filters.innerHTML = '';
    const allButton = node('button', 'catalog-filter' + (!activeCategory ? ' active' : ''), 'Todos');
    allButton.type = 'button';
    allButton.addEventListener('click', () => { activeCategory = ''; renderFilters(); renderProducts(); });
    filters.appendChild(allButton);
    categories.forEach((category) => {
      const button = node('button', 'catalog-filter' + (activeCategory === category ? ' active' : ''), category);
      button.type = 'button';
      button.addEventListener('click', () => { activeCategory = category; renderFilters(); renderProducts(); });
      filters.appendChild(button);
    });
  }

  function buildCard(product) {
    const card = node('article', 'catalog-card');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Visualizar todos os dados de ' + product.name);
    const imageWrap = node('div', 'catalog-card-image');
    const media = mediaForProduct(product);
    const coverImage = product.logo || media[0];
    if (coverImage) {
      const image = document.createElement('img');
      image.src = coverImage;
      image.alt = product.logo ? 'Logo de ' + product.name : product.name;
      image.loading = 'lazy';
      imageWrap.appendChild(image);
      if (product.logo) imageWrap.classList.add('has-logo');
      if (media.length > 1) imageWrap.appendChild(node('span', 'catalog-card-image-count', media.length + ' imagens'));
    } else {
      imageWrap.appendChild(node('span', 'catalog-card-fallback', (product.name || '?').charAt(0).toUpperCase()));
    }
    const body = node('div', 'catalog-card-body');
    body.appendChild(node('span', 'catalog-card-category', product.category || 'Solução digital'));
    body.appendChild(node('h3', '', product.name));
    body.appendChild(node('p', '', product.summary || product.details || 'Conheça esta solução da Hello Inova.'));
    const footer = node('div', 'catalog-card-footer');
    const price = node('div', 'catalog-price', priceLabel(product));
    if (product.price_details) price.appendChild(node('small', '', product.price_details));
    const button = node('a', 'catalog-details-button', 'Ver detalhes ↗');
    button.href = product.detail_url || '/captacao';
    button.setAttribute('aria-label', 'Ver detalhes de ' + product.name);
    button.addEventListener('click', (event) => event.stopPropagation());
    footer.append(price, button);
    body.appendChild(footer);
    card.append(imageWrap, body);
    card.addEventListener('click', (event) => {
      if (event.target.closest('a, button')) return;
      openProduct(product, card);
    });
    card.addEventListener('keydown', (event) => {
      if (event.target !== card || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      openProduct(product, card);
    });
    return card;
  }

  function renderProducts() {
    const term = search.value.trim().toLowerCase();
    const visible = products.filter((product) => {
      const haystack = [product.name, product.category, product.summary, product.details].join(' ').toLowerCase();
      return (!term || haystack.includes(term)) && (!activeCategory || product.category === activeCategory);
    });
    grid.innerHTML = '';
    count.textContent = visible.length + (visible.length === 1 ? ' solução encontrada' : ' soluções encontradas');
    if (!visible.length) {
      grid.appendChild(node('div', 'catalog-state', products.length ? 'Nenhuma solução corresponde à pesquisa.' : 'Nenhuma solução foi publicada ainda.'));
      updateMobileScrollWindow();
      return;
    }
    visible.forEach((product) => grid.appendChild(buildCard(product)));
    updateMobileScrollWindow();
  }

  function updateMobileScrollWindow() {
    const cards = [...grid.querySelectorAll('.catalog-card')];
    const shouldScroll = window.matchMedia('(max-width: 768px)').matches && cards.length > 2;
    if (mobileScrollObserver) {
      mobileScrollObserver.disconnect();
      mobileScrollObserver = null;
    }
    grid.classList.toggle('mobile-two-row-scroll', shouldScroll);
    if (shouldScroll) {
      grid.tabIndex = 0;
      grid.setAttribute('aria-label', 'Lista de soluções com rolagem vertical');
      const setScrollHeight = () => {
        const gap = parseFloat(getComputedStyle(grid).rowGap || getComputedStyle(grid).gap) || 12;
        const height = cards[0].getBoundingClientRect().height + cards[1].getBoundingClientRect().height + gap;
        grid.style.setProperty('--mobile-scroll-height', Math.ceil(height) + 'px');
      };
      requestAnimationFrame(setScrollHeight);
      if ('ResizeObserver' in window) {
        mobileScrollObserver = new ResizeObserver(setScrollHeight);
        mobileScrollObserver.observe(cards[0]);
        mobileScrollObserver.observe(cards[1]);
      }
    } else {
      grid.removeAttribute('tabindex');
      grid.removeAttribute('aria-label');
      grid.style.removeProperty('--mobile-scroll-height');
    }
  }

  function openProduct(product, trigger) {
    productDialogTrigger = trigger || document.activeElement;
    dialog.innerHTML = '';
    const card = node('div', 'product-dialog-card');
    const close = node('button', 'dialog-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Fechar');
    close.addEventListener('click', closeProduct);
    card.appendChild(close);

    const gallery = node('div', 'dialog-gallery');
    const main = node('div', 'dialog-main-image');
    const images = mediaForProduct(product);
    let selectedImageIndex = 0;
    const mainImage = document.createElement('img');
    if (images.length) {
      mainImage.src = images[0];
      mainImage.alt = product.name;
      mainImage.title = 'Clique para ampliar';
      main.classList.add('expandable');
      main.tabIndex = 0;
      main.setAttribute('role', 'button');
      main.setAttribute('aria-label', 'Ampliar imagem de ' + product.name);
      const expandSelected = () => openImageLightbox(images, selectedImageIndex, product.name);
      main.addEventListener('click', expandSelected);
      main.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          expandSelected();
        }
      });
      main.appendChild(mainImage);
    } else {
      main.appendChild(node('span', 'catalog-card-fallback', (product.name || '?').charAt(0).toUpperCase()));
    }
    gallery.appendChild(main);
    if (images.length > 1) {
      const thumbs = node('div', 'dialog-thumbs');
      images.forEach((imageUrl, index) => {
        const thumb = node('button', 'dialog-thumb' + (index === 0 ? ' active' : ''));
        thumb.type = 'button';
        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = 'Imagem ' + (index + 1);
        thumb.appendChild(image);
        thumb.addEventListener('click', () => {
          selectedImageIndex = index;
          mainImage.src = imageUrl;
          thumbs.querySelectorAll('.dialog-thumb').forEach((item) => item.classList.remove('active'));
          thumb.classList.add('active');
        });
        thumbs.appendChild(thumb);
      });
      gallery.appendChild(thumbs);
    }

    const content = node('div', 'dialog-content');
    content.appendChild(node('span', 'catalog-card-category', product.category || 'Solução digital'));
    const title = node('h2', '', product.name);
    title.id = 'product-dialog-title';
    content.appendChild(title);
    if (product.summary) content.appendChild(node('p', 'dialog-summary', product.summary));
    if (product.details) content.appendChild(node('div', 'dialog-details', product.details));
    const price = node('div', 'dialog-price', priceLabel(product));
    if (product.price_details) price.appendChild(node('small', '', product.price_details));
    content.appendChild(price);
    const contact = node('a', 'dialog-cta', 'Quero saber mais ↗');
    contact.href = product.detail_url || '/captacao';
    content.appendChild(contact);
    card.append(gallery, content);
    dialog.appendChild(card);
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'product-dialog-title');
    dialog.hidden = false;
    document.body.style.overflow = 'hidden';
    close.focus();
  }

  function closeProduct() {
    dialog.hidden = true;
    dialog.innerHTML = '';
    document.body.style.overflow = '';
    if (productDialogTrigger && document.contains(productDialogTrigger)) productDialogTrigger.focus();
    productDialogTrigger = null;
  }

  function ensureImageLightbox() {
    if (lightbox) return lightbox;
    const overlay = node('div', 'image-lightbox');
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Visualização ampliada da imagem');

    const stage = node('div', 'image-lightbox-stage');
    const image = document.createElement('img');
    image.alt = '';
    stage.appendChild(image);
    stage.addEventListener('click', (event) => { if (event.target === stage) closeImageLightbox(); });

    const close = node('button', 'image-lightbox-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Fechar imagem');
    close.addEventListener('click', closeImageLightbox);

    const previous = node('button', 'image-lightbox-nav previous', '‹');
    previous.type = 'button';
    previous.setAttribute('aria-label', 'Imagem anterior');
    previous.addEventListener('click', () => showLightboxImage(lightboxIndex - 1));

    const next = node('button', 'image-lightbox-nav next', '›');
    next.type = 'button';
    next.setAttribute('aria-label', 'Próxima imagem');
    next.addEventListener('click', () => showLightboxImage(lightboxIndex + 1));

    const toolbar = node('div', 'image-lightbox-toolbar');
    const zoomOut = node('button', '', '−');
    zoomOut.type = 'button';
    zoomOut.setAttribute('aria-label', 'Diminuir zoom');
    zoomOut.addEventListener('click', () => setLightboxZoom(lightboxZoom - .25));
    const reset = node('button', '', '100%');
    reset.type = 'button';
    reset.className = 'image-lightbox-zoom-label';
    reset.setAttribute('aria-label', 'Restaurar zoom');
    reset.addEventListener('click', () => setLightboxZoom(1));
    const zoomIn = node('button', '', '+');
    zoomIn.type = 'button';
    zoomIn.setAttribute('aria-label', 'Aumentar zoom');
    zoomIn.addEventListener('click', () => setLightboxZoom(lightboxZoom + .25));
    const counter = node('span', 'image-lightbox-counter', '');
    toolbar.append(zoomOut, reset, zoomIn, counter);

    overlay.append(stage, close, previous, next, toolbar);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeImageLightbox(); });
    document.body.appendChild(overlay);
    lightbox = { overlay, stage, image, close, previous, next, reset, counter };
    return lightbox;
  }

  function openImageLightbox(images, index, productName) {
    if (!Array.isArray(images) || !images.length) return;
    const viewer = ensureImageLightbox();
    lightboxImages = images;
    lightboxIndex = Math.max(0, Math.min(index || 0, images.length - 1));
    viewer.image.alt = productName || 'Imagem da solução';
    viewer.overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    showLightboxImage(lightboxIndex);
    viewer.close.focus();
  }

  function showLightboxImage(index) {
    if (!lightbox || !lightboxImages.length) return;
    lightboxIndex = (index + lightboxImages.length) % lightboxImages.length;
    lightbox.image.src = lightboxImages[lightboxIndex];
    lightbox.counter.textContent = (lightboxIndex + 1) + ' / ' + lightboxImages.length;
    lightbox.previous.hidden = lightboxImages.length < 2;
    lightbox.next.hidden = lightboxImages.length < 2;
    setLightboxZoom(1);
  }

  function setLightboxZoom(value) {
    if (!lightbox) return;
    lightboxZoom = Math.max(.5, Math.min(value, 3));
    lightbox.image.style.transform = 'scale(' + lightboxZoom + ')';
    lightbox.reset.textContent = Math.round(lightboxZoom * 100) + '%';
    lightbox.stage.classList.toggle('zoomed', lightboxZoom > 1);
  }

  function closeImageLightbox() {
    if (!lightbox) return;
    lightbox.overlay.hidden = true;
    lightbox.image.removeAttribute('src');
    lightboxImages = [];
    if (dialog.hidden) document.body.style.overflow = '';
  }

  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeProduct(); });
  document.addEventListener('keydown', (event) => {
    if (lightbox && !lightbox.overlay.hidden) {
      if (event.key === 'Escape') closeImageLightbox();
      if (event.key === 'ArrowLeft' && lightboxImages.length > 1) showLightboxImage(lightboxIndex - 1);
      if (event.key === 'ArrowRight' && lightboxImages.length > 1) showLightboxImage(lightboxIndex + 1);
      return;
    }
    if (event.key === 'Escape' && !dialog.hidden) closeProduct();
  });
  search.addEventListener('input', renderProducts);
  window.addEventListener('resize', updateMobileScrollWindow, { passive: true });

  fetch('/api/public-catalog/' + encodeURIComponent(slug), { credentials: 'omit' })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('Catálogo não encontrado.')))
    .then((data) => {
      products = Array.isArray(data.products) ? data.products : [];
      renderFilters();
      renderProducts();
    })
    .catch((error) => {
      grid.innerHTML = '';
      count.textContent = '';
      grid.appendChild(node('div', 'catalog-state', error.message));
    });
})();
