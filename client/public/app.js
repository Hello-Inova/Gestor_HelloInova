/* ============================================================
   Hello Inova · Gestor de Sistemas — Front-end (vanilla JS SPA)
   ============================================================ */

(function () {
  'use strict';

  const $app = document.getElementById('app');

  const state = {
    user: null,
    pages: [],
    selectedPageId: null,
    selectedElementId: null,
    sidebarTab: 'pages', // 'pages' | 'props'
    mode: 'edit', // 'edit' | 'preview'
    authView: 'login', // 'login' | 'register'
    sidebarOpen: false,
    booted: false,
  };

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
      await loadPages();
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
          await loadPages();
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
      }, ['Páginas']),
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
      el('div', { class: 'user-avatar' }, [(state.user.name || '?').trim().charAt(0).toUpperCase()]),
      el('div', { class: 'user-meta' }, [
        el('div', { class: 'u-name' }, [state.user.name]),
        el('div', { class: 'u-email' }, [state.user.email]),
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
            toast('Nome da página atualizado.');
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
            class: 'icon-btn danger', title: 'Excluir página',
            onclick: async (ev) => {
              ev.stopPropagation();
              if (state.pages.length <= 1) { toast('É necessário manter ao menos uma página.', true); return; }
              if (!confirm('Excluir a página "' + page.name + '"? Todos os elementos dela serão perdidos.')) return;
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
        const name = prompt('Nome da nova página de navegação:', 'Nova página');
        if (!name || !name.trim()) return;
        try {
          const { page } = await api('/pages', { method: 'POST', body: { name: name.trim() } });
          await loadPages();
          state.selectedPageId = page.id;
          render();
        } catch (err) { toast(err.message, true); }
      },
    }, [el('span', { html: icon('plus') }), ' Nova página']));

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

  // ---------------- Área principal / canvas ----------------
  function buildMain() {
    const main = el('div', { class: 'main' });
    const page = currentPage();

    const header = el('div', { class: 'main-header' }, [
      el('div', { class: 'page-title-wrap' }, [
        el('h2', {}, [page ? page.name : 'Nenhuma página']),
      ]),
      el('div', { class: 'toolbox' }, [
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

    const canvasScroll = el('div', { class: 'canvas-scroll' });
    const canvas = el('div', { class: 'canvas' + (state.mode === 'preview' ? ' locked' : ''), id: 'hi-canvas' });

    if (!page) {
      canvas.appendChild(el('div', { class: 'canvas-empty' }, ['Crie uma página para começar.']));
    } else if (!page.elements.length) {
      canvas.appendChild(el('div', { class: 'canvas-empty' }, [
        el('span', { html: icon('layers') }),
        el('div', {}, ['Esta página ainda não tem elementos.']),
        el('div', {}, ['Use os botões acima para adicionar texto, campos e botões.']),
      ]));
    } else {
      page.elements.forEach((elData) => canvas.appendChild(buildCanvasElement(elData)));
    }

    canvasScroll.appendChild(canvas);
    main.appendChild(header);
    main.appendChild(canvasScroll);
    return main;
  }

  function toolboxBtn(iconName, label, onClick) {
    return el('button', { class: 'btn btn-ghost btn-sm', onclick: onClick }, [
      el('span', { html: icon(iconName) }),
      el('span', { class: 'lbl' }, [' ' + label]),
    ]);
  }

  async function addElement(type) {
    const page = currentPage();
    if (!page) { toast('Crie uma página primeiro.', true); return; }
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
