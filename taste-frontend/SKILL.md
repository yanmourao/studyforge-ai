---
name: taste-frontend
description: Padrões de design de agência premium para projetos em HTML/CSS/JS puro. Consolidado a partir de high-end-visual-design, redesign-existing-projects e minimalist-ui (Leonxlnx/taste-skill). Usar sempre que for criar ou redesenhar telas.
source: consolidado de Leonxlnx/taste-skill (13 skills) em 27/09/2026
---

# Skill: Taste Frontend (vanilla CSS/JS)

## Objetivo
Fazer telas parecerem "de agência", não "geradas por IA". Antes de escrever qualquer CSS,
escolher conscientemente 1 arquétipo de cor/textura e 1 arquétipo de layout (seção 1),
depois aplicar o checklist anti-clichê (seção 2) e as regras de motion/estado (seção 3).

## 1. Escolha consciente antes de codar
**Cor/textura (escolher 1):**
- Vidro etéreo: preto profundo (#050505), gradientes radiais sutis, cards com blur pesado e hairlines brancas 10%.
- Editorial de luxo: tons quentes (creme, espresso), serifa variável grande nos títulos, leve grain overlay.
- Estruturalismo suave: fundo claro/prata, tipografia grotesca bold, sombras difusas suaves.

**Layout (escolher 1):**
- Bento assimétrico: grid com cards de tamanhos variados, nunca 3 colunas iguais.
- Cascata em Z: elementos levemente sobrepostos com profundidade.
- Split editorial: tipografia grande de um lado, conteúdo interativo do outro.

Nunca repetir o mesmo arquétipo em duas telas seguidas do mesmo projeto sem motivo.

## 2. Checklist anti-clichê de IA (auditoria rápida)

**Tipografia**
- Nunca Inter/Arial puro em títulos grandes — usar fonte com caráter (Google Fonts: Outfit, Sora, Space Grotesk, Fraunces para serifa).
- Títulos grandes: letter-spacing negativo, line-height apertado.
- Parágrafos: limitar a ~65 caracteres de largura.
- Usar pesos intermediários (500/600), não só 400/700.
- Evitar CAIXA ALTA em todo subtítulo — variar com sentence case.

**Cor**
- Nunca #000000 puro — usar preto levemente tingido (#0a0a0a, #0c0f13 etc — já usado no projeto, ok manter).
- Só 1 cor de destaque (o projeto já usa laranja — não adicionar uma segunda cor de destaque).
- Sombras devem ter a cor tingida do fundo, não preto genérico.
- Evitar gradiente "AI roxo/azul".

**Layout**
- Nunca 3-4 cards idênticos em grid perfeitamente simétrico sem nenhuma quebra — variar tamanho, alinhamento ou introduzir sobreposição.
- Usar `min-height: 100dvh` em vez de `100vh` em seções full-screen (bug de viewport no iOS Safari).
- Container com max-width (1200–1440px), nunca conteúdo esticando full-bleed.
- Alinhar botões de CTA no rodapé dos cards quando o conteúdo tem tamanhos diferentes.

**Interatividade e estados**
- Todo botão precisa de hover (leve scale ou deslocamento) e active (scale 0.98).
- Nunca usar `window.alert()` para feedback de formulário — usar mensagem inline.
- Todo link precisa ir a algum lugar real ou ser desabilitado visualmente — nunca `href="#"` morto.
- Estado ativo de navegação deve estar visualmente claro (já existe `.active` no projeto — manter).
- Scroll de âncora deve ser suave (`scroll-behavior: smooth` — já presente).

**Conteúdo**
- Nunca usar clichês tipo "Eleve", "Sem esforço", "Revolucione" — escrever direto e específico.
- Números "redondos demais" (100%, 50%) soam falsos — preferir dados reais ou realistas.
- Nada de Lorem Ipsum.

**Ícones**
- Evitar ícones-clichê óbvios (foguete para "lançamento", escudo para "segurança") — preferir algo menos batido.
- Padronizar espessura de traço entre todos os ícones da tela.

## 3. Motion (usar com moderação em site institucional simples)
- Nunca `ease-in-out`/`linear` cru em transições importantes — usar cubic-bezier customizado, ex: `cubic-bezier(0.32,0.72,0,1)`.
- Animar só `transform` e `opacity` (nunca `top/left/width/height`) — evita travar no mobile.
- Elementos que entram na viewport: fade-up com `IntersectionObserver` (o projeto já faz isso via `.reveal` — manter e não usar `scroll` listener).
- `backdrop-blur` só em elementos fixos/sticky (navbar), nunca em containers que rolam.

## 4. Prioridade de aplicação (ordem de maior impacto)
1. Troca de fonte (Google Fonts com caráter, não Inter puro no título)
2. Limpeza de paleta (1 destaque só, sombras tingidas)
3. Estados de hover/active em todo elemento clicável
4. Layout e espaçamento (quebrar simetria excessiva, respeitar max-width)
5. Trocar componentes genéricos (cards clichê, badges pill genéricos)
6. Estados de loading/vazio/erro
7. Polimento fino de tipografia e espaçamento

## 5. Regras de execução
- Trabalhar em cima do stack existente (vanilla HTML/CSS/JS) — nunca migrar para framework.
- Não quebrar funcionalidade existente — testar depois de cada mudança.
- Mudanças pequenas e revisáveis, não reescrita total.
- Todo `<img>` precisa de `alt` descritivo real.
