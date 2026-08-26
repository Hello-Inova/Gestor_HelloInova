/* ============================================================
   Hello Inova · Gestor de Sistemas — Front-end (vanilla JS SPA)
   ============================================================ */

(function () {
  'use strict';

  const $app = document.getElementById('app');

  const state = {
    user: null,
    pages: [],
    systems: null,
    selectedPageId: null,
    selectedElementId: null,
    sidebarTab: 'pages', // 'pages' | 'props'
    mode: 'edit', // 'edit' | 'preview'
    authView: 'login', // 'login' | 'register'
    sidebarOpen: false,
    booted: false,
    systemModal: null, // { mode: 'create'|'edit', system?: {...} }
    profileModal: false,
    viewModal: null, // sistema sendo visualizado no pop-up de detalhes
    systemsSearch: '',
    systemsFilterCategories: [],
  };

  const SYSTEM_CATEGORIES = ['Web Site', 'Landing Page', 'Catálogo Digital', 'ERP', 'SAAS', 'Holding H.I'];

  // ---------------- API helper ----------------
  async function api(path, opts) {
    opts = opts || {};
    const res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* sem corpo */ }
    if (!res.ok) throw new Error(data.error || 'Erro na requisição.');
    return data;
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach((k) => {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== undefined && attrs[k] !== null) node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach((c) => {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function icon(name) {
    const paths = {
      plus: '<path d="M12 5v14M5 12h14"/>',
      edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
      trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
      up: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
      down: '<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>',
      menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
      close: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
      logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
      type: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
      input: '<rect x="3" y="8" width="18" height="8" rx="2"/><path d="M7 12h.01"/>',
      button: '<rect x="3" y="8" width="18" height="8" rx="4"/>',
      layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
      sliders: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/>',
      launch: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>',
      server: '<rect x="2" y="3" width="20" height="7" rx="2"/><rect x="2" y="14" width="20" height="7" rx="2"/><path d="M6 6.5h.01"/><path d="M6 17.5h.01"/>',
      info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
      eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/>',
      eyeOff: '<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a17.4 17.4 0 0 1-3.35 4.5"/><path d="M6.1 6.1C3.5 7.9 1 12 1 12s4 8 11 8a9.4 9.4 0 0 0 4.9-1.4"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/>',
      upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
      image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
      user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
      mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
      whatsapp: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    };
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
  }

  let toastTimer = null;
  function toast(msg, isError) {
    let t = document.getElementById('hi-toast');
    if (!t) {
      t = el('div', { id: 'hi-toast', class: 'toast' }, []);
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function formatCurrencyBRL(value) {
    if (value === null || value === undefined || value === '') return '';
    const num = Number(value);
    if (isNaN(num)) return '';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatDateBR(iso) {
    if (!iso) return '';
    const parts = String(iso).slice(0, 10).split('-');
    if (parts.length !== 3) return iso;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  function normalizedUrl(url) {
    let u = (url || '').trim();
    if (!u) return '#';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u;
  }

  function debounce(fn, ms) {
    let timers = {};
    return function (key, ...args) {
      clearTimeout(timers[key]);
      timers[key] = setTimeout(() => fn(...args), ms);
    };
  }

  // ---------------- Boot ----------------
  async function boot() {
    try {
      const { user } = await api('/auth/me');
      state.user = user;
      await Promise.all([loadPages(), loadSystems()]);
    } catch (e) {
      state.user = null;
    }
    state.booted = true;
    render();
  }

  async function loadPages() {
    const { pages } = await api('/pages');
    state.pages = pages;
    if (!state.selectedPageId && pages.length) state.selectedPageId = pages[0].id;
    if (state.selectedPageId && !pages.find((p) => p.id === state.selectedPageId)) {
      state.selectedPageId = pages.length ? pages[0].id : null;
    }
  }

  async function loadSystems() {
    try {
      const { systems } = await api('/systems');
      state.systems = systems;
    } catch (err) {
      state.systems = state.systems || [];
    }
  }

  function currentPage() {
    return state.pages.find((p) => p.id === state.selectedPageId) || null;
  }

  function currentElement() {
    const page = currentPage();
    if (!page) return null;
    return page.elements.find((e) => e.id === state.selectedElementId) || null;
  }

  // ---------------- Render dispatcher ----------------
  function render() {
    $app.innerHTML = '';
    if (!state.booted) {
      $app.appendChild(el('div', { class: 'boot-loader' }, [el('img', { src: '/assets/logo-mark.png', class: 'boot-logo' })]));
      return;
    }
    if (!state.user) {
      $app.appendChild(renderAuthScreen());
    } else {
      $app.appendChild(renderAppShell());
      if (state.systemModal) $app.appendChild(buildSystemModal());
      if (state.profileModal) $app.appendChild(buildProfileModal());
      if (state.viewModal) $app.appendChild(buildViewModal());
    }
  }

  // ================================================================
  // TELA DE AUTENTICAÇÃO
  // ================================================================
  function renderAuthScreen() {
    const isLogin = state.authView === 'login';

    const brand = el('div', { class: 'auth-brand' }, [
      el('img', { class: 'brand-mark', src: '/assets/logo-mark.png', alt: 'Hello Inova' }),
      el('div', { class: 'brand-wordmark' }, ['Hello', el('span', {}, ['Inova'])]),
      el('div', { class: 'brand-tagline' }, ['Da mente às telas']),
      el('div', { class: 'brand-pitch' }, [
        'Gerencie, em um só lugar, todos os sistemas administrados pela Hello Inova: crie páginas, monte telas e organize seus painéis com liberdade total.',
      ]),
    ]);

    let errorBox = null;
    let submitBtn = null;

    const nameField = el('div', { class: 'field' }, [
      el('label', {}, ['Nome completo']),
      el('input', { type: 'text', id: 'f-name', placeholder: 'Seu nome', autocomplete: 'name' }),
    ]);
    const emailField = el('div', { class: 'field' }, [
      el('label', {}, ['E-mail']),
      el('input', { type: 'email', id: 'f-email', placeholder: 'voce@helloinova.com.br', autocomplete: 'email' }),
    ]);
    const passField = el('div', { class: 'field' }, [
      el('label', {}, ['Senha']),
      el('input', { type: 'password', id: 'f-pass', placeholder: '••••••••', autocomplete: isLogin ? 'current-password' : 'new-password' }),
    ]);

    const form = el('form', {
      onsubmit: async (ev) => {
        ev.preventDefault();
        if (errorBox) errorBox.remove();
        const email = document.getElementById('f-email').value.trim();
        const password = document.getElementById('f-pass').value;
        const name = document.getElementById('f-name') ? document.getElementById('f-name').value.trim() : '';

        submitBtn.disabled = true;
        submitBtn.textContent = isLogin ? 'Entrando…' : 'Criando conta…';
        try {
          if (isLogin) {
            const { user } = await api('/auth/login', { method: 'POST', body: { email, password } });
            state.user = user;
          } else {
            const { user } = await api('/auth/register', { method: 'POST', body: { name, email, password } });
            state.user = user;
          }
          await Promise.all([loadPages(), loadSystems()]);
          render();
        } catch (err) {
          submitBtn.disabled = false;
          submitBtn.textContent = isLogin ? 'Entrar' : 'Criar conta';
          const box = el('div', { class: 'auth-error' }, [err.message]);
          form.insertBefore(box, form.firstChild);
          errorBox = box;
        }
      },
    }, [
      isLogin ? null : nameField,
      emailField,
      passField,
    ]);

    submitBtn = el('button', { type: 'submit', class: 'btn btn-primary btn-block' }, [isLogin ? 'Entrar' : 'Criar conta']);
    form.appendChild(submitBtn);

    const card = el('div', { class: 'auth-card' }, [
      el('h1', {}, [isLogin ? 'Acesse sua conta' : 'Crie sua conta']),
      el('p', { class: 'sub' }, [isLogin ? 'Entre com as credenciais cadastradas para gerenciar os sistemas Hello Inova.' : 'Cadastre-se para começar a montar seus painéis.']),
      form,
      el('div', { class: 'auth-switch' }, [
        isLogin ? 'Ainda não tem conta? ' : 'Já tem uma conta? ',
        el('button', {
          onclick: () => { state.authView = isLogin ? 'register' : 'login'; render(); },
        }, [isLogin ? 'Cadastre-se' : 'Entrar']),
      ]),
    ]);

    return el('div', { class: 'auth-screen' }, [brand, el('div', { class: 'auth-form-wrap' }, [card])]);
  }

  // ================================================================
  // SHELL PRINCIPAL (app logada)
  // ================================================================
  function renderAppShell() {
    const shell = el('div', { class: 'shell' });

    const topbar = el('div', { class: 'topbar' }, [
      el('div', { class: 'brand-mini' }, [
        el('img', { src: '/assets/logo-mark.png' }),
        el('div', { class: 'wm' }, ['Hello', el('span', {}, ['Inova'])]),
      ]),
      el('button', {
        class: 'btn btn-ghost btn-icon menu-toggle-btn',
        style: 'display:inline-flex',
        onclick: () => { state.sidebarOpen = true; render(); },
        html: icon('menu'),
      }),
    ]);

    const backdrop = el('div', {
      class: 'backdrop' + (state.sidebarOpen ? ' show' : ''),
      onclick: () => { state.sidebarOpen = false; render(); },
    });

    const sidebar = buildSidebar();
    const main = buildMain();

    shell.appendChild(sidebar);
    shell.appendChild(main);
    shell.appendChild(backdrop);

    const wrap = el('div', {}, [topbar, shell]);
    return wrap;
  }

  // ---------------- Sidebar direita ----------------
  function buildSidebar() {
    const sidebar = el('div', { class: 'sidebar' + (state.sidebarOpen ? ' open' : '') });

    const header = el('div', { class: 'sidebar-header' }, [
      el('img', { src: '/assets/logo-mark.png' }),
      el('div', {}, [
        el('div', { class: 'wm' }, ['Hello', el('span', {}, ['Inova'])]),
        el('div', { class: 'tag' }, ['Gestor de sistemas']),
      ]),
      el('button', {
        class: 'btn btn-ghost btn-icon',
        style: 'margin-left:auto;display:none',
        id: 'sidebar-close-btn',
        onclick: () => { state.sidebarOpen = false; render(); },
        html: icon('close'),
      }),
    ]);
    // mostra o botão de fechar apenas em telas pequenas via CSS controlado por classe do topbar; usamos JS simples:
    if (window.matchMedia('(max-width: 960px)').matches) {
      header.querySelector('#sidebar-close-btn').style.display = 'inline-flex';
    }

    const tabs = el('div', { class: 'sidebar-tabs' }, [
      el('button', {
        class: 'sidebar-tab' + (state.sidebarTab === 'pages' ? ' active' : ''),
        onclick: () => { state.sidebarTab = 'pages'; render(); },
      }, ['Módulos']),
      el('button', {
        class: 'sidebar-tab' + (state.sidebarTab === 'props' ? ' active' : ''),
        disabled: !state.selectedElementId,
        onclick: () => { if (state.selectedElementId) { state.sidebarTab = 'props'; render(); } },
      }, ['Elemento']),
    ]);

    const body = el('div', { class: 'sidebar-body' });
    if (state.sidebarTab === 'pages') {
      body.appendChild(buildPageList());
    } else {
      body.appendChild(buildPropsPanel());
    }

    const footer = el('div', { class: 'sidebar-footer' }, [
      el('button', {
        class: 'profile-trigger',
        title: 'Ver perfil',
        onclick: () => { state.profileModal = true; render(); },
      }, [
        el('div', { class: 'user-avatar' }, [(state.user.name || '?').trim().charAt(0).toUpperCase()]),
        el('div', { class: 'user-meta' }, [
          el('div', { class: 'u-name' }, [state.user.name]),
          el('div', { class: 'u-email' }, [state.user.email]),
        ]),
      ]),
      el('button', {
        class: 'btn btn-ghost btn-icon',
        title: 'Sair',
        onclick: async () => {
          await api('/auth/logout', { method: 'POST' }).catch(() => {});
          state.user = null;
          state.pages = [];
          state.selectedPageId = null;
          state.selectedElementId = null;
          render();
        },
        html: icon('logout'),
      }),
    ]);

    sidebar.appendChild(header);
    sidebar.appendChild(tabs);
    sidebar.appendChild(body);
    sidebar.appendChild(footer);
    return sidebar;
  }

  function buildPageList() {
    const wrap = el('div', {});
    const list = el('ul', { class: 'page-list' });

    state.pages.forEach((page, idx) => {
      const isActive = page.id === state.selectedPageId;
      const nameInput = el('input', {
        class: 'name-input',
        value: page.name,
        readonly: true,
        title: 'Clique duas vezes para editar o nome',
      });

      nameInput.addEventListener('dblclick', () => {
        nameInput.removeAttribute('readonly');
        nameInput.classList.add('editing');
        nameInput.focus();
        nameInput.select();
      });

      async function commitName() {
        nameInput.setAttribute('readonly', 'true');
        nameInput.classList.remove('editing');
        const newName = nameInput.value.trim() || page.name;
        nameInput.value = newName;
        if (newName !== page.name) {
          page.name = newName;
          try {
            await api('/pages/' + page.id, { method: 'PUT', body: { name: newName } });
            toast('Nome do módulo atualizado.');
          } catch (err) {
            toast(err.message, true);
          }
        }
      }

      nameInput.addEventListener('blur', commitName);
      nameInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); nameInput.blur(); }
        if (ev.key === 'Escape') { nameInput.value = page.name; nameInput.blur(); }
      });

      const item = el('li', {
        class: 'page-item' + (isActive ? ' active' : ''),
        onclick: (ev) => {
          if (ev.target === nameInput) return;
          state.selectedPageId = page.id;
          state.selectedElementId = null;
          state.sidebarTab = 'pages';
          state.sidebarOpen = false;
          render();
        },
      }, [
        el('span', { class: 'dot' }),
        nameInput,
        el('div', { class: 'row-actions' }, [
          el('button', {
            class: 'icon-btn', title: 'Mover para cima',
            onclick: async (ev) => { ev.stopPropagation(); await movePage(page.id, -1); },
            html: icon('up'),
          }),
          el('button', {
            class: 'icon-btn', title: 'Mover para baixo',
            onclick: async (ev) => { ev.stopPropagation(); await movePage(page.id, 1); },
            html: icon('down'),
          }),
          el('button', {
            class: 'icon-btn', title: 'Renomear',
            onclick: (ev) => { ev.stopPropagation(); nameInput.removeAttribute('readonly'); nameInput.classList.add('editing'); nameInput.focus(); nameInput.select(); },
            html: icon('edit'),
          }),
          el('button', {
            class: 'icon-btn danger', title: 'Excluir módulo',
            onclick: async (ev) => {
              ev.stopPropagation();
              if (state.pages.length <= 1) { toast('É necessário manter ao menos um módulo.', true); return; }
              const warn = page.type === 'systems'
                ? 'Excluir o módulo "' + page.name + '"? Os sistemas cadastrados nele continuam salvos, mas o módulo não volta sozinho — você pode recriar um novo módulo quando quiser.'
                : 'Excluir o módulo "' + page.name + '"? Todos os elementos dele serão perdidos.';
              if (!confirm(warn)) return;
              try {
                await api('/pages/' + page.id, { method: 'DELETE' });
                await loadPages();
                state.selectedElementId = null;
                render();
              } catch (err) { toast(err.message, true); }
            },
            html: icon('trash'),
          }),
        ]),
      ]);

      list.appendChild(item);
    });

    wrap.appendChild(list);

    wrap.appendChild(el('button', {
      class: 'btn btn-ghost btn-block new-page-btn',
      onclick: async () => {
        const name = prompt('Nome do novo módulo:', 'Novo módulo');
        if (!name || !name.trim()) return;
        try {
          const { page } = await api('/pages', { method: 'POST', body: { name: name.trim() } });
          await loadPages();
          state.selectedPageId = page.id;
          render();
        } catch (err) { toast(err.message, true); }
      },
    }, [el('span', { html: icon('plus') }), ' Novo módulo']));

    return wrap;
  }

  async function movePage(pageId, dir) {
    const idx = state.pages.findIndex((p) => p.id === pageId);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= state.pages.length) return;
    const arr = state.pages.slice();
    const tmp = arr[idx]; arr[idx] = arr[swapIdx]; arr[swapIdx] = tmp;
    state.pages = arr;
    try {
      await api('/pages', { method: 'PUT', body: { order: arr.map((p) => p.id) } });
    } catch (err) { toast(err.message, true); }
    render();
  }

  // ---------------- Painel de propriedades ----------------
  function buildPropsPanel() {
    const wrap = el('div', {});
    const elData = currentElement();
    if (!elData) {
      wrap.appendChild(el('div', { class: 'props-empty' }, ['Selecione um elemento no canvas para editar suas propriedades.']));
      return wrap;
    }

    wrap.appendChild(el('div', { class: 'props-title' }, [labelForType(elData.type) + ' selecionado']));

    const persist = debounce(async (id, patch) => {
      try { await api('/pages/elements/' + id, { method: 'PUT', body: patch }); }
      catch (err) { toast(err.message, true); }
    }, 350);

    function updateLocal(patch) {
      Object.assign(elData, patch);
      const domEl = document.querySelector('.el[data-id="' + elData.id + '"]');
      if (domEl) applyElementStyle(domEl, elData);
      persist('el-' + elData.id, patch);
    }

    // Conteúdo
    if (elData.type !== 'input') {
      const group = el('div', { class: 'prop-group' }, [
        el('label', {}, ['Texto']),
        el('textarea', {
          oninput: (ev) => updateLocal({ content: ev.target.value }),
        }, [elData.content || '']),
      ]);
      wrap.appendChild(group);
    } else {
      wrap.appendChild(el('div', { class: 'prop-group' }, [
        el('label', {}, ['Rótulo (opcional)']),
        el('input', { type: 'text', value: elData.content || '', oninput: (ev) => updateLocal({ content: ev.target.value }) }),
      ]));
      wrap.appendChild(el('div', { class: 'prop-group' }, [
        el('label', {}, ['Texto de exemplo (placeholder)']),
        el('input', { type: 'text', value: elData.placeholder || '', oninput: (ev) => updateLocal({ placeholder: ev.target.value }) }),
      ]));
    }

    // Cor da fonte
    wrap.appendChild(el('div', { class: 'prop-group' }, [
      el('label', {}, ['Cor da fonte']),
      el('div', { class: 'color-row' }, [
        el('input', { type: 'color', value: elData.font_color, oninput: (ev) => updateLocal({ font_color: ev.target.value }) }),
        el('span', {}, [elData.font_color]),
      ]),
    ]));

    // Cor de fundo (input/button)
    if (elData.type !== 'label') {
      wrap.appendChild(el('div', { class: 'prop-group' }, [
        el('label', {}, ['Cor de fundo']),
        el('div', { class: 'color-row' }, [
          el('input', { type: 'color', value: elData.bg_color, oninput: (ev) => updateLocal({ bg_color: ev.target.value }) }),
          el('span', {}, [elData.bg_color]),
        ]),
      ]));
    } else {
      wrap.appendChild(el('div', { class: 'prop-group' }, [
        el('label', {}, ['Cor de destaque (opcional)']),
        el('div', { class: 'color-row' }, [
          el('input', { type: 'color', value: elData.bg_color, oninput: (ev) => updateLocal({ bg_color: ev.target.value }) }),
          el('span', {}, [elData.bg_color]),
        ]),
      ]));
    }

    // Tamanho da fonte
    const fsRow = el('div', { class: 'range-row' }, [
      el('input', { type: 'range', min: '10', max: '48', value: elData.font_size, oninput: (ev) => { fsVal.textContent = ev.target.value + 'px'; updateLocal({ font_size: Number(ev.target.value) }); } }),
      el('span', { class: 'val' }, [elData.font_size + 'px']),
    ]);
    const fsVal = fsRow.querySelector('.val');
    wrap.appendChild(el('div', { class: 'prop-group' }, [el('label', {}, ['Tamanho da fonte']), fsRow]));

    // Peso da fonte
    const weights = [['400', 'Normal'], ['600', 'Médio'], ['700', 'Negrito']];
    const weightRow = el('div', { class: 'select-weight' }, weights.map(([val, lbl]) =>
      el('button', {
        class: elData.font_weight === val ? 'active' : '',
        type: 'button',
        onclick: (ev) => {
          weightRow.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
          ev.target.classList.add('active');
          updateLocal({ font_weight: val });
        },
      }, [lbl])
    ));
    wrap.appendChild(el('div', { class: 'prop-group' }, [el('label', {}, ['Peso da fonte']), weightRow]));

    // Raio da borda (input/button)
    if (elData.type !== 'label') {
      const brRow = el('div', { class: 'range-row' }, [
        el('input', { type: 'range', min: '0', max: '40', value: elData.border_radius, oninput: (ev) => { brVal.textContent = ev.target.value + 'px'; updateLocal({ border_radius: Number(ev.target.value) }); } }),
        el('span', { class: 'val' }, [elData.border_radius + 'px']),
      ]);
      const brVal = brRow.querySelector('.val');
      wrap.appendChild(el('div', { class: 'prop-group' }, [el('label', {}, ['Arredondamento']), brRow]));
    }

    // Posição e tamanho (%)
    wrap.appendChild(el('div', { class: 'prop-group' }, [
      el('label', {}, ['Posição e tamanho (%)']),
      el('div', { class: 'prop-row' }, [
        el('div', { class: 'field-half' }, [
          el('label', {}, ['X']),
          el('input', { type: 'number', step: '0.5', value: round1(elData.x), oninput: (ev) => updateLocal({ x: clamp(Number(ev.target.value), 0, 98) }) }),
        ]),
        el('div', { class: 'field-half' }, [
          el('label', {}, ['Y']),
          el('input', { type: 'number', step: '0.5', value: round1(elData.y), oninput: (ev) => updateLocal({ y: clamp(Number(ev.target.value), 0, 98) }) }),
        ]),
      ]),
      el('div', { class: 'prop-row', style: 'margin-top:8px' }, [
        el('div', { class: 'field-half' }, [
          el('label', {}, ['Largura']),
          el('input', { type: 'number', step: '0.5', value: round1(elData.width), oninput: (ev) => updateLocal({ width: clamp(Number(ev.target.value), 3, 100) }) }),
        ]),
        el('div', { class: 'field-half' }, [
          el('label', {}, ['Altura']),
          el('input', { type: 'number', step: '0.5', value: round1(elData.height), oninput: (ev) => updateLocal({ height: clamp(Number(ev.target.value), 3, 100) }) }),
        ]),
      ]),
    ]));

    wrap.appendChild(el('div', { class: 'props-footer' }, [
      el('button', {
        class: 'btn btn-danger btn-block',
        onclick: async () => {
          if (!confirm('Excluir este elemento?')) return;
          try {
            await api('/pages/elements/' + elData.id, { method: 'DELETE' });
            const page = currentPage();
            page.elements = page.elements.filter((e) => e.id !== elData.id);
            state.selectedElementId = null;
            state.sidebarTab = 'pages';
            render();
          } catch (err) { toast(err.message, true); }
        },
      }, [el('span', { html: icon('trash') }), ' Excluir elemento']),
    ]));

    return wrap;
  }

  function labelForType(type) {
    return { label: 'Texto', input: 'Campo de entrada', button: 'Botão' }[type] || type;
  }
  function round1(n) { return Math.round(n * 10) / 10; }
  function clamp(n, min, max) { if (isNaN(n)) return min; return Math.min(max, Math.max(min, n)); }

  // ---------------- Área principal ----------------
  function buildMain() {
    const main = el('div', { class: 'main' });
    const page = currentPage();
    const isSystems = page && page.type === 'systems';

    const header = el('div', { class: 'main-header' }, [
      el('div', { class: 'page-title-wrap' }, [
        el('h2', {}, [page ? page.name : 'Nenhum módulo']),
      ]),
      isSystems ? el('div', { class: 'toolbox' }, [
        el('button', {
          class: 'btn btn-primary btn-sm',
          onclick: () => openSystemModal('create'),
        }, [el('span', { html: icon('plus') }), ' Novo Sistema']),
      ]) : el('div', { class: 'toolbox' }, [
        toolboxBtn('type', 'Texto', () => addElement('label')),
        toolboxBtn('input', 'Campo', () => addElement('input')),
        toolboxBtn('button', 'Botão', () => addElement('button')),
        el('span', { class: 'sep' }),
        el('div', { class: 'mode-toggle' }, [
          el('button', { class: state.mode === 'edit' ? 'active' : '', onclick: () => { state.mode = 'edit'; render(); } }, ['Editar']),
          el('button', { class: state.mode === 'preview' ? 'active' : '', onclick: () => { state.mode = 'preview'; state.selectedElementId = null; render(); } }, ['Visualizar']),
        ]),
      ]),
    ]);

    main.appendChild(header);

    if (isSystems) {
      main.appendChild(buildSystemsManager());
      return main;
    }

    const canvasScroll = el('div', { class: 'canvas-scroll' });
    const canvas = el('div', { class: 'canvas' + (state.mode === 'preview' ? ' locked' : ''), id: 'hi-canvas' });

    if (!page) {
      canvas.appendChild(el('div', { class: 'canvas-empty' }, ['Crie um módulo para começar.']));
    } else if (!page.elements.length) {
      canvas.appendChild(el('div', { class: 'canvas-empty' }, [
        el('span', { html: icon('layers') }),
        el('div', {}, ['Este módulo ainda não tem elementos.']),
        el('div', {}, ['Use os botões acima para adicionar texto, campos e botões.']),
      ]));
    } else {
      page.elements.forEach((elData) => canvas.appendChild(buildCanvasElement(elData)));
    }

    canvasScroll.appendChild(canvas);
    main.appendChild(canvasScroll);
    return main;
  }

  // ---------------- Gestor de Sistemas (módulo especial) ----------------
  function launchSystem(url, email, password) {
    let fullUrl = (url || '').trim();
    if (!fullUrl) { toast('Informe o link de acesso ao sistema.', true); return; }
    if (!/^https?:\/\//i.test(fullUrl)) fullUrl = 'https://' + fullUrl;

    window.open(fullUrl, '_blank', 'noopener');

    if (password && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(password).catch(() => {});
      toast('Sistema aberto em nova aba. Senha copiada — cole no campo de login (Ctrl+V).' + (email ? ' E-mail: ' + email : ''));
    } else if (email) {
      toast('Sistema aberto em nova aba. E-mail de acesso: ' + email);
    } else {
      toast('Sistema aberto em nova aba.');
    }
  }

  function buildSystemsManager() {
    const wrap = el('div', { class: 'canvas-scroll' });
    const inner = el('div', { class: 'sysmgr' });

    const listCard = el('div', { class: 'sysmgr-card grow' });

    listCard.appendChild(el('div', { class: 'sysmgr-header-row' }, [
      el('div', { class: 'htext' }, [
        el('h3', {}, [el('span', { html: icon('server') }), ' Sistemas cadastrados']),
        el('p', { class: 'sysmgr-sub' }, ['Reabra qualquer sistema já cadastrado com um clique.']),
      ]),
    ]));

    // ---- Pesquisa ----
    const searchInput = el('input', {
      type: 'search',
      class: 'sysmgr-search-input',
      placeholder: 'Pesquisar por nome, link ou e-mail…',
      value: state.systemsSearch || '',
    });
    searchInput.addEventListener('input', () => {
      state.systemsSearch = searchInput.value;
      refreshList();
    });
    listCard.appendChild(el('div', { class: 'sysmgr-search' }, [
      el('span', { class: 'search-icon', html: icon('search') }),
      searchInput,
    ]));

    // ---- Filtros por tipo de sistema ----
    const filterBar = el('div', { class: 'sysmgr-filters' });
    SYSTEM_CATEGORIES.forEach((cat) => {
      const active = state.systemsFilterCategories.includes(cat);
      const chip = el('button', { type: 'button', class: 'filter-chip' + (active ? ' active' : '') }, [cat]);
      chip.addEventListener('click', () => {
        const idx = state.systemsFilterCategories.indexOf(cat);
        if (idx >= 0) state.systemsFilterCategories.splice(idx, 1);
        else state.systemsFilterCategories.push(cat);
        render();
      });
      filterBar.appendChild(chip);
    });
    if (state.systemsFilterCategories.length) {
      const clearBtn = el('button', { type: 'button', class: 'filter-chip clear' }, ['Limpar filtros']);
      clearBtn.addEventListener('click', () => { state.systemsFilterCategories = []; render(); });
      filterBar.appendChild(clearBtn);
    }
    listCard.appendChild(filterBar);

    const listBody = el('div', { class: 'sysmgr-list' });
    listCard.appendChild(listBody);

    function applyFilters() {
      const all = state.systems || [];
      const term = (state.systemsSearch || '').trim().toLowerCase();
      const cats = state.systemsFilterCategories;
      return all.filter((sys) => {
        if (term) {
          const hay = [sys.name, sys.url, sys.login_email].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(term)) return false;
        }
        if (cats.length) {
          const sysCats = sys.categories || [];
          if (!cats.some((c) => sysCats.includes(c))) return false;
        }
        return true;
      });
    }

    function refreshList() {
      listBody.innerHTML = '';
      const all = state.systems || [];
      const filtered = applyFilters();
      if (!all.length) {
        listBody.appendChild(el('div', { class: 'sysmgr-empty' }, [
          'Nenhum sistema cadastrado ainda. Clique em "Novo Sistema", no topo da página, para adicionar o primeiro.',
        ]));
      } else if (!filtered.length) {
        listBody.appendChild(el('div', { class: 'sysmgr-empty' }, [
          'Nenhum sistema encontrado com a pesquisa/filtros atuais.',
        ]));
      } else {
        filtered.forEach((sys) => listBody.appendChild(buildSystemRow(sys)));
      }
    }
    refreshList();

    inner.appendChild(listCard);
    wrap.appendChild(inner);
    return wrap;
  }

  function buildSystemRow(sys) {
    const categories = Array.isArray(sys.categories) ? sys.categories : [];

    const badges = el('div', { class: 'sysmgr-row-badges' },
      categories.length
        ? categories.map((c) => el('span', { class: 'category-badge' }, [c]))
        : [el('span', { class: 'category-badge muted' }, ['Sem categoria'])]
    );

    const iconEl = sys.logo
      ? el('img', { src: sys.logo, alt: sys.name })
      : (sys.name || '?').trim().charAt(0).toUpperCase();

    const viewBtn = el('button', {
      class: 'btn btn-primary btn-sm', title: 'Visualizar sistema', type: 'button',
      onclick: () => openViewModal(sys),
    }, [el('span', { html: icon('eye') }), el('span', { class: 'lbl' }, [' Visualizar'])]);

    const mainRow = el('div', { class: 'sysmgr-row-main' }, [
      el('div', { class: 'sysmgr-row-icon' }, [iconEl]),
      el('div', { class: 'sysmgr-row-info' }, [
        el('div', { class: 'r-name' }, [sys.name]),
        el('a', { class: 'r-url', href: '#', onclick: (ev) => ev.preventDefault() }, [sys.url]),
        badges,
      ]),
      el('div', { class: 'sysmgr-row-main-actions' }, [viewBtn]),
    ]);

    return el('div', { class: 'sysmgr-row' }, [mainRow]);
  }

  // ---------------- Modal: Visualizador / Editor do sistema ----------------
  function openViewModal(sys) {
    state.viewModal = { system: sys, mode: 'view' };
    render();
  }
  function closeViewModal() {
    state.viewModal = null;
    render();
  }

  function viewField(label, value) {
    return el('div', { class: 'view-field' }, [
      el('span', { class: 'vk' }, [label]),
      el('span', { class: 'vv' }, [value]),
    ]);
  }

  function buildViewModal() {
    return state.viewModal.mode === 'edit' ? buildViewModalEdit(state.viewModal.system) : buildViewModalView(state.viewModal.system);
  }

  // ---------------- Assinaturas (múltiplas por sistema) ----------------
  function subscriptionsTotals(subs) {
    subs = subs || [];
    const total = subs.reduce((sum, s) => sum + (typeof s.value === 'number' && !isNaN(s.value) ? s.value : 0), 0);
    return { count: subs.length, total };
  }

  function buildSubsTotalsRow(count, total) {
    return el('div', { class: 'subs-totals' }, [
      el('span', { class: 'subs-total-badge' }, ['Total de assinaturas: ' + count]),
      el('span', { class: 'subs-total-badge value' }, ['Valor total: ' + formatCurrencyBRL(total)]),
    ]);
  }

  // Somente leitura — usado no modal Visualizador.
  function buildSubscriptionsView(subs) {
    subs = subs || [];
    const { count, total } = subscriptionsTotals(subs);
    const wrap = el('div', { class: 'subs-view' }, [buildSubsTotalsRow(count, total)]);

    if (!subs.length) {
      wrap.appendChild(el('div', { class: 'subs-empty' }, ['Nenhuma assinatura cadastrada.']));
      return wrap;
    }

    const header = el('div', { class: 'subs-view-row subs-view-header' }, [
      el('span', {}, ['Nome']),
      el('span', {}, ['Valor']),
      el('span', {}, ['Vencimento']),
    ]);
    const rows = el(
      'div',
      { class: 'subs-view-rows' },
      subs.map((s) => el('div', { class: 'subs-view-row' }, [
        el('span', {}, [s.name || '—']),
        el('span', {}, [formatCurrencyBRL(s.value) || '—']),
        el('span', {}, [formatDateBR(s.due_date) || '—']),
      ]))
    );
    // A lista exibe sempre 2 linhas; a partir da 3ª, o próprio bloco de
    // linhas ganha rolagem interna (o cabeçalho fica fixo, fora do scroll).
    const list = el('div', { class: 'subs-view-list' }, [header, rows]);
    wrap.appendChild(list);
    return wrap;
  }

  // Editável — usado nos modais de criação/edição. Suporta 0..N assinaturas,
  // com uma linha por assinatura, botão de adicionar/remover e um resumo
  // (total de assinaturas + valor total) que se mantém organizado mesmo
  // com muitas linhas (a lista fica com rolagem própria).
  function buildSubscriptionsEditor(initialSubs) {
    const rows = [];
    const listEl = el('div', { class: 'subs-list' });
    const emptyMsg = el('div', { class: 'subs-empty' }, ['Nenhuma assinatura adicionada ainda.']);
    const totalsEl = el('div', { class: 'subs-totals' });

    function refreshTotals() {
      const values = rows.map((r) => {
        const raw = r.valueInput.value;
        return raw === '' ? 0 : Number(raw);
      });
      const total = values.reduce((sum, v) => sum + (isNaN(v) ? 0 : v), 0);
      totalsEl.innerHTML = '';
      totalsEl.appendChild(el('span', { class: 'subs-total-badge' }, ['Total de assinaturas: ' + rows.length]));
      totalsEl.appendChild(el('span', { class: 'subs-total-badge value' }, ['Valor total: ' + formatCurrencyBRL(total)]));
    }

    function refreshEmptyState() {
      emptyMsg.style.display = rows.length ? 'none' : 'block';
      listEl.style.display = rows.length ? 'flex' : 'none';
    }

    function addRow(sub) {
      sub = sub || {};
      const nameInput = el('input', { type: 'text', placeholder: 'Ex: Plano mensal', value: sub.name || '' });
      const valueInput = el('input', {
        type: 'number', step: '0.01', min: '0', placeholder: '0,00',
        value: sub.value !== undefined && sub.value !== null ? sub.value : '',
      });
      const dateInput = el('input', { type: 'date', value: sub.due_date || '' });
      valueInput.addEventListener('input', refreshTotals);

      const removeBtn = el('button', {
        type: 'button', class: 'btn btn-danger btn-icon subs-remove-btn', title: 'Remover assinatura',
        html: icon('trash'),
      });

      const rowEl = el('div', { class: 'subs-row' }, [nameInput, valueInput, dateInput, removeBtn]);
      const rowObj = { rowEl, nameInput, valueInput, dateInput };
      removeBtn.addEventListener('click', () => {
        const idx = rows.indexOf(rowObj);
        if (idx >= 0) rows.splice(idx, 1);
        rowEl.remove();
        refreshTotals();
        refreshEmptyState();
      });

      rows.push(rowObj);
      listEl.appendChild(rowEl);
      refreshTotals();
      refreshEmptyState();
    }

    const addBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, [
      el('span', { html: icon('plus') }), ' Adicionar assinatura',
    ]);
    addBtn.addEventListener('click', () => addRow());

    (initialSubs || []).forEach(addRow);
    refreshTotals();
    refreshEmptyState();

    const header = el('div', { class: 'subs-header' }, [
      el('span', {}, ['Nome']),
      el('span', {}, ['Valor (R$)']),
      el('span', {}, ['Vencimento']),
      el('span', {}, ['']),
    ]);

    const container = el('div', { class: 'subs-editor' }, [
      header,
      listEl,
      emptyMsg,
      addBtn,
      totalsEl,
    ]);

    function getSubscriptions() {
      return rows
        .map((r) => ({
          name: r.nameInput.value.trim(),
          value: r.valueInput.value === '' ? null : Number(r.valueInput.value),
          due_date: r.dateInput.value || '',
        }))
        .filter((s) => s.name || s.value !== null || s.due_date);
    }

    function hasInvalidValue() {
      return rows.some((r) => r.valueInput.value !== '' && (isNaN(Number(r.valueInput.value)) || Number(r.valueInput.value) < 0));
    }

    return { container, getSubscriptions, hasInvalidValue };
  }

  // ---------------- Contato do responsável pelo contrato ----------------
  // Extrai só os dígitos do WhatsApp informado, para montar o link wa.me
  // (aceita qualquer formatação: espaços, parênteses, traços, +55 etc.).
  function whatsappDigits(raw) {
    return (raw || '').replace(/\D/g, '');
  }

  // Campos de contato reutilizados no cadastro e na edição de sistemas.
  // Retorna { container, nameInput, whatsappInput, emailInput }.
  function buildContactFields(sys) {
    sys = sys || {};
    const nameInput = el('input', {
      type: 'text', placeholder: 'Ex: Maria Souza', value: sys.contact_name || '',
    });
    const whatsappInput = el('input', {
      type: 'text', placeholder: '(11) 91234-5678', value: sys.contact_whatsapp || '',
    });
    const emailInput = el('input', {
      type: 'text', placeholder: 'responsavel@empresa.com', value: sys.contact_email || '',
    });

    const container = el('div', {}, [
      el('div', { class: 'field-section-title' }, ['Responsável pelo contrato']),
      el('div', { class: 'field' }, [el('label', {}, ['Nome do responsável']), nameInput]),
      el('div', { class: 'sysmgr-grid' }, [
        el('div', { class: 'field' }, [el('label', {}, ['WhatsApp']), whatsappInput]),
        el('div', { class: 'field' }, [el('label', {}, ['E-mail de contato']), emailInput]),
      ]),
    ]);

    return { container, nameInput, whatsappInput, emailInput };
  }

  // Somente leitura — usado no modal Visualizador. Mostra nome do
  // responsável e, quando cadastrados, botões de WhatsApp e E-mail
  // para contatá-lo diretamente.
  function buildContactSection(sys) {
    const name = (sys.contact_name || '').trim();
    const whatsapp = (sys.contact_whatsapp || '').trim();
    const email = (sys.contact_email || '').trim();

    if (!name && !whatsapp && !email) {
      return el('div', {}, [
        el('div', { class: 'field-section-title' }, ['Responsável pelo contrato']),
        el('div', { class: 'subs-empty' }, ['Nenhum responsável cadastrado.']),
      ]);
    }

    const actions = [];
    const digits = whatsappDigits(whatsapp);
    if (digits) {
      actions.push(el('a', {
        class: 'btn btn-ghost btn-sm contact-btn contact-btn-whatsapp',
        href: 'https://wa.me/' + digits,
        target: '_blank', rel: 'noopener',
      }, [el('span', { html: icon('whatsapp') }), ' WhatsApp']));
    }
    if (email) {
      actions.push(el('a', {
        class: 'btn btn-ghost btn-sm contact-btn contact-btn-email',
        href: 'mailto:' + email,
      }, [el('span', { html: icon('mail') }), ' E-mail']));
    }

    return el('div', {}, [
      el('div', { class: 'field-section-title' }, ['Responsável pelo contrato']),
      el('div', { class: 'contact-card' }, [
        el('div', { class: 'contact-info' }, [
          el('div', { class: 'contact-name' }, [name || 'Responsável não informado']),
          whatsapp ? el('div', { class: 'contact-detail' }, [whatsapp]) : null,
          email ? el('div', { class: 'contact-detail' }, [email]) : null,
        ]),
        actions.length ? el('div', { class: 'contact-actions' }, actions) : null,
      ]),
    ]);
  }

  function buildViewModalView(sys) {
    const categories = Array.isArray(sys.categories) ? sys.categories : [];

    const launchBtn = el('button', { class: 'btn btn-primary btn-sm', type: 'button' }, [
      el('span', { html: icon('launch') }), el('span', { class: 'lbl' }, [' Login As']),
    ]);
    launchBtn.addEventListener('click', async () => {
      launchBtn.disabled = true;
      try {
        const { url, login_email, login_password } = await api('/systems/' + sys.id + '/reveal');
        launchSystem(url, login_email, login_password);
      } catch (err) {
        toast(err.message, true);
      } finally {
        launchBtn.disabled = false;
      }
    });

    const editBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, [
      el('span', { html: icon('edit') }), el('span', { class: 'lbl' }, [' Editar']),
    ]);
    editBtn.addEventListener('click', async () => {
      editBtn.disabled = true;
      try {
        const reveal = await api('/systems/' + sys.id + '/reveal');
        state.viewModal = { system: { ...sys, login_password: reveal.login_password }, mode: 'edit' };
        render();
      } catch (err) {
        toast(err.message, true);
        editBtn.disabled = false;
      }
    });

    const deleteBtn = el('button', { class: 'btn btn-danger btn-sm', type: 'button' }, [
      el('span', { html: icon('trash') }), el('span', { class: 'lbl' }, [' Excluir']),
    ]);
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Excluir o sistema "' + sys.name + '"?')) return;
      try {
        await api('/systems/' + sys.id, { method: 'DELETE' });
        state.systems = state.systems.filter((s) => s.id !== sys.id);
        closeViewModal();
        toast('Sistema excluído.');
      } catch (err) { toast(err.message, true); }
    });

    const body = el('div', { class: 'modal-body view-modal-body' }, [
      el('div', { class: 'view-modal-top' }, [
        el('div', { class: 'view-modal-logo' }, [
          sys.logo ? el('img', { src: sys.logo, alt: sys.name }) : el('span', { html: icon('image') }),
        ]),
        el('div', {}, [
          el('h4', { class: 'view-modal-name' }, [sys.name]),
          el('a', { class: 'view-modal-url', href: normalizedUrl(sys.url), target: '_blank', rel: 'noopener' }, [sys.url]),
          el('div', { class: 'sysmgr-row-badges' }, categories.length
            ? categories.map((c) => el('span', { class: 'category-badge' }, [c]))
            : [el('span', { class: 'category-badge muted' }, ['Sem categoria'])]),
        ]),
      ]),
      el('div', { class: 'view-modal-grid' }, [
        viewField('E-mail de acesso', sys.login_email || '—'),
        viewField('Senha', sys.has_password ? '••••••••' : '—'),
        viewField('Repositório', sys.repo_url
          ? el('a', { href: normalizedUrl(sys.repo_url), target: '_blank', rel: 'noopener' }, [sys.repo_url])
          : '—'),
        viewField('Cadastrado em', sys.created_at ? formatDateBR(sys.created_at) : '—'),
        viewField('Atualizado em', sys.updated_at ? formatDateBR(sys.updated_at) : '—'),
      ]),
      buildContactSection(sys),
      el('div', { class: 'field-section-title' }, ['Assinaturas']),
      buildSubscriptionsView(sys.subscriptions),
    ]);

    const card = el('div', { class: 'modal-card view-modal-card' }, [
      el('div', { class: 'modal-header' }, [
        el('h3', {}, ['Detalhes do sistema']),
        el('button', { class: 'btn btn-ghost btn-icon', onclick: closeViewModal, html: icon('close') }),
      ]),
      body,
      el('div', { class: 'modal-footer view-modal-footer' }, [
        deleteBtn,
        el('div', { class: 'view-modal-footer-right' }, [
          el('button', { class: 'btn btn-ghost', onclick: closeViewModal }, ['Fechar']),
          editBtn,
          launchBtn,
        ]),
      ]),
    ]);

    return el('div', {
      class: 'modal-overlay',
      onclick: (ev) => { if (ev.target === ev.currentTarget) closeViewModal(); },
    }, [card]);
  }

  function buildViewModalEdit(sys) {
    const nameInput = el('input', { type: 'text', placeholder: 'Ex: Hello Conecta — ERP', value: sys.name || '' });
    const urlInput = el('input', { type: 'text', placeholder: 'https://sistema.helloinova.com.br', value: sys.url || '' });
    const repoUrlInput = el('input', { type: 'text', placeholder: 'https://github.com/sua-org/seu-repo', value: sys.repo_url || '' });
    const emailInput = el('input', { type: 'text', placeholder: 'usuario@sistema.com', autocomplete: 'off', value: sys.login_email || '' });
    const passInput = el('input', {
      type: 'password', placeholder: 'Deixe em branco para manter a atual',
      autocomplete: 'new-password', value: sys.login_password || '',
    });
    const passToggle = el('button', {
      type: 'button', class: 'password-toggle', title: 'Mostrar/ocultar senha',
      html: icon('eye'),
      onclick: () => {
        const showing = passInput.type === 'text';
        passInput.type = showing ? 'password' : 'text';
        passToggle.innerHTML = icon(showing ? 'eye' : 'eyeOff');
      },
    });

    const existingCategories = Array.isArray(sys.categories) ? sys.categories : [];
    const categorySelect = el('select', { multiple: true, class: 'category-select', size: String(SYSTEM_CATEGORIES.length) },
      SYSTEM_CATEGORIES.map((cat) => el('option', {
        value: cat,
        selected: existingCategories.includes(cat) ? true : null,
      }, [cat]))
    );

    const subsEditor = buildSubscriptionsEditor(sys.subscriptions || []);
    const contactFields = buildContactFields(sys);

    let logoData = sys.logo || '';
    const logoPreview = el('div', { class: 'logo-preview' }, [
      logoData ? el('img', { src: logoData, alt: 'logo' }) : el('span', { html: icon('image') }),
    ]);
    const logoFileInput = el('input', { type: 'file', accept: 'image/*' });
    logoFileInput.addEventListener('change', () => {
      const file = logoFileInput.files && logoFileInput.files[0];
      if (!file) return;
      if (file.size > 1_200_000) {
        toast('Imagem muito grande. Escolha um arquivo de até ~1MB.', true);
        logoFileInput.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        logoData = String(reader.result);
        logoPreview.innerHTML = '';
        logoPreview.appendChild(el('img', { src: logoData, alt: 'logo' }));
      };
      reader.readAsDataURL(file);
    });
    const logoPickBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => logoFileInput.click() }, [
      el('span', { html: icon('upload') }), ' Anexar logo',
    ]);
    const logoRemoveBtn = el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button',
      onclick: () => { logoData = ''; logoPreview.innerHTML = ''; logoPreview.appendChild(el('span', { html: icon('image') })); logoFileInput.value = ''; },
    }, ['Remover']);

    const cancelBtn = el('button', { class: 'btn btn-ghost', type: 'button' }, ['Cancelar']);
    cancelBtn.addEventListener('click', () => {
      const { login_password, ...rest } = sys;
      state.viewModal = { system: rest, mode: 'view' };
      render();
    });

    const saveBtn = el('button', { class: 'btn btn-primary', type: 'button' }, ['Salvar alterações']);
    saveBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      const url = urlInput.value.trim();
      const repoUrl = repoUrlInput.value.trim();
      const email = emailInput.value.trim();
      const password = passInput.value;
      const categories = Array.from(categorySelect.selectedOptions).map((o) => o.value);

      if (!name) { toast('Informe o nome do sistema.', true); return; }
      if (!url) { toast('Informe o link de acesso ao sistema.', true); return; }
      if (subsEditor.hasInvalidValue()) {
        toast('Informe um valor de assinatura válido.', true); return;
      }

      saveBtn.disabled = true;
      try {
        const body = {
          name, url, repo_url: repoUrl, login_email: email, logo: logoData,
          categories,
          subscriptions: subsEditor.getSubscriptions(),
          contact_name: contactFields.nameInput.value.trim(),
          contact_whatsapp: contactFields.whatsappInput.value.trim(),
          contact_email: contactFields.emailInput.value.trim(),
        };
        if (password) body.login_password = password;
        const res = await api('/systems/' + sys.id, { method: 'PUT', body });
        state.systems = state.systems.map((s) => (s.id === res.system.id ? res.system : s));
        state.viewModal = { system: res.system, mode: 'view' };
        render();
        toast('Sistema atualizado.');
      } catch (err) {
        toast(err.message, true);
        saveBtn.disabled = false;
      }
    });

    const body = el('div', { class: 'modal-body' }, [
      el('div', { class: 'field' }, [el('label', {}, ['Nome do sistema']), nameInput]),
      el('div', { class: 'field' }, [el('label', {}, ['Link de acesso ao sistema']), urlInput]),
      el('div', { class: 'field' }, [el('label', {}, ['Link do repositório']), repoUrlInput]),
      el('div', { class: 'field' }, [
        el('label', {}, ['Tipo de sistema']),
        categorySelect,
        el('div', { class: 'field-hint' }, ['Segure Ctrl (ou Cmd no Mac) para selecionar mais de uma opção.']),
      ]),
      el('div', { class: 'field' }, [el('label', {}, ['E-mail do sistema']), emailInput]),
      el('div', { class: 'field' }, [
        el('label', {}, ['Senha']),
        el('div', { class: 'password-field' }, [passInput, passToggle]),
      ]),
      contactFields.container,
      el('div', { class: 'field-section-title' }, ['Assinaturas']),
      subsEditor.container,
      el('div', { class: 'field' }, [
        el('label', {}, ['Logo do sistema']),
        el('div', { class: 'logo-upload' }, [
          logoPreview,
          el('div', { class: 'logo-upload-actions' }, [logoFileInput, logoPickBtn, logoRemoveBtn]),
        ]),
      ]),
    ]);

    const card = el('div', { class: 'modal-card' }, [
      el('div', { class: 'modal-header' }, [
        el('h3', {}, ['Editar sistema']),
        el('button', { class: 'btn btn-ghost btn-icon', onclick: closeViewModal, html: icon('close') }),
      ]),
      body,
      el('div', { class: 'modal-footer' }, [cancelBtn, saveBtn]),
    ]);

    return el('div', {
      class: 'modal-overlay',
      onclick: (ev) => { if (ev.target === ev.currentTarget) closeViewModal(); },
    }, [card]);
  }

  // ---------------- Modal: Novo Sistema ----------------
  // (a edição de um sistema já existente acontece dentro do próprio modal
  // Visualizador — veja buildViewModalEdit — este aqui é só para criação.)
  function openSystemModal(mode) {
    state.systemModal = { mode: mode || 'create' };
    render();
  }
  function closeSystemModal() {
    state.systemModal = null;
    render();
  }

  function buildSystemModal() {
    const nameInput = el('input', { type: 'text', placeholder: 'Ex: Hello Conecta — ERP' });
    const urlInput = el('input', { type: 'text', placeholder: 'https://sistema.helloinova.com.br' });
    const repoUrlInput = el('input', { type: 'text', placeholder: 'https://github.com/sua-org/seu-repo' });
    const emailInput = el('input', { type: 'text', placeholder: 'usuario@sistema.com', autocomplete: 'off' });
    const passInput = el('input', { type: 'password', placeholder: '••••••••', autocomplete: 'new-password' });

    const categorySelect = el('select', { multiple: true, class: 'category-select', size: String(SYSTEM_CATEGORIES.length) },
      SYSTEM_CATEGORIES.map((cat) => el('option', { value: cat }, [cat]))
    );

    const subsEditor = buildSubscriptionsEditor([]);
    const contactFields = buildContactFields({});

    const passToggle = el('button', {
      type: 'button', class: 'password-toggle', title: 'Mostrar/ocultar senha',
      html: icon('eye'),
      onclick: () => {
        const showing = passInput.type === 'text';
        passInput.type = showing ? 'password' : 'text';
        passToggle.innerHTML = icon(showing ? 'eye' : 'eyeOff');
      },
    });

    let logoData = '';
    const logoPreview = el('div', { class: 'logo-preview' }, [el('span', { html: icon('image') })]);
    const logoFileInput = el('input', { type: 'file', accept: 'image/*' });
    logoFileInput.addEventListener('change', () => {
      const file = logoFileInput.files && logoFileInput.files[0];
      if (!file) return;
      if (file.size > 1_200_000) {
        toast('Imagem muito grande. Escolha um arquivo de até ~1MB.', true);
        logoFileInput.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        logoData = String(reader.result);
        logoPreview.innerHTML = '';
        logoPreview.appendChild(el('img', { src: logoData, alt: 'logo' }));
      };
      reader.readAsDataURL(file);
    });
    const logoPickBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => logoFileInput.click() }, [
      el('span', { html: icon('upload') }), ' Anexar logo',
    ]);
    const logoRemoveBtn = el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button',
      onclick: () => { logoData = ''; logoPreview.innerHTML = ''; logoPreview.appendChild(el('span', { html: icon('image') })); logoFileInput.value = ''; },
    }, ['Remover']);

    const primaryBtn = el('button', { class: 'btn btn-primary', type: 'button' }, [
      el('span', {}, [el('span', { html: icon('launch') }), ' Login As']),
    ]);

    primaryBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      const url = urlInput.value.trim();
      const repoUrl = repoUrlInput.value.trim();
      const email = emailInput.value.trim();
      const password = passInput.value;
      const categories = Array.from(categorySelect.selectedOptions).map((o) => o.value);

      if (!name) { toast('Informe o nome do sistema.', true); return; }
      if (!url) { toast('Informe o link de acesso ao sistema.', true); return; }
      if (subsEditor.hasInvalidValue()) {
        toast('Informe um valor de assinatura válido.', true); return;
      }

      primaryBtn.disabled = true;
      try {
        const body = {
          name, url, repo_url: repoUrl, login_email: email, logo: logoData,
          categories,
          subscriptions: subsEditor.getSubscriptions(),
          contact_name: contactFields.nameInput.value.trim(),
          contact_whatsapp: contactFields.whatsappInput.value.trim(),
          contact_email: contactFields.emailInput.value.trim(),
          login_password: password,
        };
        const res = await api('/systems', { method: 'POST', body });
        state.systems = [res.system, ...state.systems];
        closeSystemModal();
        launchSystem(url, email, password);
      } catch (err) {
        toast(err.message, true);
        primaryBtn.disabled = false;
      }
    });

    const body = el('div', { class: 'modal-body' }, [
      el('div', { class: 'field' }, [el('label', {}, ['Nome do sistema']), nameInput]),
      el('div', { class: 'field' }, [el('label', {}, ['Link de acesso ao sistema']), urlInput]),
      el('div', { class: 'field' }, [el('label', {}, ['Link do repositório']), repoUrlInput]),
      el('div', { class: 'field' }, [
        el('label', {}, ['Tipo de sistema']),
        categorySelect,
        el('div', { class: 'field-hint' }, ['Segure Ctrl (ou Cmd no Mac) para selecionar mais de uma opção.']),
      ]),
      el('div', { class: 'field' }, [el('label', {}, ['E-mail do sistema']), emailInput]),
      el('div', { class: 'field' }, [
        el('label', {}, ['Senha']),
        el('div', { class: 'password-field' }, [passInput, passToggle]),
      ]),
      contactFields.container,
      el('div', { class: 'field-section-title' }, ['Assinaturas']),
      subsEditor.container,
      el('div', { class: 'field' }, [
        el('label', {}, ['Logo do sistema']),
        el('div', { class: 'logo-upload' }, [
          logoPreview,
          el('div', { class: 'logo-upload-actions' }, [logoFileInput, logoPickBtn, logoRemoveBtn]),
        ]),
      ]),
      el('div', { class: 'hint-box' }, [
        el('span', { html: icon('info') }),
        el('span', {}, [
          'Por segurança dos navegadores, não é possível preencher automaticamente o formulário de login de outro site a partir daqui. O "Login As" salva o sistema, abre-o em uma nova aba e copia a senha para você colar (Ctrl+V) — o e-mail aparece no aviso para copiar também.',
        ]),
      ]),
    ]);

    const card = el('div', { class: 'modal-card' }, [
      el('div', { class: 'modal-header' }, [
        el('h3', {}, ['Novo Sistema']),
        el('button', { class: 'btn btn-ghost btn-icon', onclick: closeSystemModal, html: icon('close') }),
      ]),
      body,
      el('div', { class: 'modal-footer' }, [
        el('button', { class: 'btn btn-ghost', onclick: closeSystemModal }, ['Cancelar']),
        primaryBtn,
      ]),
    ]);

    return el('div', {
      class: 'modal-overlay',
      onclick: (ev) => { if (ev.target === ev.currentTarget) closeSystemModal(); },
    }, [card]);
  }

  // ---------------- Modal: Perfil do usuário ----------------
  function buildProfileModal() {
    const nameInput = el('input', { type: 'text', value: state.user.name || '' });
    const emailInput = el('input', { type: 'email', value: state.user.email || '' });
    const passInput = el('input', { type: 'password', placeholder: 'Deixe em branco para manter a atual', autocomplete: 'new-password' });
    const passConfirm = el('input', { type: 'password', placeholder: 'Confirme a nova senha', autocomplete: 'new-password' });

    const passToggle = el('button', {
      type: 'button', class: 'password-toggle', title: 'Mostrar/ocultar senha',
      html: icon('eye'),
      onclick: () => {
        const showing = passInput.type === 'text';
        passInput.type = passConfirm.type = showing ? 'password' : 'text';
        passToggle.innerHTML = icon(showing ? 'eye' : 'eyeOff');
      },
    });

    const saveBtn = el('button', { class: 'btn btn-primary', type: 'button' }, ['Salvar alterações']);
    saveBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      const email = emailInput.value.trim();
      const password = passInput.value;
      const confirm2 = passConfirm.value;

      if (!name) { toast('Informe seu nome.', true); return; }
      if (!email) { toast('Informe seu e-mail.', true); return; }
      if (password && password !== confirm2) { toast('As senhas não coincidem.', true); return; }

      saveBtn.disabled = true;
      try {
        const body = { name, email };
        if (password) body.password = password;
        const res = await api('/auth/me', { method: 'PUT', body });
        state.user = res.user;
        state.profileModal = false;
        render();
        toast('Perfil atualizado.');
      } catch (err) {
        toast(err.message, true);
        saveBtn.disabled = false;
      }
    });

    const closeModal = () => { state.profileModal = false; render(); };

    const body = el('div', { class: 'modal-body' }, [
      el('div', { class: 'profile-avatar-lg' }, [(state.user.name || '?').trim().charAt(0).toUpperCase()]),
      el('div', { class: 'field' }, [el('label', {}, ['Nome']), nameInput]),
      el('div', { class: 'field' }, [el('label', {}, ['E-mail']), emailInput]),
      el('div', { class: 'field' }, [
        el('label', {}, ['Nova senha']),
        el('div', { class: 'password-field' }, [passInput, passToggle]),
      ]),
      el('div', { class: 'field' }, [el('label', {}, ['Confirmar nova senha']), passConfirm]),
    ]);

    const card = el('div', { class: 'modal-card' }, [
      el('div', { class: 'modal-header' }, [
        el('h3', {}, ['Meu perfil']),
        el('button', { class: 'btn btn-ghost btn-icon', onclick: closeModal, html: icon('close') }),
      ]),
      body,
      el('div', { class: 'modal-footer' }, [
        el('button', { class: 'btn btn-ghost', onclick: closeModal }, ['Cancelar']),
        saveBtn,
      ]),
    ]);

    return el('div', {
      class: 'modal-overlay',
      onclick: (ev) => { if (ev.target === ev.currentTarget) closeModal(); },
    }, [card]);
  }

  function toolboxBtn(iconName, label, onClick) {
    return el('button', { class: 'btn btn-ghost btn-sm', onclick: onClick }, [
      el('span', { html: icon(iconName) }),
      el('span', { class: 'lbl' }, [' ' + label]),
    ]);
  }

  async function addElement(type) {
    const page = currentPage();
    if (!page) { toast('Crie um módulo primeiro.', true); return; }
    const count = page.elements.length;
    const defaults = {
      label: { content: 'Novo texto', font_color: '#EAF0FF', bg_color: '#0b0d16', font_size: 16, font_weight: '600', border_radius: 4, width: 22, height: 6 },
      input: { content: '', placeholder: 'Digite aqui…', font_color: '#EAF0FF', bg_color: '#12162a', font_size: 14, font_weight: '400', border_radius: 8, width: 26, height: 7 },
      button: { content: 'Botão', font_color: '#FFFFFF', bg_color: '#1657FF', font_size: 14, font_weight: '700', border_radius: 10, width: 18, height: 7 },
    }[type];

    const body = Object.assign({
      type,
      x: clamp(6 + (count % 6) * 4, 0, 90),
      y: clamp(6 + (count % 6) * 5, 0, 90),
    }, defaults);

    try {
      const { element } = await api('/pages/' + page.id + '/elements', { method: 'POST', body });
      page.elements.push(element);
      state.selectedElementId = element.id;
      state.sidebarTab = 'props';
      render();
    } catch (err) { toast(err.message, true); }
  }

  function applyElementStyle(domEl, data) {
    domEl.style.left = data.x + '%';
    domEl.style.top = data.y + '%';
    domEl.style.width = data.width + '%';
    domEl.style.height = data.height + '%';
    domEl.style.zIndex = data.z_index;
    const inner = domEl.querySelector('.el-inner');
    if (inner) {
      inner.style.color = data.font_color;
      inner.style.fontSize = data.font_size + 'px';
      inner.style.fontWeight = data.font_weight;
      inner.style.background = data.bg_color || 'transparent';
      inner.style.borderRadius = (data.border_radius || 0) + 'px';
      if (data.type === 'input') {
        inner.placeholder = data.placeholder || '';
      } else {
        inner.textContent = data.content || (data.type === 'button' ? 'Botão' : 'Texto');
      }
    }
  }

  function buildCanvasElement(data) {
    const wrapper = el('div', {
      class: 'el' + (state.selectedElementId === data.id ? ' selected' : ''),
      'data-id': data.id,
      style: `left:${data.x}%; top:${data.y}%; width:${data.width}%; height:${data.height}%; z-index:${data.z_index};`,
    });

    let inner;
    if (data.type === 'label') {
      inner = el('div', {
        class: 'el-inner el-label',
        style: `color:${data.font_color}; font-size:${data.font_size}px; font-weight:${data.font_weight}; background:${data.bg_color || 'transparent'}; border-radius:${data.border_radius || 4}px; width:100%; height:100%; display:flex; align-items:center;`,
      }, [data.content || 'Texto']);
    } else if (data.type === 'input') {
      inner = el('input', {
        class: 'el-inner el-input',
        type: 'text',
        placeholder: data.placeholder || '',
        style: `color:${data.font_color}; font-size:${data.font_size}px; font-weight:${data.font_weight}; background:${data.bg_color}; border-radius:${data.border_radius}px;`,
        readonly: state.mode === 'edit' ? true : null,
      });
    } else {
      inner = el('button', {
        class: 'el-inner el-button',
        type: 'button',
        style: `color:${data.font_color}; font-size:${data.font_size}px; font-weight:${data.font_weight}; background:${data.bg_color}; border-radius:${data.border_radius}px;`,
        onclick: (ev) => { if (state.mode === 'preview') { ev.stopPropagation(); toast('Pré-visualização: este botão não executa ações reais.'); } },
      }, [data.content || 'Botão']);
    }

    wrapper.appendChild(inner);

    if (state.mode === 'edit') {
      const handle = el('div', { class: 'resize-handle' });
      wrapper.appendChild(handle);
      wireResize(handle, wrapper, data);
    }

    wrapper.addEventListener('pointerdown', (ev) => {
      if (state.mode !== 'edit') return;
      if (ev.target.classList.contains('resize-handle')) return;
      ev.stopPropagation();
      selectElement(data.id);
      startDrag(ev, wrapper, data);
    });

    return wrapper;
  }

  function selectElement(id) {
    state.selectedElementId = id;
    state.sidebarTab = 'props';
    document.querySelectorAll('.el').forEach((n) => n.classList.toggle('selected', n.getAttribute('data-id') === String(id)));
    render();
  }

  const persistPosition = debounce(async (id, patch) => {
    try { await api('/pages/elements/' + id, { method: 'PUT', body: patch }); }
    catch (err) { toast(err.message, true); }
  }, 250);

  function startDrag(startEv, wrapper, data) {
    const canvas = document.getElementById('hi-canvas');
    const canvasRect = canvas.getBoundingClientRect();
    const startX = startEv.clientX;
    const startY = startEv.clientY;
    const startLeftPct = data.x;
    const startTopPct = data.y;

    wrapper.classList.add('dragging');
    wrapper.setPointerCapture(startEv.pointerId);

    function onMove(ev) {
      const dxPct = ((ev.clientX - startX) / canvasRect.width) * 100;
      const dyPct = ((ev.clientY - startY) / canvasRect.height) * 100;
      const newX = clamp(startLeftPct + dxPct, 0, 100 - data.width);
      const newY = clamp(startTopPct + dyPct, 0, 100 - data.height);
      data.x = round1(newX);
      data.y = round1(newY);
      wrapper.style.left = data.x + '%';
      wrapper.style.top = data.y + '%';
      if (state.selectedElementId === data.id && state.sidebarTab === 'props') syncPropsPosFields(data);
    }

    function onUp(ev) {
      wrapper.classList.remove('dragging');
      wrapper.removeEventListener('pointermove', onMove);
      wrapper.removeEventListener('pointerup', onUp);
      persistPosition('el-' + data.id, { x: data.x, y: data.y });
    }

    wrapper.addEventListener('pointermove', onMove);
    wrapper.addEventListener('pointerup', onUp);
  }

  function wireResize(handle, wrapper, data) {
    handle.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      selectElement(data.id);
      const canvas = document.getElementById('hi-canvas');
      const canvasRect = canvas.getBoundingClientRect();
      const startX = ev.clientX;
      const startY = ev.clientY;
      const startW = data.width;
      const startH = data.height;
      handle.setPointerCapture(ev.pointerId);

      function onMove(mv) {
        const dwPct = ((mv.clientX - startX) / canvasRect.width) * 100;
        const dhPct = ((mv.clientY - startY) / canvasRect.height) * 100;
        data.width = clamp(round1(startW + dwPct), 3, 100 - data.x);
        data.height = clamp(round1(startH + dhPct), 3, 100 - data.y);
        wrapper.style.width = data.width + '%';
        wrapper.style.height = data.height + '%';
        if (state.selectedElementId === data.id && state.sidebarTab === 'props') syncPropsPosFields(data);
      }
      function onUp() {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        persistPosition('el-' + data.id, { width: data.width, height: data.height });
      }
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
    });
  }

  function syncPropsPosFields(data) {
    const panel = document.querySelector('.sidebar-body');
    if (!panel) return;
    const inputs = panel.querySelectorAll('.prop-row input[type="number"]');
    if (inputs.length >= 4) {
      inputs[0].value = round1(data.x);
      inputs[1].value = round1(data.y);
      inputs[2].value = round1(data.width);
      inputs[3].value = round1(data.height);
    }
  }

  // Clique fora de um elemento no canvas desmarca a seleção
  document.addEventListener('click', (ev) => {
    if (ev.target.id === 'hi-canvas') {
      if (state.selectedElementId) {
        state.selectedElementId = null;
        state.sidebarTab = 'pages';
        render();
      }
    }
  });

  boot();
})();
