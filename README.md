# StudyForge AI — MVP visual

Protótipo front-end navegável do fluxo principal do StudyForge AI.

## Como executar

Abra o arquivo `index.html` diretamente no navegador ou sirva a pasta com qualquer servidor estático.

Exemplo com Python:

```bash
python -m http.server 5500 --directory outputs/studyforge-ai
```

Depois acesse `http://localhost:5500`.

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

Os arquivos são independentes e não exigem instalação de dependências. A integração real com autenticação, banco PostgreSQL e API da OpenAI pode ser adicionada sobre esta base.
