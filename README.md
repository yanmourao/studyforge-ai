# StudyForge AI — MVP visual

Protótipo front-end navegável do fluxo principal do StudyForge AI.

## Como executar

O cadastro (passo 1 do onboarding) grava nome, e-mail e senha em uma tabela `users` no PostgreSQL, então agora é necessário rodar o servidor Node:

```bash
npm install
node server.js
```

Depois acesse `http://localhost:3001` (porta configurável em `.env`).

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
```

`SESSION_SECRET` assina o cookie de sessão (login persistente). Gere uma string aleatória, por exemplo com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

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
