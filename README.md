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
- Dashboard com foco do dia, sequência, tempo estudado e ritmo semanal
- Marcação de sessões como concluídas
- Adição de sessão extra
- Visualização do plano semanal
- Tutor IA demonstrativo com respostas simuladas
- Tela de progresso por matéria
- Layout responsivo para desktop e celular

- Cadastro do onboarding salvo em PostgreSQL (tabela `users`, senha com hash bcrypt)
- Tela de login para quem já tem cadastro (e-mail + senha, com verificação via bcrypt)

A integração real com sessão persistente (permanecer logado ao recarregar a página) e API da OpenAI pode ser adicionada sobre esta base.
