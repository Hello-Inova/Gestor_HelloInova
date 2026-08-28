# Hello Inova · Gestor de Sistemas

Sistema interno para gestão dos outros sistemas administrados pela **Hello Inova**. Permite cadastrar usuários, fazer login, navegar por módulos e montar páginas livremente com elementos (textos, campos de entrada e botões), posicionando e estilizando cada um.

Identidade visual aplicada em todo o sistema: fundo escuro, gradiente azul, tipografia Poppins/Inter, seguindo o manual de marca da Hello Inova ("Da mente às telas").

## Funcionalidades

- **Cadastro e login de usuários** (senha criptografada, sessão via cookie JWT httpOnly).
- **Recuperação de senha** ("Esqueci minha senha" na tela de login): envia um link por e-mail que abre um pop-up para definir e confirmar a nova senha (com visualizador de senha), redirecionando para o login ao concluir.
- **Menu lateral esquerdo** com os módulos de navegação do sistema.
- **Módulo "Gestor de Sistemas"** (criado automaticamente para todo usuário): cadastre os sistemas geridos pela Hello Inova com nome, link de acesso, e-mail e senha, e use o botão **"Login As"** para abrir o sistema em uma nova aba com a senha copiada para a área de transferência, pronta para colar. Por restrição de segurança dos navegadores (política de mesma origem), não é possível preencher automaticamente o formulário de login de outro site a partir do navegador — por isso o fluxo é "abrir + copiar para colar".
- **Módulos personalizados**: crie quantos módulos quiser além do Gestor de Sistemas, cada um com seu próprio editor de elementos.
- **Edição do nome do módulo** diretamente no menu (duplo clique ou ícone de lápis).
- **Criação e exclusão de módulos**, com reordenação (setas para cima/baixo). O módulo "Gestor de Sistemas" não pode ser excluído.
- **Editor de elementos por módulo**: adicione labels (texto), campos de entrada (input) e botões.
- **Posicionamento livre**: arraste cada elemento para qualquer lugar da página (drag) e redimensione pela alça no canto.
- **Painel de propriedades**: cor da fonte, cor de fundo, tamanho e peso da fonte, arredondamento de borda, posição (X/Y) e tamanho (largura/altura) em %.
- **Modo Editar / Visualizar**: alterna entre montagem da tela e pré-visualização.
- **Responsivo**: layout adaptado para desktop e smartphones (menu lateral vira gaveta em telas pequenas).

## Stack técnica

- **Backend:** Node.js + Express, autenticação com JWT (cookie httpOnly, sessão deslizante) e bcrypt para senhas, login em duas etapas por código enviado por e-mail (Resend).
- **Banco de dados:** Postgres (qualquer provedor — Neon, Supabase, Railway, RDS etc.), acessado via `pg` e a variável de ambiente `DATABASE_URL`. Escolhido no lugar de SQLite em arquivo porque o sistema roda como função serverless na Vercel, onde o disco não é persistente entre execuções.
- **Frontend:** JavaScript puro (SPA sem framework/build step), HTML e CSS, com posicionamento de elementos via drag-and-drop nativo (Pointer Events).

## Como rodar localmente

Pré-requisito: **Node.js 22.5 ou superior** e um banco **Postgres** acessível (local ou hospedado — pode ser o mesmo banco usado em produção, ou um banco separado só para desenvolvimento).

```bash
npm install
cp .env.example .env   # preencha DATABASE_URL, JWT_SECRET, RESEND_API_KEY etc.
npm start
```

O sistema sobe em `http://localhost:3000`. Faça login com uma conta já existente — o cadastro de novas contas independentes não é mais feito pela tela de login (ver "Contas e usuários" abaixo).

Para desenvolvimento com reinício automático:

```bash
npm run dev
```

## Publicar na Vercel

1. Importe este repositório em [vercel.com/new](https://vercel.com/new). O projeto já inclui um `vercel.json` com uma configuração explícita (`builds`/`routes`) apontando para `api/index.js` como única função serverless — isso desliga por completo a detecção automática de framework da Vercel (que em alguns casos empacotava o app incorretamente e tentava usar outro arquivo como ponto de entrada). Não é preciso mexer em "Framework Preset" nas configurações do projeto: quando `vercel.json` define `builds`, a Vercel ignora esse ajuste do painel.
2. Na aba **Storage** do projeto, adicione um banco **Postgres** (ex: integração com Neon) — isso injeta a variável `DATABASE_URL` automaticamente. Se preferir usar outro provedor de Postgres, defina `DATABASE_URL` manualmente em **Settings → Environment Variables**.
3. Ainda em **Environment Variables**, defina: `JWT_SECRET` (uma string aleatória longa), `SYSTEMS_ENC_KEY` (64 caracteres hexadecimais — veja `.env.example` para como gerar; **obrigatória em produção**, sem ela o app trava ao subir), `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`.
4. Faça o deploy. O schema do banco é criado automaticamente na primeira requisição (não é preciso rodar migração manual).

## Estrutura do projeto

```
helloinova-manager/
├── vercel.json           # encaminha toda requisição para a função em api/index.js
├── api/
│   └── index.js          # função serverless usada pela Vercel (reexporta server/index.js)
├── server/
│   ├── index.js         # bootstrap do Express, rotas e arquivos estáticos
│   ├── db.js             # schema e conexão Postgres
│   ├── auth.js           # helpers de autenticação (JWT, bcrypt)
│   ├── crypto.js          # criptografia AES-256-GCM das senhas do Gestor de Sistemas
│   └── routes/
│       ├── auth.js       # /api/auth (login, verificação por e-mail, perfil, usuários da conta)
│       ├── pages.js      # /api/pages (módulos e elementos)
│       ├── systems.js    # /api/systems (sistemas cadastrados no Gestor de Sistemas)
│       └── dashboard.js  # /api/dashboard (resumo gerencial/financeiro)
└── public/                # front-end estático, servido pela própria função Express
    ├── index.html
    ├── styles.css        # identidade visual Hello Inova
    ├── app.js            # toda a lógica do front-end (SPA)
    └── assets/            # logo Hello Inova
```

## Contas e usuários

Não existe mais cadastro público pela tela de login. Um novo usuário só pode ser criado por alguém que já está logado, pelo módulo fixo **"Cadastro de Usuário"** no menu — e esse novo usuário entra automaticamente na mesma conta/espaço de trabalho de quem o criou (mesmos sistemas, assinaturas e dashboard).

A rota de backend `POST /api/auth/register` continua existindo (sem tela própria) para o caso de precisar criar, no futuro, uma conta totalmente nova e independente — ex: outra empresa usando o mesmo sistema.

## Modelo de dados

- **users**: id, name, email, password_hash, role, account_id (conta/espaço de trabalho ao qual pertence), email_verified, created_at
- **pages** (módulos, compartilhados por conta via `account_id`): id, user_id (guarda o `account_id` do dono), name, type (`systems` | `dashboard` | `users` | `canvas`), order_index, created_at
- **elements**: id, page_id, type (`label` | `input` | `button`), content, placeholder, x, y, width, height (em %), font_size, font_color, bg_color, border_radius, font_weight, z_index
- **systems** (compartilhados por conta): id, user_id (guarda o `account_id` do dono), name, url, login_email, login_password_enc (criptografada), categories, subscriptions, contract_file (anexo único de contrato), documentation_files (lista de PDFs da "Documentação Sistêmica"), links (lista livre de links adicionais, nome + URL), created_at, updated_at
- **verification_codes** / **login_attempts**: suporte ao login em duas etapas e à trava de força bruta.
- **password_resets**: tokens de recuperação de senha (link por e-mail), com hash SHA-256 do token, expiração de 30 minutos e uso único.

## Sobre o "Login As"

Navegadores impedem que uma página de um site (nesse caso, o próprio Gestor de Sistemas) leia ou preencha campos de formulário de outro site em outra aba — é a política de mesma origem (same-origin policy), uma proteção de segurança do próprio navegador que nenhuma aplicação web consegue contornar de fora. Por isso o "Login As" abre o sistema de destino em uma nova aba e copia a senha para a área de transferência (o e-mail aparece no aviso), para colar manualmente. Alternativas reais para autofill automático seriam uma extensão de navegador dedicada ou os sistemas de destino oferecerem um endpoint próprio de login single sign-on — nenhuma delas cabe em um app web comum.

## Próximos passos sugeridos

- Papéis/permissões diferenciados entre usuários (ex.: administrador x colaborador).
- Exportar/importar o layout de um módulo em JSON.
- Publicar a página montada como uma URL pública (modo "visualização" já existe internamente).
