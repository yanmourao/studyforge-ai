# Handoff — StudyForge AI (sessão de 02/08/2026)

Documento para quem (pessoa ou IA) continuar o trabalho. Leia o `CLAUDE.md`
primeiro: ele descreve a arquitetura. Este arquivo cobre só **o que mudou nesta
sessão e o que falta fazer**.

---

## Estado atual

O app tem paywall obrigatório funcionando de ponta a ponta em **modo teste** do
Stripe. Nada foi commitado ainda.

### O que foi implementado nesta sessão

**1. Recuperação de senha por e-mail** (`server.js`, `public/app.js`, `public/index.html`)

- `POST /api/password/forgot` → e-mail com link → `POST /api/password/reset`.
- Token = `HMAC(SESSION_SECRET, "reset:" + payload + password_hash atual)`, 1h de
  validade. Como o hash entra na assinatura, trocar a senha invalida todos os
  links pendentes: **uso único sem tabela de tokens**, nenhuma migração.
- E-mail via API HTTP do Resend em `sendEmail()` (`fetch` puro, sem SDK). Sem
  `RESEND_API_KEY` o link é impresso no log do servidor — dev funciona sem config.
- Front: dois `.form-step` novos no card de login (`#forgot-form`, `#reset-form`).
  O link chega como `/?reset=<token>` e `handlePasswordResetLink()` abre o
  formulário em vez de restaurar a sessão.
- Teste: `npm test` → `scripts/test-reset-token.js` (assinatura, uso único,
  payload adulterado, expiração). **Único teste do repo; mantenha passando.**

**2. Paywall obrigatório** (`server.js`, `db.js`, front)

- `requirePlus` bloqueia com **402** as rotas `/api/dashboard`, `/api/sessions`
  (inclui `/:id/toggle`) e `/api/syllabus`. Uma linha de `app.use` com prefixos.
- `/api/profile` ficou **de fora de propósito**: o onboarding precisa salvar o
  perfil antes de o usuário chegar ao checkout. Não adicione o gate lá.
- `/api/me` também fica fora — o front precisa ler o `plan` para decidir a tela.
- Front: `enterAppOrPaywall()` nos três pontos de entrada (login, fim do
  onboarding, restauração de sessão) → tela `#paywall-screen`.
- Se o dashboard receber 402 no meio da sessão (assinatura venceu), volta ao
  paywall automaticamente.
- **Contas antigas foram liberadas**: `db.js` `ensureSchema()` tem um UPDATE
  idempotente que marca `plan='plus'` para quem tem `created_at < '2026-08-02'`
  e nunca passou pelo Stripe. Foram 11 contas. Não remova esse UPDATE sem
  entender que ele é o que impede os usuários antigos de perderem acesso.

**3. Stripe** (`server.js`)

- Checkout hospedado, `mode: "subscription"`, **5 dias** de teste grátis.
- `integration_identifier: "studyforge-plus-qkzvhrmt"` (rótulo fixo no Dashboard).
- **Nunca** passar `payment_method_types` — é o erro nº 1 do guia da Stripe;
  omitir ativa os métodos dinâmicos. Está omitido, mantenha assim.
- `POST /api/billing/portal` → Customer Portal (cancelar, trocar cartão, faturas).
  Acessível em **Configurações → Assinatura → "Gerenciar assinatura"**. O mesmo
  botão vira "Assinar" para quem não tem plano.
- Webhook: `ACTIVE_SUBSCRIPTION_STATUSES = {active, trialing, past_due}`.
  `past_due` **mantém** o acesso de propósito — a Stripe ainda está tentando
  cobrar (dunning); cortar na primeira falha de cartão puniria quem só precisa
  atualizar o meio de pagamento.
- Webhook registrado com `express.raw()` **antes** do `express.json()` global.
  Não mexa nessa ordem, a verificação de assinatura precisa do corpo bruto.

**4. Landing** — removido o bloco `.hero-proof` ("2.400+ estudantes" e os avatares
MC/JP/AL, todos inventados). O CSS de `.hero-proof`/`.avatar-stack` ficou órfão
em `styles.css` (linhas ~91-93 e nos dois media queries) — apagar é opcional.

**5. Estilo** — nova classe `.button-outline` (borda fina, texto vira `var(--ink)`
no hover). Usa variável em vez de `#000` para não quebrar o modo escuro.

### Configuração do Stripe já feita (modo TESTE)

- `.env` tem `STRIPE_SECRET_KEY` (chave restrita `rk_test_`), `STRIPE_PRICE_ID`,
  `STRIPE_WEBHOOK_SECRET`.
- Portal do cliente configurado no sandbox: cancelamento ligado, atualização de
  forma de pagamento ligada, histórico de faturas ligado. A opção
  **"Cancelar no fim do período de faturamento"** foi a escolhida (o cliente usa
  o que pagou até o fim; nada de rateio/reembolso).
- Fluxo testado no navegador com o cartão `4242 4242 4242 4242`: checkout →
  webhook → dashboard abre sozinho → portal abre e permite cancelar.

---

## O que falta fazer

### 1. Commitar (nada foi commitado)

9 arquivos modificados + `scripts/test-reset-token.js` novo. Sugestão de divisão:
recuperação de senha / paywall / Stripe (portal + trial + past_due) / landing.
`git status` para ver a lista. O `.gitignore` tem uma mudança acidental de fim de
arquivo (só removeu a quebra de linha final) — pode reverter.

### 2. Configurar o Stripe em produção (modo Live)

**Nenhuma mudança de código.** Teste e produção são contas separadas na Stripe;
nada atravessa. Refazer no modo Live:

1. **Produto e Price** — a página do produto tem botão de copiar para produção;
   senão recriar. O `price_` de produção é diferente do de teste.
2. **Chave** `rk_live_` restrita. Permissões mínimas do código atual:
   Checkout Sessions → Write, Customers → Write, **Billing Portal Sessions →
   Write** (essa é necessária para `/api/billing/portal`). Se o portal der 500
   em produção, é permissão faltando na chave, não bug.
3. **Webhook** pela tela de webhooks (não `stripe listen`, que é só localhost):
   `https://SEU-APP.vercel.app/api/billing/webhook`, eventos
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Gera um `whsec_` diferente.
4. **Portal do cliente** — refazer os interruptores no modo Live; a configuração
   feita até agora vale só para o sandbox.

Os três valores vão em **Vercel → Settings → Environment Variables** (o `.env`
local continua com as chaves de teste, permanentemente).

**Pré-requisito:** a conta Stripe precisa estar ativada (dados da empresa, conta
bancária). A revisão pode levar dias — adiantar isso antes do resto.

### 3. Configurar o envio real de e-mail

Sem `RESEND_API_KEY` a recuperação de senha **não envia nada**, só escreve o link
no log. Em produção isso significa que ninguém recupera a senha. Falta:
criar conta no Resend, verificar um domínio, e definir `RESEND_API_KEY` e
`MAIL_FROM` (com o domínio verificado) local e na Vercel. O padrão
`onboarding@resend.dev` só entrega para o e-mail do dono da conta Resend.

### 4. Tutor de IA foi REMOVIDO (não é pendência)

Removido por decisão do dono: view do dashboard, `tutorReply()`,
`submitTutor()`, `addChatMessage()`, o `#chat-form` e as promessas na landing.
O motivo é que ele só devolvia strings fixas, e o paywall passou a cobrar por
isso. Não reintroduza uma versão simulada. Se voltar, tem que ser uma rota
`POST /api/tutor` chamando um LLM de verdade.

As regras `.chat-*` / `.tutor-*` em `styles.css` ficaram órfãs de propósito:
várias dividem lista de seletores com regras vivas (`.plan-status i, .tutor-online i`
e o media query da linha ~308), então apagar sem cuidado quebra estilo em uso.

### 5. Não existe preço em lugar nenhum do site

A landing tem uma âncora `#pricing` que aponta para uma seção de **citação**, não
de planos. O usuário chega ao paywall sem nunca ter visto quanto custa. Falta uma
seção de preço na landing.

### 6. Pendências menores

- E-mails automáticos de "seu teste acaba em X dias" — ativar em
  Settings → Billing no Dashboard. Reduz contestação de cartão (chargeback).
- `automatic_tax`: **não ativar** sem antes ter registro fiscal ativo no Stripe
  Tax. Sem registro a Stripe calcula zero imposto e **não retorna erro** — o
  erro mais comum do Stripe Tax.
- Revisão espaçada: o comentário em `app.js` (~linha 453) diz que tópicos
  dominados voltam para revisão, mas não existe coluna de data em
  `syllabus_progress` — sem `reviewed_at` não há repetição espaçada de verdade.
- CSS órfão do `.hero-proof` (ver acima).

---

## Como rodar e testar

```bash
node server.js        # porta 3001, precisa do .env
npm test              # scripts/test-reset-token.js
```

Webhook em desenvolvimento, em um terminal separado que fica aberto:

```bash
stripe listen --forward-to localhost:3001/api/billing/webhook
```

Ele imprime um `whsec_` próprio — esse é o valor de `STRIPE_WEBHOOK_SECRET` para
desenvolvimento (diferente do de produção). Reiniciar o server depois de colar.

**Para ver o paywall é preciso criar uma conta nova**: as contas anteriores a
02/08/2026 foram liberadas e vão direto ao dashboard.

Não há linter e não há framework de teste. Verificação é rodar o server e usar o
app no navegador. `public/index.html`, `public/app.js` e `public/styles.css` são
editados direto, sem build — **não converter o SPA para React**.

## Avisos

- **Nunca** pedir ou aceitar chaves do Stripe/Resend colados no chat. Elas vão no
  `.env` (que está no `.gitignore`, verificado: nunca foi commitado) e nas
  variáveis da Vercel. O código só lê por nome de variável.
- Texto de usuário renderizado com `innerHTML` tem que passar por `escapeHtml()`
  — vale no front e no corpo do e-mail (`server.js` tem seu próprio `escapeHtml`).
- Migrações vão em `db.js` `ensureSchema()`, idempotentes, sem arquivos separados.
