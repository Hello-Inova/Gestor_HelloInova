(function () {
  'use strict';

  const grid = document.getElementById('public-grid');
  const search = document.getElementById('public-search');
  const filters = document.getElementById('public-niches');
  const count = document.getElementById('public-count');
  const slug = location.pathname.split('/').filter(Boolean).pop();
  let systems = [];
  let activeNiche = '';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cardObserver = !reduceMotion && 'IntersectionObserver' in window
    ? new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.12 })
    : null;

  function normalizedUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '#';
    return /^https?:\/\//i.test(url) ? url : 'https://' + url;
  }

  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function card(system) {
    const article = node('article', 'site-card');
    const visual = node('div', 'site-visual');
    if (system.logo) {
      const image = document.createElement('img');
      image.src = system.logo;
      image.alt = '';
      visual.appendChild(image);
    } else {
      visual.appendChild(node('span', 'site-fallback', (system.name || '?').charAt(0).toUpperCase()));
    }
    const content = node('div', 'site-content');
    content.appendChild(node('div', 'site-niche', system.niche || 'Projeto digital'));
    content.appendChild(node('h2', '', system.name));
    content.appendChild(node('p', 'site-description', system.specifications || 'Conheça este projeto desenvolvido pela Hello Inova.'));
    const badges = node('div', 'site-badges');
    (system.categories || []).forEach((category) => badges.appendChild(node('span', '', category)));
    content.appendChild(badges);
    const link = node('a', 'site-link', 'Visitar projeto ↗');
    link.href = normalizedUrl(system.url);
    link.target = '_blank';
    link.rel = 'noopener';
    content.appendChild(link);
    article.append(visual, content);
    return article;
  }

  function render() {
    const term = search.value.trim().toLowerCase();
    const visible = systems.filter((system) => {
      const haystack = [system.name, system.url, system.niche, system.specifications, ...(system.categories || [])].join(' ').toLowerCase();
      return (!term || haystack.includes(term)) && (!activeNiche || system.niche === activeNiche);
    });
    grid.innerHTML = '';
    count.textContent = visible.length + (visible.length === 1 ? ' projeto encontrado' : ' projetos encontrados');
    if (!visible.length) {
      grid.appendChild(node('div', 'public-state', systems.length ? 'Nenhum projeto corresponde à pesquisa.' : 'Novos projetos serão publicados aqui em breve.'));
      return;
    }
    visible.forEach((system) => {
      const item = card(system);
      grid.appendChild(item);
      if (cardObserver) cardObserver.observe(item);
      else item.classList.add('is-visible');
    });
  }

  function renderFilters(niches) {
    filters.innerHTML = '';
    if (!niches.length) return;
    const all = node('button', 'active', 'Todos');
    all.type = 'button';
    all.addEventListener('click', () => selectNiche('', all));
    filters.appendChild(all);
    niches.forEach((niche) => {
      const button = node('button', '', niche);
      button.type = 'button';
      button.addEventListener('click', () => selectNiche(niche, button));
      filters.appendChild(button);
    });
  }

  function selectNiche(niche, button) {
    activeNiche = niche;
    filters.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
    render();
  }

  search.addEventListener('input', render);
  fetch('/api/public-sites/' + encodeURIComponent(slug))
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar esta página.');
      return data;
    })
    .then((data) => {
      systems = data.systems || [];
      renderFilters(data.niches || []);
      render();
    })
    .catch((error) => {
      grid.innerHTML = '';
      grid.appendChild(node('div', 'public-state error', error.message));
      count.textContent = '';
    });
})();
