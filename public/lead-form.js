// Formulário público de captação de leads (público/captacao.html).
//
// Página standalone, sem autenticação — não faz parte da SPA de app.js
// (não usa nem depende do "state" nem do IIFE de lá). Etapa 1 (nome,
// WhatsApp, e-mail) já salva o lead assim que enviada; a Etapa 2 é
// totalmente opcional e, se preenchida, atualiza o mesmo registro.
(function () {
  'use strict';

  const root = document.getElementById('lead-app');

  // ---------- Helpers ----------
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

  function svgIcon(pathsHtml, size) {
    const s = size || 20;
    const span = el('span', { class: 'ic', html: `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${pathsHtml}</svg>` });
    return span;
  }

  async function api(path, options) {
    const opts = options || {};
    const res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* corpo vazio */ }
    if (!res.ok) throw new Error((data && data.error) || 'Não foi possível enviar. Tente novamente.');
    return data;
  }

  // ---------- Dados fixos ----------
  const SERVICES = ['Landing Page', 'Website', 'Cardápio Digital', 'E-mail Corporativo', 'Outro'];

  // Lista diversificada de ramos de negócio (PT-BR), para o combobox
  // pesquisável da Etapa 2. "Outros" sempre aparece por último e revela um
  // campo de texto livre quando selecionado.
  const BUSINESS_SEGMENTS = [
    'Alimentação e restaurantes', 'Bares e lanchonetes', 'Cafeteria', 'Confeitaria e doceria',
    'Padaria', 'Delivery de comida', 'Moda e vestuário', 'Calçados e acessórios', 'Joalheria e bijuteria',
    'Beleza e estética', 'Salão de beleza', 'Barbearia', 'Clínica de estética', 'Spa e bem-estar',
    'Saúde e clínicas médicas', 'Odontologia', 'Fisioterapia', 'Psicologia', 'Nutrição', 'Academia e estúdio fitness',
    'Pet shop e veterinária', 'Educação e cursos', 'Escola de idiomas', 'Consultoria empresarial',
    'Contabilidade', 'Advocacia e serviços jurídicos', 'Imobiliária', 'Construção civil e reforma',
    'Arquitetura e decoração', 'Marcenaria e móveis planejados', 'Eventos e festas', 'Fotografia e filmagem',
    'Marketing e publicidade', 'Tecnologia e software', 'E-commerce e loja virtual', 'Autopeças e oficina mecânica',
    'Concessionária e revenda de veículos', 'Transporte e logística', 'Turismo e agência de viagens',
    'Hotelaria e pousada', 'Agropecuária', 'Indústria e manufatura', 'Varejo em geral', 'Supermercado e mercearia',
    'Papelaria e gráfica', 'Floricultura', 'Ótica', 'Lavanderia', 'Segurança e monitoramento',
    'ONG e terceiro setor', 'Igreja e organização religiosa', 'Profissional autônomo/liberal', 'Outros',
  ];

  // ---------- Estado ----------
  const state = {
    step: 1,
    leadId: null,
    submitting: false,
    error: '',
    step1: { name: '', whatsapp: '', email: '' },
    step2: {
      services: [],
      otherService: '',
      businessSegment: '',
      businessSegmentOther: '',
      description: '',
    },
    referrerUrl: '',
    source: '',
    done: false,
  };

  function classifyReferrer(url) {
    if (!url) return 'Direto/Outro';
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      if (!host) return 'Direto/Outro';
      if (host.includes('instagram.com')) return 'Instagram';
      if (host.includes('facebook.com') || host.includes('fb.com')) return 'Facebook';
      if (host.includes('google.')) return 'Google';
      if (host.includes('whatsapp.com') || host.includes('wa.me')) return 'WhatsApp';
      return host;
    } catch {
      return 'Direto/Outro';
    }
  }

  state.referrerUrl = document.referrer || '';
  state.source = classifyReferrer(state.referrerUrl);

  // ---------- Render ----------
  function render() {
    root.innerHTML = '';
    root.appendChild(buildScreen());
  }

  function buildScreen() {
    return el('div', { class: 'auth-screen' }, [
      buildBrandPanel(),
      el('div', { class: 'auth-form-wrap' }, [state.done ? buildSuccessCard() : buildFormCard()]),
    ]);
  }

  function buildBrandPanel() {
    return el('div', { class: 'auth-brand' }, [
      el('div', { class: 'auth-brand-orb orb-1' }),
      el('div', { class: 'auth-brand-orb orb-2' }),
      el('img', { class: 'brand-mark', src: '/assets/logo-mark.png', alt: 'Hello Inova' }),
      el('div', { class: 'brand-wordmark' }, ['Hello ', el('span', {}, ['Inova'])]),
      el('div', { class: 'brand-tagline' }, ['Da mente às telas']),
      el('div', { class: 'brand-pitch' }, [
        'Conte pra gente o que você precisa. Em poucos minutos alguém do nosso time entra em contato para entender seu projeto.',
      ]),
    ]);
  }

  function buildSuccessCard() {
    return el('div', { class: 'lead-card' }, [
      el('div', { class: 'lead-success' }, [
        el('div', { class: 'success-icon' }, [svgIcon('<path d="M20 6 9 17l-5-5"/>', 26)]),
        el('h1', {}, ['Recebemos seus dados!']),
        el('p', { class: 'sub' }, [
          state.step === 2 && !state.step2Skipped
            ? 'Obrigado por contar mais sobre o seu projeto. Em breve entraremos em contato pelo WhatsApp ou e-mail informado.'
            : 'Em breve entraremos em contato pelo WhatsApp ou e-mail informado.',
        ]),
      ]),
    ]);
  }

  function buildFormCard() {
    return el('div', { class: 'lead-card' }, [
      buildStepper(),
      state.error ? el('div', { class: 'lead-form-error' }, [state.error]) : null,
      state.step === 1 ? buildStep1() : buildStep2(),
    ]);
  }

  function buildStepper() {
    const dot = (n, label) => {
      const cls = n < state.step ? 'step-dot done' : n === state.step ? 'step-dot active' : 'step-dot';
      return el('div', { style: 'display:flex;align-items:center;gap:6px;' }, [
        el('div', { class: cls }, [n < state.step ? '✓' : String(n)]),
        el('span', { class: 'step-label' }, [label]),
      ]);
    };
    return el('div', { class: 'lead-stepper' }, [
      dot(1, 'Seus dados'),
      el('div', { class: 'step-line' }),
      dot(2, 'Sobre o projeto'),
    ]);
  }

  // ---------- Etapa 1 ----------
  function buildStep1() {
    return el('div', {}, [
      el('h1', {}, ['Vamos começar']),
      el('p', { class: 'sub' }, ['Informe seus dados de contato para darmos início à conversa.']),
      field('Nome completo', el('input', {
        type: 'text',
        value: state.step1.name,
        placeholder: 'Seu nome completo',
        oninput: (e) => (state.step1.name = e.target.value),
      })),
      field('WhatsApp', el('input', {
        type: 'tel',
        value: state.step1.whatsapp,
        placeholder: '(11) 91234-5678',
        oninput: (e) => (state.step1.whatsapp = e.target.value),
      })),
      field('E-mail', el('input', {
        type: 'email',
        value: state.step1.email,
        placeholder: 'voce@email.com',
        oninput: (e) => (state.step1.email = e.target.value),
      })),
      el('div', { class: 'lead-actions' }, [
        el('button', {
          class: 'btn btn-primary btn-block',
          disabled: state.submitting ? 'disabled' : null,
          onclick: submitStep1,
        }, [state.submitting ? 'Enviando…' : 'Continuar']),
      ]),
    ]);
  }

  function field(label, inputEl) {
    return el('div', { class: 'field' }, [el('label', {}, [label]), inputEl]);
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
  }

  async function submitStep1() {
    const { name, whatsapp, email } = state.step1;
    if (!name.trim()) return setError('Informe seu nome completo.');
    if (!whatsapp.trim()) return setError('Informe seu WhatsApp.');
    if (!validEmail(email)) return setError('Informe um e-mail válido.');

    state.error = '';
    state.submitting = true;
    render();
    try {
      const data = await api('/leads', {
        method: 'POST',
        body: {
          name: name.trim(),
          whatsapp: whatsapp.trim(),
          email: email.trim(),
          referrer_url: state.referrerUrl,
        },
      });
      state.leadId = data.id;
      state.submitting = false;
      state.step = 2;
      render();
    } catch (err) {
      state.submitting = false;
      setError(err.message);
    }
  }

  function setError(msg) {
    state.error = msg;
    render();
  }

  // ---------- Etapa 2 ----------
  function buildStep2() {
    return el('div', {}, [
      el('h1', {}, ['Sobre o seu projeto']),
      el('p', { class: 'sub' }, ['Essa parte é opcional, mas nos ajuda a te atender melhor.']),
      field('Serviço desejado', buildServiceChips()),
      state.step2.services.includes('Outro') ? el('div', { class: 'lead-other-input' }, [
        el('input', {
          type: 'text',
          value: state.step2.otherService,
          placeholder: 'Qual serviço você precisa?',
          oninput: (e) => (state.step2.otherService = e.target.value),
        }),
      ]) : null,
      field('Ramo de negócio', buildSegmentCombobox()),
      state.step2.businessSegment === 'Outros' ? el('div', { class: 'lead-segment-other' }, [
        el('input', {
          type: 'text',
          value: state.step2.businessSegmentOther,
          placeholder: 'Qual o seu ramo de negócio?',
          oninput: (e) => (state.step2.businessSegmentOther = e.target.value),
        }),
      ]) : null,
      field('Descreva sua necessidade', el('textarea', {
        rows: '4',
        placeholder: 'Conte com detalhes o que você precisa...',
        oninput: (e) => (state.step2.description = e.target.value),
      }, [state.step2.description])),
      el('div', { class: 'lead-actions' }, [
        el('button', {
          class: 'btn btn-primary btn-block',
          disabled: state.submitting ? 'disabled' : null,
          onclick: submitStep2,
        }, [state.submitting ? 'Enviando…' : 'Concluir']),
      ]),
      el('button', { class: 'lead-skip', onclick: skipStep2 }, ['Pular esta etapa']),
    ]);
  }

  function buildServiceChips() {
    return el('div', { class: 'service-chips' }, SERVICES.map((svc) => {
      const checked = state.step2.services.includes(svc);
      return el('label', { class: 'service-chip' + (checked ? ' checked' : '') }, [
        el('input', {
          type: 'checkbox',
          onchange: () => {
            const idx = state.step2.services.indexOf(svc);
            if (idx >= 0) state.step2.services.splice(idx, 1);
            else state.step2.services.push(svc);
            render();
          },
        }),
        el('span', { class: 'chip-check' }, [svgIcon('<path d="M20 6 9 17l-5-5"/>', 11)]),
        svc,
      ]);
    }));
  }

  // Combobox pesquisável do ramo de negócio. Importante: digitar aqui NÃO
  // pode disparar o render() global (que reconstrói a página inteira a
  // cada tecla) — isso destruiria o próprio input em cada keystroke e
  // faria o navegador perder o foco no meio da digitação. Por isso este
  // componente atualiza só o seu próprio dropdown localmente e só chama o
  // render() global no momento em que uma opção é efetivamente escolhida
  // (para revelar/esconder o campo "Outros" no restante do formulário).
  function buildSegmentCombobox() {
    const wrap = el('div', { class: 'combobox' });
    const inputWrap = el('div', { class: 'combobox-input-wrap' });
    const input = el('input', {
      type: 'text',
      placeholder: 'Buscar ramo de negócio...',
      value: state.step2.businessSegment || '',
    });
    const chevron = svgIcon('<path d="m6 9 6 6 6-6"/>', 16);
    chevron.className = 'combobox-chevron';
    inputWrap.appendChild(input);
    inputWrap.appendChild(chevron);
    wrap.appendChild(inputWrap);

    const dropdown = el('div', { class: 'combobox-dropdown' });
    dropdown.style.display = 'none';
    wrap.appendChild(dropdown);

    let outsideClickHandler = null;

    function renderOptions(query) {
      dropdown.innerHTML = '';
      const q = (query || '').toLowerCase();
      const options = BUSINESS_SEGMENTS.filter((s) => s.toLowerCase().includes(q));
      if (!options.length) {
        dropdown.appendChild(el('div', { class: 'combobox-empty' }, ['Nenhum ramo encontrado.']));
        return;
      }
      options.forEach((opt) => {
        const isSelected = opt === state.step2.businessSegment;
        const isOther = opt === 'Outros';
        dropdown.appendChild(el('div', {
          class: 'combobox-option' + (isSelected ? ' selected' : '') + (isOther ? ' other-option' : ''),
          onmousedown: (e) => {
            // preventDefault evita que o input perca o foco (blur) antes do
            // clique ser processado, o que fecharia o dropdown cedo demais.
            e.preventDefault();
            state.step2.businessSegment = opt;
            closeDropdown();
            render();
          },
        }, [opt]));
      });
    }

    function openDropdown() {
      inputWrap.classList.add('open');
      dropdown.style.display = '';
      renderOptions('');
      if (!outsideClickHandler) {
        outsideClickHandler = (e) => {
          if (!wrap.contains(e.target)) closeDropdown();
        };
        document.addEventListener('mousedown', outsideClickHandler);
      }
    }

    function closeDropdown() {
      inputWrap.classList.remove('open');
      dropdown.style.display = 'none';
      input.value = state.step2.businessSegment || '';
      if (outsideClickHandler) {
        document.removeEventListener('mousedown', outsideClickHandler);
        outsideClickHandler = null;
      }
    }

    input.addEventListener('focus', openDropdown);
    input.addEventListener('input', () => renderOptions(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeDropdown(); input.blur(); }
    });

    return wrap;
  }

  async function submitStep2() {
    if (!state.leadId) return skipStep2();
    state.submitting = true;
    render();
    try {
      await api(`/leads/${state.leadId}/step2`, {
        method: 'PATCH',
        body: {
          services: state.step2.services,
          business_segment: state.step2.businessSegment,
          business_segment_other: state.step2.businessSegment === 'Outros' ? state.step2.businessSegmentOther.trim() : '',
          description: buildFinalDescription(),
        },
      });
      state.submitting = false;
      state.done = true;
      render();
    } catch (err) {
      state.submitting = false;
      setError(err.message);
    }
  }

  // Quando "Outro" é marcado em Serviços, anexamos a especificação digitada
  // à descrição para não perder essa informação (o campo services guarda só
  // as opções fixas).
  function buildFinalDescription() {
    let desc = state.step2.description.trim();
    if (state.step2.services.includes('Outro') && state.step2.otherService.trim()) {
      const extra = `Outro serviço: ${state.step2.otherService.trim()}`;
      desc = desc ? `${desc}\n\n${extra}` : extra;
    }
    return desc;
  }

  function skipStep2() {
    state.done = true;
    state.step2Skipped = true;
    render();
  }

  render();
})();
