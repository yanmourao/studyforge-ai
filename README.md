# StudyForge AI — MVP visual

Protótipo front-end navegável do fluxo principal do StudyForge AI.

## Como executar

O cadastro (passo 1 do onboarding) grava nome, e-mail e senha em uma tabela `users` no PostgreSQL, então agora é necessário rodar o servidor Node:

```bash
npm install
node server.js   # ou: npm start  (Express sozinho, mesmo modo do Render)
npm run dev      # alternativa: Next.js, mesmo modo da Vercel
```

Depois acesse `http://localhost:3001` (porta configurável em `.env`).

## Deploy

Os dois caminhos rodam o **mesmo** `server.js`:

- **Vercel (padrão):** `next build`; `pages/api/[...path].js` entrega todas as
  rotas `/api/*` ao app Express e o front (`public/`) sai como estático.
  Configure as variáveis de ambiente no painel (`DATABASE_URL`,
  `SESSION_SECRET`, `STRIPE_*`).
- **Render (opcional):** `render.yaml`, `npm start` → `node server.js`, que
  serve `public/` e as APIs na mesma porta.

> **O servidor precisa estar rodando.** Se `http://localhost:3001` mostrar
> `ERR_CONNECTION_REFUSED` / "recusou estabelecer ligação", é porque o processo
> Node não está ativo (fechou o terminal, reiniciou o PC, etc.). Basta rodar
> `node server.js` de novo na pasta do projeto e recarregar a página. O
> processo fica ativo enquanto o terminal estiver aberto — feche-o com `Ctrl+C`.

As credenciais do banco ficam em `.env` (não versionado):

```
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=admin
PGDATABASE=studyforge
PORT=3001
SESSION_SECRET=uma-string-aleatoria-longa
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
# Opcionais de segurança
ALLOWED_ORIGINS=https://yanmourao.github.io,https://outra-origem.com
TURNSTILE_SECRET=0x...
```

`SESSION_SECRET` assina o cookie de sessão (login persistente) e agora é **obrigatório** (mínimo 16 caracteres) — o servidor recusa iniciar sem ele. Gere uma string aleatória, por exemplo com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

`ALLOWED_ORIGINS` define a lista branca de origens aceitas pelo CORS (separadas por vírgula). Requisições de qualquer outra origem não recebem o header `Access-Control-Allow-Origin` e são bloqueadas pelo navegador. Em produção nunca é usado curinga (`*`). Em dev, `http://localhost:<PORT>` é liberado automaticamente.

`TURNSTILE_SECRET` (opcional) ativa a verificação anti-robô do [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) nas rotas de login e cadastro. Sem ele, a verificação é ignorada (dev funciona normalmente). Para ativar no front, adicione o widget na tela de login/cadastro e envie o token no corpo da requisição como `turnstileToken`:

```html
<!-- no index.html -->
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<div class="cf-turnstile" data-sitekey="SUA_SITE_KEY" data-callback="onTurnstile"></div>
```
```js
// no app.js: capture o token e inclua no fetch de /api/login e /api/signup
window.onTurnstile = (token) => { state.turnstileToken = token; };
// ...body: JSON.stringify({ email, password, turnstileToken: state.turnstileToken })
```

### Camadas de segurança já aplicadas
- Sessão em cookie `HttpOnly` + `Secure`/`SameSite=None` em produção (nunca em `localStorage`)
- CORS por lista branca (sem curinga com credenciais)
- Rate limiting em memória: login (10/15min), cadastro (8/h), checkout (20/h) por IP → respondem `429`
- Validação rígida no backend: formato de e-mail, tamanho de senha (6–200), IDs inteiros positivos, horário `HH:MM`, limites de tamanho e de itens; corpo JSON limitado a 16 KB
- Login com mensagem genérica **e** tempo de resposta constante (bcrypt sempre executado) para evitar enumeração de e-mails
- `SESSION_SECRET` obrigatório na inicialização

As três variáveis `STRIPE_*` são opcionais — sem elas o servidor funciona normalmente, só a assinatura do StudyForge Plus fica indisponível (`POST /api/billing/checkout` responde 503). Para habilitar:
1. Crie uma conta em [stripe.com](https://stripe.com) e um produto recorrente (ex: R$ 19,90/mês)
2. Copie a **Secret key** (`Developers → API keys`) para `STRIPE_SECRET_KEY`
3. Copie o **Price ID** do produto para `STRIPE_PRICE_ID`
4. Configure um webhook em `Developers → Webhooks` apontando para `<sua-url>/api/billing/webhook`, escutando `checkout.session.completed`, `customer.subscription.updated` e `customer.subscription.deleted`, e copie o **Signing secret** para `STRIPE_WEBHOOK_SECRET`

Para recriar a tabela `users` do zero (apaga todos os cadastros existentes):

```bash
node scripts/setup-db.js
```

## O que está implementado

- Landing page responsiva com apresentação do produto
- Onboarding em três etapas
- Escolha de objetivo, prazo, carga horária, nível e matérias
- Geração simulada de plano com estado de carregamento
- Cadastro e login salvos em PostgreSQL (tabela `users`, senha com hash bcrypt), com sessão persistente por cookie
- Sessões de estudo reais na tabela `study_sessions`: marcar como concluída e adicionar sessão extra gravam no banco
- Dashboard 100% orientado a dados reais do usuário: foco do dia, sequência de dias estudados, tempo estudado na semana, ritmo semanal, horas nos últimos 30 dias e domínio por matéria são todos calculados a partir das sessões registradas (sem números fixos de demonstração)
- Visualização do plano semanal (sugestão gerada a partir das matérias escolhidas, com datas reais)
- Tutor IA demonstrativo com respostas simuladas
- Layout responsivo para desktop e celular
- Assinatura paga (StudyForge Plus) via Stripe Checkout, com 7 dias de teste grátis, liberando o Tutor IA; webhook mantém o plano do usuário sincronizado no banco

A integração real com API da OpenAI (tutor e geração de plano) pode ser adicionada sobre esta base.
