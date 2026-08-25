# Hello Inova · Gestor de Sistemas

Sistema interno para gestão dos outros sistemas administrados pela **Hello Inova**. Permite cadastrar usuários, fazer login, criar páginas de navegação e montar cada página livremente com elementos (textos, campos de entrada e botões), posicionando e estilizando cada um.

Identidade visual aplicada em todo o sistema: fundo escuro, gradiente azul, tipografia Poppins/Inter, seguindo o manual de marca da Hello Inova ("Da mente às telas").

## Funcionalidades

- **Cadastro e login de usuários** (senha criptografada, sessão via cookie JWT httpOnly).
- **Menu lateral direito** com as páginas de navegação do sistema.
- **Edição do nome da página** diretamente no menu (duplo clique ou ícone de lápis).
- **Criação e exclusão de páginas**, com reordenação (setas para cima/baixo).
- **Editor de elementos por página**: adicione labels (texto), campos de entrada (input) e botões.
- **Posicionamento livre**: arraste cada elemento para qualquer lugar da página (drag) e redimensione pela alça no canto.
- **Painel de propriedades**: cor da fonte, cor de fundo, tamanho e peso da fonte, arredondamento de borda, posição (X/Y) e tamanho (largura/altura) em %.
- **Modo Editar / Visualizar**: alterna entre montagem da tela e pré-visualização.
- **Responsivo**: layout adaptado para desktop e smartphones (menu lateral vira gaveta em telas pequenas).

## Stack técnica

- **Backend:** Node.js + Express, autenticação com JWT (cookie httpOnly) e bcrypt para senhas.
- **Banco de dados:** SQLite nativo do Node.js (`node:sqlite`, incluso desde o Node 22.5) — sem dependências nativas para compilar, funciona em qualquer máquina com Node atualizado.
- **Frontend:** JavaScript puro (SPA sem framework/build step), HTML e CSS, com posicionamento de elementos via drag-and-drop nativo (Pointer Events).

## Como rodar

Pré-requisito: **Node.js 22.5 ou superior** (para o módulo `node:sqlite`).

```bash
npm install
npm start
```

O sistema sobe em `http://localhost:3000`. Crie sua conta na tela inicial (aba "Cadastre-se") e comece a montar suas páginas.

Para desenvolvimento com reinício automático:

```bash
npm run dev
```

## Estrutura do projeto

```
helloinova-manager/
├── server/
│   ├── index.js        # bootstrap do Express, rotas e arquivos estáticos
│   ├── db.js            # schema e conexão SQLite
│   ├── auth.js          # helpers de autenticação (JWT, bcrypt)
│   └── routes/
│       ├── auth.js      # /api/auth (registro, login, logout, me)
│       └── pages.js     # /api/pages (páginas e elementos)
├── client/
│   └── public/
│       ├── index.html
│       ├── styles.css   # identidade visual Hello Inova
│       ├── app.js       # toda a lógica do front-end (SPA)
│       └── assets/      # logo Hello Inova
└── data/                 # banco SQLite (criado automaticamente, ignorado no git)
```

## Modelo de dados

- **users**: id, name, email, password_hash, role, created_at
- **pages**: id, user_id, name, order_index, created_at
- **elements**: id, page_id, type (`label` | `input` | `button`), content, placeholder, x, y, width, height (em %), font_size, font_color, bg_color, border_radius, font_weight, z_index

## Próximos passos sugeridos

- Papéis/permissões diferenciados entre usuários (ex.: administrador x colaborador).
- Compartilhar páginas entre usuários da mesma organização.
- Exportar/importar o layout de uma página em JSON.
- Publicar a página montada como uma URL pública (modo "visualização" já existe internamente).
