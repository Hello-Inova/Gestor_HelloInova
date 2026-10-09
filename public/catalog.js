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
    const imageWrap = node('div', 'catalog-card-image');
    if (product.images && product.images.length) {
      const image = document.createElement('img');
      image.src = product.images[0];
      image.alt = product.name;
      image.loading = 'lazy';
      imageWrap.appendChild(image);
      if (product.images.length > 1) imageWrap.appendChild(node('span', 'catalog-card-image-count', product.images.length + ' imagens'));
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
    const button = node('button', 'catalog-details-button', 'Ver detalhes');
    button.type = 'button';
    button.addEventListener('click', () => openProduct(product));
    footer.append(price, button);
    body.appendChild(footer);
    card.append(imageWrap, body);
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
      return;
    }
    visible.forEach((product) => grid.appendChild(buildCard(product)));
  }

  function openProduct(product) {
    dialog.innerHTML = '';
    const card = node('div', 'product-dialog-card');
    const close = node('button', 'dialog-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Fechar');
    close.addEventListener('click', closeProduct);
    card.appendChild(close);

    const gallery = node('div', 'dialog-gallery');
    const main = node('div', 'dialog-main-image');
    const images = product.images || [];
    const mainImage = document.createElement('img');
    if (images.length) {
      mainImage.src = images[0];
      mainImage.alt = product.name;
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
    content.appendChild(node('h2', '', product.name));
    if (product.summary) content.appendChild(node('p', 'dialog-summary', product.summary));
    if (product.details) content.appendChild(node('div', 'dialog-details', product.details));
    const price = node('div', 'dialog-price', priceLabel(product));
    if (product.price_details) price.appendChild(node('small', '', product.price_details));
    content.appendChild(price);
    const contact = node('a', 'dialog-cta', 'Quero saber mais ↗');
    contact.href = '/captacao';
    content.appendChild(contact);
    card.append(gallery, content);
    dialog.appendChild(card);
    dialog.hidden = false;
    document.body.style.overflow = 'hidden';
    close.focus();
  }

  function closeProduct() {
    dialog.hidden = true;
    dialog.innerHTML = '';
    document.body.style.overflow = '';
  }

  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeProduct(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !dialog.hidden) closeProduct(); });
  search.addEventListener('input', renderProducts);

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
