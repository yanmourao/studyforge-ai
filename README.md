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
```

`SESSION_SECRET` assina o cookie de sessão (login persistente). Gere uma string aleatória, por exemplo com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

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

A integração real com API da OpenAI (tutor e geração de plano) pode ser adicionada sobre esta base.
