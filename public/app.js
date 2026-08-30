// Quando o front-end roda no GitHub Pages, ele precisa apontar para o
// backend hospedado separadamente (Render). Em desenvolvimento local
// (mesma origem do server.js) usamos caminho relativo.
const API_BASE = window.location.hostname.endsWith("github.io")
  ? "https://studyforge-ai-ccer.onrender.com"
  : "";

const WEEKDAY_LABELS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

const state = {
  step: 1,
  currentView: "overview",
  user: {
    name: "Estudante",
    plan: "free",
    objective: "ENEM",
    days: 90,
    hours: 2,
    studyTimeStart: "08:00",
    studyTimeEnd: "10:00",
    // null = perfil ainda não salvou uma escolha explícita; o plano cai no
    // padrão de 60min (ver renderWeekPlan).
    breakMinutes: null,
    level: "Intermediário",
    subjects: []
  },
  sessions: [],
  // Blocos de estudo previstos para hoje, preenchido por renderWeekPlan().
  todayPlan: [],
  // Edições manuais de um bloco do plano: chave "dia-posição" -> {subject, topic}.
  // Só nesta sessão do navegador — o plano é gerado de novo a cada render, não
  // existe linha no banco para persistir isso.
  planOverrides: {},
  // Domínio de cada tópico da ementa: chave "Matéria|||Tópico" -> status
  // ("unknown" | "learning" | "mastered").
  syllabus: {},
  // Duração escolhida para o bloco de cada tópico: mesma chave, valor em minutos.
  // Sem entrada aqui, o plano usa TOPIC_MINUTES_DEFAULT.
  topicMinutes: {},
  // Tópicos com 2h+ de estudo ainda em "Não sei", vindos do dashboard, e os que
  // a pessoa dispensou nesta visita (o servidor segue mandando enquanto o
  // estado não mudar; sem isso a notificação voltaria a cada sessão marcada).
  studyAlerts: [],
  dismissedAlerts: new Set(),
  // Janela temporal selecionada na view de progresso ("Últimos 30 dias" etc.).
  // Vai como ?range= no /api/dashboard e define o período dos cards de horas,
  // gráfico grande e horas por matéria.
  progressRange: "30d"
};

// Cada janela do seletor de datas da view de progresso. startAgo/endAgo são
// "dias atrás" (0 = hoje): o intervalo vai de hoje-startAgo até hoje-endAgo.
// bucketDays agrupa dias por barra no gráfico grande (mantém ~12 barras, como
// antes, para não mudar a densidade visual do card).
const PROGRESS_RANGES = {
  today: { label: "Hoje", note: "hoje", startAgo: 0, endAgo: 0, bucketDays: 1 },
  yesterday: { label: "Ontem", note: "ontem", startAgo: 1, endAgo: 1, bucketDays: 1 },
  "7d": { label: "Últimos 7 dias", note: "nos últimos 7 dias", startAgo: 6, endAgo: 0, bucketDays: 1 },
  "30d": { label: "Últimos 30 dias", note: "nos últimos 30 dias", startAgo: 29, endAgo: 0, bucketDays: 3 },
  "2m": { label: "Último bimestre", note: "nos últimos 60 dias", startAgo: 59, endAgo: 0, bucketDays: 5 },
  "6m": { label: "Último semestre", note: "nos últimos 6 meses", startAgo: 181, endAgo: 0, bucketDays: 16 }
};

// Ementa de referência por matéria (conteúdos típicos de prova).
const SYLLABUS = {
  "Matemática": ["Funções (afim, quadrática, exponencial)", "Logaritmos", "Progressões (PA e PG)", "Geometria plana", "Geometria espacial", "Trigonometria", "Análise combinatória", "Probabilidade", "Estatística e gráficos", "Matemática financeira"],
  "Português": ["Interpretação de texto", "Gêneros textuais", "Figuras de linguagem", "Funções da linguagem", "Variação linguística", "Sintaxe (período e oração)", "Concordância verbal e nominal", "Regência", "Crase", "Redação dissertativa-argumentativa"],
  "Biologia": ["Citologia", "Bioquímica celular", "Genética", "Evolução", "Ecologia", "Fisiologia humana", "Botânica", "Zoologia", "Microbiologia e doenças", "Biotecnologia"],
  "História": ["Antiguidade clássica", "Idade Média", "Grandes navegações", "Brasil colônia", "Iluminismo e revoluções", "Independência do Brasil", "República brasileira", "Era Vargas", "Guerras mundiais", "Guerra Fria e mundo atual"],
  "Física": ["Cinemática", "Leis de Newton", "Trabalho e energia", "Hidrostática", "Termologia e calorimetria", "Óptica geométrica", "Ondulatória", "Eletrostática", "Eletrodinâmica (circuitos)", "Eletromagnetismo"],
  "Química": ["Estrutura atômica", "Tabela periódica", "Ligações químicas", "Funções inorgânicas", "Reações químicas", "Estequiometria", "Soluções e concentração", "Termoquímica", "Química orgânica", "Eletroquímica"]
};

// Ementas que variam por objetivo. Como o objetivo agora é fixo (ENEM),
 // mantemos apenas a base SYLLABUS. O SYLLABUS_OVERRIDES foi removido.

const SYLLABUS_STATUS_WEIGHT = { mastered: 1, learning: 0.5, unknown: 0 };
const SYLLABUS_STATUS_LABEL = { mastered: "Já domino", learning: "Estudando", unknown: "Não sei" };

// Tópicos que aparecem com mais frequência no ENEM, para ganharem a tag
// "cai muito" na ementa. A lista vem do padrão recorrente das provas (ENEM cobra
// muito leitura de gráfico, porcentagem, ecologia e atualidades, e quase não
// cobra trigonometria ou Idade Média) — é curadoria, não uma contagem questão
// por questão. Mantenha ~5 por matéria: se tudo virar destaque, nada é destaque.
const HIGH_FREQUENCY_TOPICS = {
  "Matemática": ["Funções (afim, quadrática, exponencial)", "Geometria plana", "Probabilidade", "Estatística e gráficos", "Matemática financeira"],
  "Português": ["Interpretação de texto", "Gêneros textuais", "Funções da linguagem", "Variação linguística", "Redação dissertativa-argumentativa"],
  "Biologia": ["Citologia", "Genética", "Ecologia", "Fisiologia humana", "Microbiologia e doenças"],
  "História": ["Iluminismo e revoluções", "República brasileira", "Era Vargas", "Guerras mundiais", "Guerra Fria e mundo atual"],
  "Física": ["Cinemática", "Leis de Newton", "Trabalho e energia", "Termologia e calorimetria", "Eletrodinâmica (circuitos)"],
  "Química": ["Reações químicas", "Estequiometria", "Soluções e concentração", "Química orgânica", "Eletroquímica"]
};

const HIGH_FREQUENCY_KEYS = new Set(
  Object.entries(HIGH_FREQUENCY_TOPICS).flatMap(([subject, topics]) => topics.map((topic) => syllabusKey(subject, topic)))
);

// A curadoria acima é do ENEM (objetivo fixo).
function isHighFrequency(subject, topic) {
  return HIGH_FREQUENCY_KEYS.has(syllabusKey(subject, topic));
}

// Dificuldade por tópico, agrupada por nível para ser fácil de reordenar. O
// critério é carga conceitual e abstração — o que costuma travar estudante —,
// não índice de acerto medido: é curadoria, igual à lista de frequência acima.
const TOPIC_DIFFICULTY = {
  "Matemática": {
    facil: ["Estatística e gráficos", "Matemática financeira"],
    medio: ["Funções (afim, quadrática, exponencial)", "Progressões (PA e PG)", "Geometria plana", "Probabilidade"],
    dificil: ["Logaritmos", "Geometria espacial", "Trigonometria", "Análise combinatória"]
  },
  "Português": {
    facil: ["Gêneros textuais", "Figuras de linguagem", "Variação linguística"],
    medio: ["Interpretação de texto", "Funções da linguagem", "Concordância verbal e nominal"],
    dificil: ["Sintaxe (período e oração)", "Regência", "Crase", "Redação dissertativa-argumentativa"]
  },
  "Biologia": {
    facil: ["Evolução", "Ecologia", "Microbiologia e doenças"],
    medio: ["Citologia", "Fisiologia humana", "Zoologia", "Biotecnologia"],
    dificil: ["Bioquímica celular", "Genética", "Botânica"]
  },
  "História": {
    facil: ["Grandes navegações", "Guerras mundiais"],
    medio: ["Antiguidade clássica", "Idade Média", "Brasil colônia", "Independência do Brasil", "Era Vargas", "Guerra Fria e mundo atual"],
    dificil: ["Iluminismo e revoluções", "República brasileira"]
  },
  "Física": {
    facil: ["Cinemática"],
    medio: ["Leis de Newton", "Trabalho e energia", "Hidrostática", "Termologia e calorimetria", "Eletrodinâmica (circuitos)"],
    dificil: ["Óptica geométrica", "Ondulatória", "Eletrostática", "Eletromagnetismo"]
  },
  "Química": {
    facil: ["Estrutura atômica", "Tabela periódica"],
    medio: ["Ligações químicas", "Funções inorgânicas", "Reações químicas", "Soluções e concentração"],
    dificil: ["Estequiometria", "Termoquímica", "Química orgânica", "Eletroquímica"]
  }
};

const TOPIC_DIFFICULTY_LABEL = { facil: "fácil", medio: "médio", dificil: "difícil" };

const TOPIC_DIFFICULTY_KEYS = new Map();
Object.entries(TOPIC_DIFFICULTY).forEach(([subject, levels]) => {
  Object.entries(levels).forEach(([level, topics]) => {
    topics.forEach((topic) => TOPIC_DIFFICULTY_KEYS.set(syllabusKey(subject, topic), level));
  });
});

// "" quando o tópico não está classificado (custom do aluno, SAT, etc.).
function topicDifficulty(subject, topic) {
  return TOPIC_DIFFICULTY_KEYS.get(syllabusKey(subject, topic)) || "";
}

// Resumo de apoio por tópico, exibido dentro da ementa. Tópicos sem entrada
// aqui simplesmente não mostram resumo; `image`
// é opcional. As imagens vêm do Wikimedia Commons via Special:FilePath, que
// resolve sempre para a versão atual do arquivo.
const COMMONS = (file, width = 520) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;

const TOPIC_CONTENT = {
  "Matemática": {
    "Funções (afim, quadrática, exponencial)": {
      summary: "Uma função liga cada entrada x a uma única saída f(x). A afim tem gráfico de reta e taxa de variação constante. A quadrática desenha uma parábola, com concavidade para cima quando a > 0. A exponencial cresce (ou decai) por multiplicação, não por soma — é o que aparece em juros e população.",
      formula: "Afim: f(x) = ax + b   ·   Quadrática: f(x) = ax² + bx + c   ·   Vértice: x = −b/2a   ·   Exponencial: f(x) = a·bˣ",
      image: COMMONS("Polynomialdeg2.svg"),
      caption: "Parábola de uma função quadrática, com raízes e vértice."
    },
    "Logaritmos": {
      summary: "Logaritmo é o expoente que falta: log_b(x) responde \"a que potência elevo b para chegar em x?\". Serve para transformar multiplicação em soma, o que resolve equações onde a incógnita está no expoente. Escalas Richter, pH e decibéis são logarítmicas.",
      formula: "log_b(x) = y ⟺ bʸ = x   ·   log(a·b) = log a + log b   ·   log(aⁿ) = n·log a",
      image: COMMONS("Logarithm_plots.png"),
      caption: "Curvas de log em bases diferentes — todas passam por (1, 0)."
    },
    "Progressões (PA e PG)": {
      summary: "Na PA cada termo soma uma razão constante ao anterior; na PG, multiplica. Reconhecer qual das duas é o caso costuma ser metade da questão: se a diferença entre termos é fixa, é PA; se o quociente é fixo, é PG.",
      formula: "PA: aₙ = a₁ + (n−1)r   ·   Sₙ = n(a₁+aₙ)/2\nPG: aₙ = a₁·qⁿ⁻¹   ·   Sₙ = a₁(qⁿ−1)/(q−1)",
      image: COMMONS("Arithmetic_progression.svg"),
      caption: "Progressão aritmética representada geometricamente."
    },
    "Geometria plana": {
      summary: "Áreas, perímetros e semelhança de figuras no plano. A maior parte das questões cai em triângulos: soma dos ângulos internos igual a 180°, Pitágoras no retângulo e semelhança quando os ângulos coincidem. Vale decorar as áreas básicas.",
      formula: "Triângulo: A = b·h/2   ·   Círculo: A = πr², C = 2πr   ·   Pitágoras: a² = b² + c²",
      image: COMMONS("Triangle_illustration.svg"),
      caption: "Elementos de um triângulo: base, altura e ângulos."
    },
    "Geometria espacial": {
      summary: "Volumes e áreas de superfície dos sólidos. O padrão que economiza memória: todo prisma e cilindro é área da base vezes altura, e toda pirâmide e cone é um terço disso. A esfera é o único caso que foge e precisa ser decorado.",
      formula: "Prisma/cilindro: V = A_base·h   ·   Pirâmide/cone: V = A_base·h/3   ·   Esfera: V = 4πr³/3, A = 4πr²",
      image: COMMONS("Platonic_Solids_Transparent.svg"),
      caption: "Os cinco sólidos platônicos."
    },
    "Trigonometria": {
      summary: "Relaciona ângulos e lados. No triângulo retângulo, seno é cateto oposto sobre hipotenusa, cosseno é adjacente sobre hipotenusa, tangente é a razão entre os dois. O ciclo trigonométrico estende essas razões para qualquer ângulo e explica a periodicidade das funções.",
      formula: "sen²x + cos²x = 1   ·   tg x = sen x / cos x\nLei dos senos: a/sen A = b/sen B = c/sen C   ·   Lei dos cossenos: a² = b² + c² − 2bc·cos A",
      image: COMMONS("Unit_circle_angles_color.svg"),
      caption: "Ciclo trigonométrico com os ângulos notáveis."
    },
    "Análise combinatória": {
      summary: "Conta possibilidades sem listar uma a uma. A pergunta que decide a fórmula é: a ordem importa? Se sim, é arranjo ou permutação; se não, é combinação. O princípio multiplicativo resolve boa parte dos casos sozinho.",
      formula: "Permutação: Pₙ = n!   ·   Arranjo: A(n,p) = n!/(n−p)!   ·   Combinação: C(n,p) = n!/(p!(n−p)!)",
      image: COMMONS("Pascal's_triangle_5.svg"),
      caption: "Triângulo de Pascal — cada linha traz as combinações C(n,p)."
    },
    "Probabilidade": {
      summary: "Probabilidade é casos favoráveis sobre casos possíveis, num espaço amostral equiprovável. Eventos independentes multiplicam; eventos mutuamente exclusivos somam. Quando o enunciado pede \"pelo menos um\", calcular o complementar costuma ser bem mais rápido.",
      formula: "P(A) = favoráveis / possíveis   ·   P(A ∪ B) = P(A) + P(B) − P(A ∩ B)\nIndependentes: P(A ∩ B) = P(A)·P(B)   ·   Complementar: P(não A) = 1 − P(A)",
      image: COMMONS("Dice_Distribution_(bar).svg"),
      caption: "Distribuição da soma de dois dados — o 7 é o resultado mais provável."
    },
    "Estatística e gráficos": {
      summary: "Média, mediana e moda resumem um conjunto; desvio padrão diz o quanto ele se espalha. A mediana resiste a valores extremos e a média não — é a diferença que quase toda questão de interpretação explora. Boa parte da prova é ler gráfico com atenção ao eixo.",
      formula: "Média = Σxᵢ/n   ·   Mediana = valor central (dados ordenados)\nDesvio padrão = √(Σ(xᵢ − x̄)²/n)",
      image: COMMONS("Standard_deviation_diagram.svg"),
      caption: "Curva normal: 68% dos dados a um desvio padrão da média."
    },
    "Matemática financeira": {
      summary: "Juros simples incidem sempre sobre o valor inicial; juros compostos incidem sobre o montante acumulado, e por isso crescem exponencialmente. Em prazos longos a diferença entre os dois é enorme — é o que a maioria das questões quer que você perceba.",
      formula: "Simples: M = C(1 + i·t)   ·   Compostos: M = C(1 + i)ᵗ\nAtenção: taxa e tempo precisam estar na mesma unidade.",
      image: COMMONS("Exponential.svg"),
      caption: "Crescimento exponencial — o formato dos juros compostos."
    }
  },
  "Português": {
    "Interpretação de texto": {
      summary: "A maior parte dos erros não é de vocabulário, é de desatenção ao que o enunciado pede. Separe o que o texto afirma do que você supõe: inferência é o que decorre do texto, não o que combina com ele. Alternativas erradas costumam ser verdadeiras no mundo, mas ausentes no texto.",
      formula: "Roteiro: 1) ler o enunciado antes do texto  2) marcar tese e argumentos  3) eliminar alternativas que extrapolam  4) conferir advérbios de intensidade (sempre, nunca, apenas)"
    },
    "Gêneros textuais": {
      summary: "Cada gênero tem função, suporte e público. Notícia informa, editorial opina, crônica narra o cotidiano, charge critica pela imagem, verbete define. Identificar o gênero já entrega o objetivo comunicativo, que é o que quase toda questão cobra.",
      formula: "Narrativo: enredo, tempo, espaço  ·  Descritivo: características  ·  Dissertativo: tese + argumentos  ·  Injuntivo: instrução (receita, manual, bula)"
    },
    "Figuras de linguagem": {
      summary: "São desvios intencionais que produzem efeito de sentido. A prova raramente pede o nome pelo nome: ela pergunta qual efeito a figura causa no texto. Metáfora e metonímia são as mais cobradas — a metáfora compara por semelhança, a metonímia troca por proximidade.",
      formula: "Metáfora: \"ele é uma fera\"  ·  Metonímia: \"li Machado\"  ·  Hipérbole: exagero  ·  Ironia: diz o oposto  ·  Eufemismo: suaviza  ·  Antítese: opõe  ·  Personificação: dá vida ao inanimado"
    },
    "Funções da linguagem": {
      summary: "Cada função destaca um elemento da comunicação. Referencial foca no assunto (notícia), emotiva no emissor (diário), conativa no receptor (propaganda), fática no canal (\"alô?\"), metalinguística no próprio código (dicionário) e poética na mensagem.",
      formula: "Emissor → emotiva  ·  Receptor → conativa  ·  Referente → referencial  ·  Canal → fática  ·  Código → metalinguística  ·  Mensagem → poética"
    },
    "Variação linguística": {
      summary: "Não existe português \"errado\", existe variedade inadequada ao contexto. As variações são regionais (diatópicas), sociais (diastráticas), históricas (diacrônicas) e de situação (diafásicas). O preconceito linguístico é tema recorrente de redação e de interpretação.",
      formula: "Norma-padrão = variedade de prestígio, ensinada na escola\nAdequação > correção: o critério é a situação de uso"
    },
    "Sintaxe (período e oração)": {
      summary: "Período simples tem uma oração; composto tem duas ou mais. Na coordenação as orações são independentes; na subordinação uma exerce função dentro da outra (substantiva, adjetiva ou adverbial). Achar o verbo primeiro é o atalho: cada verbo, uma oração.",
      formula: "Coordenadas: aditiva, adversativa, alternativa, conclusiva, explicativa\nSubordinadas: substantivas (fazem papel de sujeito/objeto), adjetivas (que...), adverbiais (causa, condição, concessão, tempo...)"
    },
    "Concordância verbal e nominal": {
      summary: "O verbo concorda com o sujeito e o adjetivo com o substantivo. As pegadinhas quase sempre afastam o sujeito do verbo ou o disfarçam de outra coisa — expressões como \"um dos que\", \"a maioria de\", \"haver\" no sentido de existir e a partícula \"se\".",
      formula: "\"Haver\" = existir → sempre singular: Havia problemas.\n\"Fazer\" = tempo → impessoal: Faz dois anos.\nVerbo + se (partícula apassivadora) concorda: Vendem-se casas."
    },
    "Regência": {
      summary: "Regência é a preposição que o verbo ou o nome exige. Muitos verbos mudam de sentido conforme a preposição, e é justamente aí que a prova bate: assistir a (ver) contra assistir (socorrer), aspirar a (desejar) contra aspirar (sugar).",
      formula: "Preferir: algo A algo (nunca \"do que\")  ·  Obedecer/desobedecer a  ·  Visar a (almejar)  ·  Implicar (sem preposição) = acarretar  ·  Chegar a (não \"em\")"
    },
    "Crase": {
      summary: "Crase é a fusão da preposição \"a\" com o artigo \"a\". Só existe diante de palavra feminina que aceite artigo — por isso não há crase antes de verbo, de palavra masculina ou de pronome pessoal. O teste da troca por palavra masculina resolve quase todos os casos.",
      formula: "Teste: troque por masculino. \"Vou à feira\" → \"vou ao mercado\" = tem crase.\nSempre: à medida que, às vezes, à noite, à moda de\nNunca: a pé, a partir de, a ela, a distância (sem especificar)"
    },
    "Redação dissertativa-argumentativa": {
      summary: "O texto do ENEM tem estrutura fixa: introdução com tese, dois parágrafos de desenvolvimento com repertório e argumento, e conclusão com proposta de intervenção detalhada. A proposta vale competência inteira e é onde mais se perde ponto por ficar vaga.",
      formula: "Proposta completa = agente + ação + meio + finalidade + detalhamento\n5 competências × 200 pontos: norma culta, compreensão do tema, argumentação, coesão, proposta"
    }
  },
  "Biologia": {
    "Citologia": {
      summary: "A célula é a unidade da vida. Procarionte não tem núcleo nem organelas membranosas; eucarionte tem os dois. Saber a função de cada organela resolve a maioria das questões: mitocôndria produz ATP, ribossomo monta proteína, lisossomo digere, complexo golgiense empacota.",
      formula: "Animal: centríolos e lisossomos, sem parede\nVegetal: parede de celulose, cloroplasto, vacúolo grande\nMembrana: mosaico fluido (bicamada lipídica + proteínas)",
      image: COMMONS("Animal_cell_structure_en.svg"),
      caption: "Organelas de uma célula animal eucarionte."
    },
    "Bioquímica celular": {
      summary: "Respiração celular e fotossíntese são as duas vias que a prova cobra. A respiração quebra glicose para gerar ATP em três etapas: glicólise (citoplasma), ciclo de Krebs e cadeia respiratória (mitocôndria). A fotossíntese faz o caminho inverso, usando luz.",
      formula: "Respiração: C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + ~38 ATP\nFotossíntese: 6CO₂ + 6H₂O + luz → C₆H₁₂O₆ + 6O₂\nFermentação: sem O₂, rende apenas 2 ATP",
      image: COMMONS("Glycolysis_overview.svg"),
      caption: "Glicólise: a quebra da glicose em piruvato, no citoplasma."
    },
    "Genética": {
      summary: "A primeira lei de Mendel trata de um gene; a segunda, de dois genes independentes. O quadro de Punnett resolve os cruzamentos na base do desenho. Fique atento a heredogramas: recessivo aparece pulando gerações, e ligado ao X afeta muito mais homens.",
      formula: "Monoibridismo: Aa × Aa → 3:1 (fenótipo), 1:2:1 (genótipo)\nDiibridismo: AaBb × AaBb → 9:3:3:1\nSangue: A, B = codominantes; O = recessivo",
      image: COMMONS("Punnett_square_mendel_flowers.svg"),
      caption: "Quadro de Punnett para um cruzamento entre heterozigotos."
    },
    "Evolução": {
      summary: "Lamarck errou no mecanismo (uso e desuso, herança de caracteres adquiridos); Darwin acertou com seleção natural sobre variações que já existem. O neodarwinismo acrescenta a origem dessa variação: mutação e recombinação genética.",
      formula: "Seleção natural = variação + herança + reprodução diferencial\nHomólogos: mesma origem, funções diferentes (divergente)\nAnálogos: mesma função, origens diferentes (convergente)",
      image: COMMONS("Darwin's_finches_by_Gould.jpg"),
      caption: "Os tentilhões de Galápagos: bicos adaptados a alimentos diferentes."
    },
    "Ecologia": {
      summary: "Energia flui em sentido único e diminui a cada nível trófico (só ~10% passa adiante); matéria circula em ciclos. Por isso as cadeias são curtas e a pirâmide de energia nunca é invertida. Questões de impacto ambiental costumam partir daí.",
      formula: "Produtor → consumidor 1º → 2º → 3º → decompositor\nRelações: mutualismo, comensalismo (+/0), predatismo, parasitismo, competição\nBiomagnificação: poluente se concentra no topo da cadeia",
      image: COMMONS("FoodWeb.svg"),
      caption: "Teia alimentar: cadeias interligadas dentro de um ecossistema."
    },
    "Fisiologia humana": {
      summary: "Os sistemas são cobrados pela integração, não isolados. Digestório quebra e absorve, respiratório e circulatório fazem a troca e o transporte de gases, excretor filtra o sangue e nervoso e endócrino coordenam tudo — um por impulso elétrico, o outro por hormônio.",
      formula: "Circulação dupla: pequena (coração ↔ pulmão) e grande (coração ↔ corpo)\nSangue: átrio direito = venoso, átrio esquerdo = arterial\nNéfron: filtração → reabsorção → secreção",
      image: COMMONS("Diagram_of_the_human_heart_(cropped).svg"),
      caption: "Câmaras e vasos do coração humano."
    },
    "Botânica": {
      summary: "As plantas se organizam em grupos com complexidade crescente: briófitas (sem vasos), pteridófitas (com vasos, sem semente), gimnospermas (semente nua) e angiospermas (flor e fruto). Cada novidade evolutiva reduz a dependência de água para se reproduzir.",
      formula: "Xilema: água e sais, de baixo para cima  ·  Floema: seiva elaborada\nFlor: sépala, pétala, estame (masculino), carpelo/pistilo (feminino)\nAuxina, giberelina, etileno = hormônios vegetais",
      image: COMMONS("Mature_flower_diagram.svg"),
      caption: "Partes de uma flor completa de angiosperma."
    },
    "Zoologia": {
      summary: "O que a prova cobra são as sinapomorfias: a característica que marca cada grupo. Artrópodes têm exoesqueleto de quitina e patas articuladas; vertebrados, coluna; aves e mamíferos são os únicos endotérmicos; âmnio é o que permitiu o ovo fora d'água.",
      formula: "Poríferos → cnidários → platelmintos → nematódeos → moluscos → anelídeos → artrópodes → equinodermos → cordados",
      image: COMMONS("Phylogenetic_tree.svg"),
      caption: "Árvore filogenética: parentesco por ancestral comum."
    },
    "Microbiologia e doenças": {
      summary: "Vírus não são células e só se reproduzem dentro de um hospedeiro — por isso antibiótico não funciona contra eles. Bactérias, protozoários, fungos e vermes causam doenças por mecanismos diferentes, e a prova costuma cruzar isso com forma de transmissão e prevenção.",
      formula: "Vírus: dengue, HIV, covid, gripe  ·  Bactéria: tuberculose, hanseníase, sífilis\nProtozoário: malária, doença de Chagas, amebíase  ·  Verme: esquistossomose, teníase\nVacina = imunização ativa  ·  Soro = imunização passiva (imediata)",
      image: COMMONS("Bacterial_morphology_diagram.svg"),
      caption: "Formas bacterianas: cocos, bacilos, espirilos e vibriões."
    },
    "Biotecnologia": {
      summary: "DNA recombinante, transgênicos, PCR, clonagem e células-tronco. O que muda de técnica para técnica é o objetivo: PCR amplifica um trecho de DNA, transgenia insere um gene de outra espécie, clonagem copia um indivíduo inteiro. Questões costumam pedir a implicação ética.",
      formula: "PCR: desnaturação (95°C) → anelamento → extensão\nTransgênico = gene de outra espécie  ·  OGM = qualquer modificação\nCélula-tronco: embrionária (pluripotente) vs adulta (multipotente)",
      image: COMMONS("Polymerase_chain_reaction.svg"),
      caption: "Ciclos da PCR, que duplicam o DNA a cada repetição."
    }
  },
  "História": {
    "Antiguidade clássica": {
      summary: "Grécia e Roma formaram o repertório político do Ocidente. Atenas criou a democracia direta — restrita a homens livres, sem mulheres, escravos e estrangeiros. Roma foi da República ao Império e deixou o direito, a base de quase todo sistema jurídico atual.",
      formula: "Atenas: democracia direta  ·  Esparta: oligarquia militar\nRoma: Monarquia → República (509 a.C.) → Império (27 a.C.) → queda do Império Romano do Ocidente (476)",
      image: COMMONS("The_Parthenon_in_Athens.jpg"),
      caption: "O Partenon, em Atenas, símbolo do período clássico grego."
    },
    "Idade Média": {
      summary: "O feudalismo organizou a terra e a fidelidade: suserano cede o feudo, vassalo presta serviço militar, servo trabalha e paga tributos. A Igreja concentrava o poder cultural e ideológico. A partir do século XI, comércio e cidades reabrem e o sistema começa a rachar.",
      formula: "Sociedade estamental: clero (oratores), nobreza (bellatores), servos (laboratores)\nAlta Idade Média (V–X): ruralização  ·  Baixa (XI–XV): renascimento comercial e urbano, Cruzadas, Peste Negra",
      image: COMMONS("Tapisserie_de_Bayeux_31109.jpg"),
      caption: "Tapeçaria de Bayeux, século XI: cavaleiros normandos."
    },
    "Grandes navegações": {
      summary: "Portugal saiu na frente por centralização precoce, posição atlântica e experiência náutica. O motor foi econômico: acesso direto às especiarias sem os intermediários italianos e otomanos. O resultado foi a primeira economia de escala mundial — e o tráfico atlântico.",
      formula: "1415 Ceuta  ·  1488 Bartolomeu Dias no Cabo da Boa Esperança\n1492 Colombo  ·  1494 Tratado de Tordesilhas  ·  1498 Vasco da Gama nas Índias  ·  1500 Cabral no Brasil",
      image: COMMONS("Cantino_planisphere_(1502).jpg"),
      caption: "Planisfério de Cantino (1502), um dos primeiros mapas do Brasil."
    },
    "Brasil colônia": {
      summary: "A colonização foi de exploração: monocultura de exportação, latifúndio e trabalho escravizado, no pacto colonial que reservava o comércio à metrópole. Do pau-brasil ao açúcar e depois ao ouro, muda o produto e a região, mas a estrutura permanece.",
      formula: "1500–1530 pré-colonial (pau-brasil)  ·  1530 capitanias hereditárias  ·  1548 Governo-Geral\nAçúcar (Nordeste, séc. XVI–XVII)  ·  Ouro (Minas, séc. XVIII)  ·  Inconfidência Mineira 1789",
      image: COMMONS("Meirelles-primeiramissa2.jpg"),
      caption: "\"Primeira Missa no Brasil\", de Victor Meirelles (1860)."
    },
    "Iluminismo e revoluções": {
      summary: "O Iluminismo pôs razão, liberdade e igualdade jurídica no lugar do direito divino. Isso alimentou a Revolução Francesa e as independências americanas, enquanto a Revolução Industrial mudou a base material: máquina, fábrica e proletariado urbano.",
      formula: "Locke: direitos naturais  ·  Montesquieu: três poderes  ·  Rousseau: contrato social\n1776 Independência dos EUA  ·  1789 Revolução Francesa  ·  1799 Napoleão",
      image: COMMONS("Eugène_Delacroix_-_La_liberté_guidant_le_peuple.jpg"),
      caption: "\"A Liberdade guiando o povo\", de Delacroix (1830)."
    },
    "Independência do Brasil": {
      summary: "A vinda da Corte em 1808 já quebrou o pacto colonial na prática, com a abertura dos portos. A independência foi conduzida pela elite agrária para preservar escravidão e latifúndio — por isso saiu monarquia, e não república, e com pouca ruptura social.",
      formula: "1808 Corte no Rio, abertura dos portos  ·  1815 Reino Unido a Portugal\n1821 Dia do Fico  ·  7/9/1822 Independência  ·  1824 Constituição outorgada (Poder Moderador)",
      image: COMMONS("Pedro_Américo_-_Independência_ou_Morte_-_Google_Art_Project.jpg"),
      caption: "\"Independência ou Morte\", de Pedro Américo (1888)."
    },
    "República brasileira": {
      summary: "A República nasceu de um golpe militar, sem participação popular. A República Velha se sustentou na política dos governadores, no coronelismo e no voto de cabresto, com o café-com-leite alternando São Paulo e Minas até a crise de 1929 e a Revolução de 1930.",
      formula: "1889 Proclamação  ·  1891 primeira Constituição republicana\nRevoltas: Canudos, Contestado, Vacina (1904), Tenentismo (1922)  ·  1930 fim da República Velha",
      image: COMMONS("Proclamação_da_República_by_Benedito_Calixto_1893.jpg"),
      caption: "A Proclamação da República, por Benedito Calixto (1893)."
    },
    "Era Vargas": {
      summary: "Quinze anos em três fases: Provisório, Constitucional e Estado Novo (1937–45), este último ditatorial. Vargas industrializou, criou a CLT e o salário mínimo, e ao mesmo tempo censurou e reprimiu — o populismo trabalhista é exatamente essa combinação.",
      formula: "1930–34 Governo Provisório  ·  1932 Revolução Constitucionalista  ·  1934–37 Constitucional\n1937–45 Estado Novo (DIP, censura)  ·  1943 CLT  ·  1951–54 volta pelo voto",
      image: COMMONS("Getulio_Vargas_(1930)_(cropped).jpg"),
      caption: "Getúlio Vargas em 1930, ao assumir o governo provisório."
    },
    "Guerras mundiais": {
      summary: "A Primeira nasce do imperialismo, do nacionalismo e das alianças militares; a Segunda, em boa parte, das condições impostas em Versalhes somadas à crise de 1929, que abriu espaço para o nazifascismo. As duas aceleram a hegemonia dos EUA.",
      formula: "1914–18 1ª Guerra  ·  1919 Tratado de Versalhes  ·  1929 Crise de 1929\n1939–45 2ª Guerra  ·  1945 Hiroshima e Nagasaki, criação da ONU",
      image: COMMONS("Raising_the_Flag_on_Iwo_Jima,_larger_-_edit1.jpg"),
      caption: "Iwo Jima, 1945: uma das imagens mais reproduzidas da guerra."
    },
    "Guerra Fria e mundo atual": {
      summary: "Bipolaridade sem confronto direto entre EUA e URSS: a disputa acontece por conflitos periféricos, corrida armamentista e corrida espacial. Com a queda do Muro em 1989 e o fim da URSS em 1991, o mundo passa a uma ordem multipolar e globalizada.",
      formula: "1947 Doutrina Truman e Plano Marshall  ·  1949 OTAN  ·  1955 Pacto de Varsóvia\n1961 Muro de Berlim  ·  1962 Crise dos Mísseis  ·  1989 queda do Muro  ·  1991 fim da URSS",
      image: COMMONS("Berlinermauer.jpg"),
      caption: "O Muro de Berlim, símbolo da divisão bipolar."
    }
  },
  "Física": {
    "Cinemática": {
      summary: "Descreve o movimento sem perguntar a causa. O passo que resolve a questão é identificar se a velocidade é constante (MU) ou se há aceleração constante (MUV) e escolher a equação certa. Cuidado com unidades: 1 m/s = 3,6 km/h.",
      formula: "MU: S = S₀ + v·t\nMUV: v = v₀ + a·t   ·   S = S₀ + v₀t + at²/2   ·   v² = v₀² + 2aΔS\nLançamento: horizontal e vertical são independentes; g ≈ 10 m/s²",
      image: COMMONS("Ideal_projectile_motion_for_different_angles.svg"),
      caption: "Lançamento oblíquo: alcance máximo a 45°."
    },
    "Leis de Newton": {
      summary: "Inércia, F = ma e ação-reação. O erro clássico é somar ação e reação: elas atuam em corpos diferentes, nunca se anulam. Desenhar o diagrama de forças de cada corpo antes de escrever qualquer equação evita quase todos os enganos.",
      formula: "1ª: sem força resultante, v constante   ·   2ª: F_R = m·a   ·   3ª: F_AB = −F_BA\nPeso: P = m·g   ·   Atrito: F_at = μ·N   ·   Centrípeta: F_c = mv²/R",
      image: COMMONS("Free_body_diagram.svg"),
      caption: "Diagrama de corpo livre: todas as forças sobre um bloco."
    },
    "Trabalho e energia": {
      summary: "Trabalho é força vezes deslocamento na direção da força. Quando só forças conservativas atuam, a energia mecânica se conserva: o que a energia potencial perde, a cinética ganha. Com atrito, a diferença virou calor — e é exatamente isso que a questão pede.",
      formula: "τ = F·d·cos θ   ·   E_c = mv²/2   ·   E_pg = mgh   ·   E_pe = kx²/2\nConservação: E_c1 + E_p1 = E_c2 + E_p2   ·   Potência: P = τ/Δt",
      image: COMMONS("Simple_gravity_pendulum.svg"),
      caption: "Pêndulo: troca contínua entre energia potencial e cinética."
    },
    "Hidrostática": {
      summary: "A pressão em um líquido depende só da profundidade, não do formato do recipiente. Pascal diz que uma pressão aplicada se transmite integralmente (prensa hidráulica); Arquimedes diz que o empuxo é igual ao peso do líquido deslocado — daí flutuar ou afundar.",
      formula: "p = p₀ + ρ·g·h   ·   Pascal: F₁/A₁ = F₂/A₂   ·   Arquimedes: E = ρ_líq·V_desl·g\nFlutua se ρ_corpo < ρ_líquido",
      image: COMMONS("Communicating_vessels.svg"),
      caption: "Vasos comunicantes: mesmo nível, independente do formato."
    },
    "Termologia e calorimetria": {
      summary: "Temperatura mede agitação das partículas; calor é energia em trânsito por diferença de temperatura. Calor sensível muda a temperatura, calor latente muda o estado físico e ocorre a temperatura constante — é o que explica o patamar no gráfico de aquecimento.",
      formula: "Q = m·c·ΔT (sensível)   ·   Q = m·L (latente)\nT_K = T_C + 273   ·   T_F = 1,8·T_C + 32\nDilatação: ΔL = L₀·α·ΔT",
      image: COMMONS("Thermometer_CF.svg"),
      caption: "Escalas Celsius e Fahrenheit lado a lado."
    },
    "Óptica geométrica": {
      summary: "A luz anda em linha reta, reflete com ângulos iguais e refrata ao mudar de meio. Espelhos e lentes se resolvem com a mesma equação de Gauss; o que muda é a convenção de sinal. Imagem real se forma no cruzamento dos raios, virtual no prolongamento.",
      formula: "Reflexão: i = r   ·   Snell: n₁·sen i = n₂·sen r\nGauss: 1/f = 1/p + 1/p'   ·   Aumento: A = −p'/p = i/o\nLente convergente f > 0; divergente f < 0",
      image: COMMONS("Snells_law2.svg"),
      caption: "Refração: o raio muda de direção ao trocar de meio."
    },
    "Ondulatória": {
      summary: "Onda transporta energia, não matéria. Ao mudar de meio, a frequência nunca muda — quem muda é a velocidade e, junto, o comprimento de onda. Reflexão, refração, difração, interferência e efeito Doppler são os fenômenos cobrados.",
      formula: "v = λ·f   ·   T = 1/f\nSom: mecânica e longitudinal, precisa de meio material\nLuz: eletromagnética e transversal, anda no vácuo (c = 3·10⁸ m/s)",
      image: COMMONS("Wavelength.svg"),
      caption: "Comprimento de onda, amplitude, crista e vale."
    },
    "Eletrostática": {
      summary: "Cargas iguais se repelem, opostas se atraem, e a força cai com o quadrado da distância — dobrar a distância divide a força por quatro. Campo elétrico existe independentemente da carga de prova; potencial é energia por unidade de carga.",
      formula: "Coulomb: F = k·|Q₁·Q₂|/d²   (k = 9·10⁹ N·m²/C²)\nCampo: E = F/q = k·Q/d²   ·   Potencial: V = k·Q/d   ·   W = q·(V_A − V_B)",
      image: COMMONS("VFPt_charges_plus_minus_thumb.svg"),
      caption: "Linhas de campo entre uma carga positiva e uma negativa."
    },
    "Eletrodinâmica (circuitos)": {
      summary: "Em série a corrente é a mesma e as resistências somam; em paralelo a tensão é a mesma e a resistência equivalente cai. Reconhecer a associação antes de calcular resolve o circuito. Conta de consumo é potência vezes tempo, em kWh.",
      formula: "U = R·i   ·   P = U·i = R·i² = U²/R\nSérie: R_eq = R₁ + R₂   ·   Paralelo: 1/R_eq = 1/R₁ + 1/R₂\nEnergia: E = P·Δt (kWh)",
      image: COMMONS("Ohm's_Law_with_Voltage_source_TeX.svg"),
      caption: "Lei de Ohm em um circuito simples."
    },
    "Eletromagnetismo": {
      summary: "Corrente elétrica gera campo magnético e campo magnético variável gera corrente (indução de Faraday). Essa reciprocidade é a base de motores, geradores e transformadores. A regra da mão direita dá o sentido — vale treinar com a mão mesmo.",
      formula: "Fio reto: B = μ₀i/(2πr)   ·   Força magnética: F = q·v·B·sen θ\nFaraday: ε = −ΔΦ/Δt   ·   Transformador: U₁/U₂ = N₁/N₂",
      image: COMMONS("Manoderecha.svg"),
      caption: "Regra da mão direita para o campo em torno de um fio."
    }
  },
  "Química": {
    "Estrutura atômica": {
      summary: "O número atômico (prótons) define o elemento; o de massa soma prótons e nêutrons. Isótopos variam nêutrons, isóbaros têm mesma massa e isótonos mesmo número de nêutrons. A distribuição eletrônica por Linus Pauling entrega a camada de valência, que explica a reatividade.",
      formula: "A = Z + N   ·   Íon: cátion perdeu elétron (+), ânion ganhou (−)\nOrdem de Pauling: 1s 2s 2p 3s 3p 4s 3d 4p 5s 4d 5p 6s 4f 5d 6p 7s 5f 6d",
      image: COMMONS("Bohr-atom-PAR.svg"),
      caption: "Modelo de Bohr: elétrons em níveis de energia definidos."
    },
    "Tabela periódica": {
      summary: "Os elementos estão em ordem crescente de número atômico, e as propriedades se repetem periodicamente. Grupo (coluna) indica elétrons de valência; período (linha), o número de camadas. Raio atômico cresce para a esquerda e para baixo; eletronegatividade faz o contrário.",
      formula: "Grupo 1: alcalinos  ·  2: alcalinoterrosos  ·  17: halogênios  ·  18: gases nobres\nEletronegatividade: F > O > N > Cl > Br > I > S > C > P > H",
      image: COMMONS("Simple_Periodic_Table_Chart-en.svg"),
      caption: "Tabela periódica com grupos e períodos."
    },
    "Ligações químicas": {
      summary: "Iônica transfere elétrons (metal + ametal) e forma retículo cristalino; covalente compartilha (ametal + ametal); metálica é o mar de elétrons livres, o que explica condução e maleabilidade. Geometria e polaridade da molécula decorrem de onde estão os pares eletrônicos.",
      formula: "Iônica: NaCl — sólida, alto ponto de fusão, conduz dissolvida\nCovalente: H₂O, CO₂  ·  Metálica: Fe, Cu — conduz no estado sólido\nApolar dissolve apolar; polar dissolve polar",
      image: COMMONS("Sodium-chloride-3D-ionic.png"),
      caption: "Retículo iônico do cloreto de sódio (NaCl)."
    },
    "Funções inorgânicas": {
      summary: "Quatro funções: ácido libera H⁺, base libera OH⁻, sal vem da neutralização entre os dois e óxido é um composto binário com oxigênio. A escala de pH mede a concentração de H⁺ e é logarítmica — cada unidade é um fator de dez.",
      formula: "Ácido + base → sal + água\npH < 7 ácido  ·  pH = 7 neutro  ·  pH > 7 básico   (pH = −log[H⁺])\nÓxido ácido + água → ácido (chuva ácida: SO₂, NOₓ)",
      image: COMMONS("PH_scale.svg"),
      caption: "Escala de pH, do ácido ao básico."
    },
    "Reações químicas": {
      summary: "Toda reação precisa estar balanceada: mesma quantidade de átomos de cada elemento nos dois lados. Reconhecer o tipo de reação já indica o produto — síntese junta, análise separa, simples troca desloca um elemento, dupla troca troca os pares.",
      formula: "Síntese: A + B → AB   ·   Análise: AB → A + B\nSimples troca: A + BC → AC + B   ·   Dupla troca: AB + CD → AD + CB\nBalanceamento: ajuste metais, depois ametais, depois H e O"
    },
    "Estequiometria": {
      summary: "É regra de três com mol. O roteiro nunca muda: balancear a equação, converter tudo para mol, aplicar a proporção dos coeficientes e voltar para a unidade pedida. Quando há dois reagentes com quantidades dadas, ache o reagente limitante primeiro.",
      formula: "1 mol = 6,02·10²³ partículas = massa molar em gramas\nCNTP: 1 mol de gás = 22,4 L\nn = m/M   ·   Rendimento = (real / teórico) × 100%"
    },
    "Soluções e concentração": {
      summary: "Soluto se dissolve no solvente; a solubilidade é o limite dessa dissolução em dada temperatura, e por isso a curva de solubilidade responde se a solução está insaturada, saturada ou supersaturada. Diluir mantém a massa de soluto e muda só o volume.",
      formula: "C = m₁/V (g/L)   ·   Molaridade: M = n₁/V (mol/L)\nDiluição: C₁V₁ = C₂V₂   ·   Mistura: C₁V₁ + C₂V₂ = C_f·V_f",
      image: COMMONS("Solubility_curve_of_copper_sulfate.png"),
      caption: "Curva de solubilidade: quanto dissolve a cada temperatura."
    },
    "Termoquímica": {
      summary: "Reação exotérmica libera calor (ΔH < 0) e endotérmica absorve (ΔH > 0). A energia de ativação é a barreira que precisa ser vencida em qualquer um dos casos — catalisador diminui essa barreira, mas não altera o ΔH da reação.",
      formula: "ΔH = H_produtos − H_reagentes\nExotérmica: ΔH < 0 (combustão)  ·  Endotérmica: ΔH > 0 (fotossíntese)\nHess: ΔH total independe do caminho",
      image: COMMONS("Activation_energy.svg"),
      caption: "Energia de ativação, com e sem catalisador."
    },
    "Química orgânica": {
      summary: "O carbono faz quatro ligações e encadeia consigo mesmo — daí a variedade. A nomenclatura é montada por peças: prefixo (nº de carbonos) + infixo (tipo de ligação) + sufixo (função). Isomeria é quando a mesma fórmula molecular dá substâncias diferentes.",
      formula: "met(1) et(2) prop(3) but(4) pent(5) hex(6)\nan = só simples  ·  en = dupla  ·  in = tripla\nFunções: álcool (-ol), aldeído (-al), cetona (-ona), ácido (-oico), éster, amina",
      image: COMMONS("Benzene-2D-flat.png"),
      caption: "Anel benzênico, base dos compostos aromáticos."
    },
    "Eletroquímica": {
      summary: "Pilha converte reação espontânea em corrente; eletrólise faz o contrário, usando corrente para forçar a reação. Em ambas, oxidação ocorre no ânodo e redução no cátodo. O que muda é o sinal dos eletrodos e quem paga a conta energética.",
      formula: "Oxidação: perde elétron (ânodo)  ·  Redução: ganha (cátodo)\nΔE = E_red(maior) − E_red(menor); pilha funciona se ΔE > 0\nCorrosão do ferro = oxidação espontânea",
      image: COMMONS("Galvanic_cell_labeled.svg"),
      caption: "Pilha galvânica: ânodo, cátodo e ponte salina."
    }
  }
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function syllabusKey(subject, topic) {
  return `${subject}|||${topic}`;
}

// Matérias que entram no plano. Fonte única: o que a pessoa escolheu no
// cadastro. Sem escolha salva (contas antigas), o par com que o plano começa.
const planSubjects = () => state.user.subjects.length ? state.user.subjects : ["Matemática", "Português"];

// Descanso padrão até a pessoa escolher um valor no modal do plano.
const DEFAULT_BREAK_MINUTES = 60;

// Duração padrão do bloco de um tópico no plano, quando a pessoa não mudou.
const TOPIC_MINUTES_DEFAULT = 60;
const TOPIC_MINUTES_MIN = 15;
const TOPIC_MINUTES_MAX = 240;

// Sempre dentro da faixa: é isso que garante que o plano termine de montar
// (bloco de 0 minuto deixaria o preenchimento do dia em laço infinito).
function topicMinutes(subject, topic) {
  const valor = Number(state.topicMinutes[syllabusKey(subject, topic)]) || TOPIC_MINUTES_DEFAULT;
  return Math.min(TOPIC_MINUTES_MAX, Math.max(TOPIC_MINUTES_MIN, Math.round(valor)));
}

// Excluir um tópico grava status "removed" em vez de apagar a linha: os tópicos
// da base vêm de uma constante, então uma linha apagada voltaria no próximo load.
const isRemoved = (subject, topic) => state.syllabus[syllabusKey(subject, topic)] === "removed";

// Tópicos "oficiais" da matéria (ENEM fixo).
function baseTopics(subject) {
  return (SYLLABUS[subject] || []).filter((topic) => !isRemoved(subject, topic));
}

// Tópicos que o próprio aluno adicionou (existem em state.syllabus mas não na base).
function customTopics(subject) {
  const base = new Set(SYLLABUS[subject] || []);
  const prefix = `${subject}|||`;
  return Object.keys(state.syllabus)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length))
    .filter((topic) => !base.has(topic) && !isRemoved(subject, topic));
}

function topicsForSubject(subject) {
  return [...baseTopics(subject), ...customTopics(subject)];
}

// Excluídos, para o editor poder restaurar. Inclui os da base e os próprios.
function removedTopics(subject) {
  const prefix = `${subject}|||`;
  return Object.keys(state.syllabus)
    .filter((key) => key.startsWith(prefix) && state.syllabus[key] === "removed")
    .map((key) => key.slice(prefix.length));
}

function subjectMastery(subject) {
  const topics = topicsForSubject(subject);
  if (!topics.length) return { coverage: 0, remaining: 100, counts: { mastered: 0, learning: 0, unknown: 0 } };
  const counts = { mastered: 0, learning: 0, unknown: 0 };
  let score = 0;
  topics.forEach((topic) => {
    const status = state.syllabus[syllabusKey(subject, topic)] || "unknown";
    counts[status] = (counts[status] || 0) + 1;
    score += SYLLABUS_STATUS_WEIGHT[status] || 0;
  });
  const coverage = Math.round((score / topics.length) * 100);
  return { coverage, remaining: 100 - coverage, counts };
}

// Fila de tópicos priorizada: "Não sei" primeiro, depois "Estudando", por fim
// os dominados (para revisão espaçada). Alimenta o plano semanal.
function pendingQueue(subject) {
  const rank = { unknown: 0, learning: 1, mastered: 2 };
  return topicsForSubject(subject)
    .map((topic) => ({ topic, status: state.syllabus[syllabusKey(subject, topic)] || "unknown" }))
    .sort((a, b) => rank[a.status] - rank[b.status]);
}

function topicIntent(status) {
  return status === "mastered" ? "revisão espaçada" : status === "learning" ? "aprofundar conteúdo" : "conteúdo novo";
}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// Ícones de olho para o botão de mostrar/ocultar senha.
const EYE_OPEN = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_CLOSED = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
$$(".password-toggle").forEach((button) => { button.innerHTML = EYE_CLOSED; });

function showScreen(screenId) {
  $$(".screen").forEach((screen) => screen.classList.remove("active-screen"));
  const screen = $(`#${screenId}`);
  if (screen) screen.classList.add("active-screen");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (screenId === "landing-screen" || screenId === "landing-page-screen") {
    document.documentElement.removeAttribute("data-theme");
  }
  if (screenId === "landing-page-screen") initCarousel();
}

function updateOnboardingProgress() {
  const onboardingScreen = $("#onboarding-screen");
  $$(".progress-step", onboardingScreen).forEach((step, index) => {
    step.classList.toggle("active", index + 1 <= state.step);
  });
  $$(".form-step", onboardingScreen).forEach((step) => {
    step.classList.toggle("active", Number(step.dataset.step) === state.step);
  });
}

async function registerUser() {
  const name = $("#user-name").value.trim();
  const email = $("#user-email").value.trim();
  const password = $("#user-password").value;

  if (!name) {
    showToast("Digite seu nome para continuar.");
    $("#user-name").focus();
    return false;
  }
  if (!email) {
    showToast("Digite seu e-mail para continuar.");
    $("#user-email").focus();
    return false;
  }
  if (password.length < 6) {
    showToast("Sua senha precisa ter pelo menos 6 caracteres.");
    $("#user-password").focus();
    return false;
  }

  try {
    const response = await fetch(`${API_BASE}/api/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, email, password })
    });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Não foi possível concluir seu cadastro.");
      return false;
    }
    state.user.id = data.id;
    state.user.plan = data.plan || "free";
    return true;
  } catch (error) {
    showToast("Não foi possível conectar ao servidor.");
    return false;
  }
}

async function loginUser(email, password) {
  try {
    const response = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Não foi possível entrar.");
      return false;
    }
    state.user.id = data.id;
    state.user.name = data.name;
    state.user.plan = data.plan || "free";
    applyProfile(data.profile);
    return true;
  } catch (error) {
    showToast("Não foi possível conectar ao servidor.");
    return false;
  }
}

function collectFormData() {
  state.user.name = $("#user-name").value.trim() || "Estudante";
  state.user.objective = "ENEM";
  state.user.days = Number($("#exam-days").value) || 90;
  state.user.hours = Number($("#daily-hours").value) || 2;
  state.user.level = $("#level").value;
  state.user.subjects = $$(".subject.selected").map((subject) => subject.dataset.subject);
}

// Persiste o perfil de estudo no backend (silencioso: não bloqueia a navegação).
async function saveProfile() {
  try {
    await fetch(`${API_BASE}/api/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        objective: state.user.objective,
        days: state.user.days,
        hours: state.user.hours,
        studyTimeStart: state.user.studyTimeStart,
        studyTimeEnd: state.user.studyTimeEnd,
        level: state.user.level,
        subjects: state.user.subjects,
        breakMinutes: state.user.breakMinutes
      })
    });
  } catch (error) {
    // Sem conexão: mantém o perfil só no estado local desta sessão.
  }
}

// Aplica o perfil vindo do servidor sobre o estado local (login/restauração).
function applyProfile(profile) {
  if (!profile) return;
  if (profile.objective) state.user.objective = profile.objective;
  if (profile.days) state.user.days = profile.days;
  if (profile.hours) state.user.hours = profile.hours;
  if (profile.studyTimeStart) state.user.studyTimeStart = profile.studyTimeStart;
  if (profile.studyTimeEnd) state.user.studyTimeEnd = profile.studyTimeEnd;
  if (profile.level) state.user.level = profile.level;
  if (Array.isArray(profile.subjects) && profile.subjects.length) state.user.subjects = profile.subjects;
  // 0 é uma escolha válida (sem descanso), então não pode cair no mesmo teste
  // "truthy" dos outros campos.
  if (Number.isInteger(profile.breakMinutes)) state.user.breakMinutes = profile.breakMinutes;
}

function initials(name) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "ST";
}

function formatDate() {
  const date = new Date();
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date).toUpperCase();
}

function formatShortDate() {
  const date = new Date();
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "short" }).format(date).toUpperCase().replace(".", "");
}

function setUserLabels() {
  const firstName = state.user.name.split(" ")[0] || "Estudante";
  const avatar = initials(state.user.name);
  $("#dashboard-name").textContent = firstName;
  $("#sidebar-name").textContent = state.user.name;
  $("#sidebar-avatar").textContent = avatar;
  $("#topbar-avatar").textContent = avatar;
  $("#plan-objective").textContent = state.user.objective;
  $("#plan-days").textContent = state.user.days;
  $("#plan-hours").textContent = `${state.user.studyTimeStart} às ${state.user.studyTimeEnd}`;
  $("#plan-level").textContent = state.user.level.toLowerCase();
  $("#current-date").textContent = formatDate();
  $("#today-panel-date").textContent = formatShortDate();

  const isPlus = state.user.plan === "plus";
  const planLabelEl = $("#sidebar-plan-label");
  if (planLabelEl) planLabelEl.textContent = isPlus ? "Plano Plus" : "Plano gratuito";
  // O mesmo botão vira "assinar" para quem ainda não tem assinatura.
  const planButtonEl = $("#settings-plan-button");
  if (planButtonEl) planButtonEl.textContent = isPlus ? "Gerenciar assinatura" : "Assinar";
  const planNoteEl = $("#settings-plan-note");
  if (planNoteEl) {
    planNoteEl.textContent = isPlus
      ? "Cancele, troque o cartão ou baixe suas faturas."
      : "Ative sua assinatura para liberar o painel completo.";
  }
}

// Painel de "Meu progresso": lista os blocos previstos para hoje e deixa a
// pessoa confirmar o que já estudou. Reusa a marcação de .schedule-item, então
// o handler de clique já existente atende os dois casos: bloco já confirmado
// tem data-session-id e alterna (desmarca); bloco só previsto não tem, e o
// clique grava a sessão como concluída.
function renderTodayCheck() {
  const list = $("#today-check-list");
  if (!list) return;

  // Casa por matéria+horário e NÃO por `completed`: uma sessão desmarcada
  // continua existindo, e a linha precisa do id dela para o próximo clique
  // alternar em vez de criar outra. Era isso que duplicava sessões e derrubava
  // a porcentagem a cada ciclo de desmarcar/marcar.
  const sessaoDe = (item) => state.sessions.find(
    (session) => session.subject === item.subject && session.time === item.time
  );

  // Sessões de hoje que não correspondem a nenhum bloco do plano: é o estudo
  // extra, registrado pelo botão. Sempre tem id, então o clique alterna.
  const extras = state.sessions.filter((session) => !state.todayPlan.some(
    (item) => item.subject === session.subject && item.time === session.time
  ));

  if (!state.todayPlan.length && !extras.length) {
    list.innerHTML = `<p class="empty-state-text">Escolha suas matérias no plano, ou registre um estudo extra, para acompanhar seu dia aqui.</p>`;
    $("#today-check-summary").textContent = "";
    return;
  }

  const extraRows = extras.map((session) => `<div class="schedule-item ${session.completed ? "completed" : ""}" data-session-id="${session.id}">
      <button class="schedule-check" aria-label="${session.completed ? "Desmarcar" : "Confirmar"} ${escapeHtml(session.subject)}">${session.completed ? "✓" : ""}</button>
      <span class="schedule-time">${session.time}</span>
      <span class="schedule-copy"><strong>${escapeHtml(session.detail || session.subject)}</strong><small>${escapeHtml(session.subject)} · ${session.duration}</small></span>
      <span class="schedule-tag ${session.tagClass}">${escapeHtml(session.tag)}</span>
    </div>`).join("");

  const plannedRows = state.todayPlan.map((item) => {
    const session = sessaoDe(item);
    const concluida = Boolean(session && session.completed);
    const rotulo = escapeHtml(item.topic || item.subject);
    return `<div class="schedule-item ${concluida ? "completed" : ""}"
      ${session ? `data-session-id="${session.id}"` : ""}
      data-subject="${escapeHtml(item.subject)}" data-time="${item.time}"
      data-detail="${escapeHtml(item.topic || item.intent)}" data-duration="${item.duration}">
      <button class="schedule-check" aria-label="${concluida ? "Desmarcar" : "Confirmar"} ${escapeHtml(item.subject)}">${concluida ? "✓" : ""}</button>
      <span class="schedule-time">${item.time}</span>
      <span class="schedule-copy"><strong>${rotulo}</strong><small>${escapeHtml(item.subject)} · ${item.duration} min</small></span>
      <span class="schedule-tag ${item.className}">${concluida ? "estudei" : "confirmar"}</span>
    </div>`;
  }).join("");

  // Previstos primeiro (é o que exige ação), extras depois (já foram feitos).
  list.innerHTML = plannedRows + extraRows;

  const feitos = state.todayPlan.filter((item) => {
    const s = sessaoDe(item);
    return s && s.completed;
  }).length;
  const total = state.todayPlan.length;
  const extrasFeitos = extras.filter((session) => session.completed).length;
  const sufixo = extrasFeitos ? ` +${extrasFeitos} extra${extrasFeitos === 1 ? "" : "s"}.` : "";
  $("#today-check-summary").textContent = total
    ? (feitos === total ? `Dia completo: ${total} de ${total}.${sufixo}` : `${feitos} de ${total} confirmados hoje.${sufixo}`)
    : `${extrasFeitos} estudo${extrasFeitos === 1 ? "" : "s"} extra registrado${extrasFeitos === 1 ? "" : "s"} hoje.`;
}

// Grava um bloco previsto como estudado. O servidor já aceita `completed`.
async function confirmPlannedSession(dataset) {
  try {
    const response = await fetch(`${API_BASE}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        subject: dataset.subject,
        detail: dataset.detail || "",
        time: dataset.time,
        duration: Number(dataset.duration) || 60,
        tag: "Estudo",
        completed: true
      })
    });
    if (!response.ok) throw new Error("create failed");
    await fetchDashboard();
    showToast(`Boa! ${dataset.subject} marcada como estudada.`);
  } catch (error) {
    showToast("Não foi possível registrar agora.");
  }
}

function renderSchedule() {
  const list = $("#schedule-list");
  if (!list) return;
  // Destaca a próxima sessão pendente. Antes era `index === 2` fixo, herdado do
  // mockup: destacava sempre a terceira linha, qualquer que fosse a matéria.
  const proximaIndex = state.sessions.findIndex((session) => !session.completed);
  list.innerHTML = state.sessions.length
    ? state.sessions.map((session, index) => `
      <div class="schedule-item ${session.completed ? "completed" : ""} ${index === proximaIndex ? "active-item" : ""}" data-session-id="${session.id}">
        <button class="schedule-check" aria-label="Marcar ${session.subject} como concluído">${session.completed ? "✓" : ""}</button>
        <span class="schedule-time">${session.time}</span>
        <span class="schedule-copy"><strong>${session.subject}</strong><small>${session.detail}</small></span>
        <span class="schedule-tag ${session.tagClass}">${session.tag}</span>
      </div>
    `).join("")
    : `<p class="empty-state-text">Nenhuma sessão de estudo hoje ainda. Adicione uma para começar.</p>`;
  const complete = state.sessions.filter((session) => session.completed).length;
  const total = state.sessions.length;
  const percent = total > 0 ? Math.round((complete / total) * 100) : 0;
  $("#schedule-completed").textContent = complete;
  $("#schedule-total").textContent = total;
  $("#today-progress").innerHTML = `${complete}<small>/${total}</small>`;
  $("#today-bar").style.width = `${percent}%`;
  $("#today-percent").textContent = total > 0 ? `${percent}% do dia completo` : "Nenhuma sessão hoje";
  const restantes = Math.max(0, total - complete);
  $("#schedule-progress-label").textContent = total === 0
    ? "adicione sua primeira sessão"
    : complete === total
      ? "dia concluído"
      : `${restantes} sess${restantes === 1 ? "ão" : "ões"} restante${restantes === 1 ? "" : "s"}`;
}

const SUBJECT_COLOR_CLASS = {
  "Matemática": "math-color",
  "Português": "portuguese-color",
  "Biologia": "bio-color",
  "História": "history-color",
  "Física": "physics-color",
  "Química": "chemistry-color"
};

function subjectColorClass(subject) {
  return SUBJECT_COLOR_CLASS[subject] || "math-color";
}

function formatMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

// Chave que agrupa as sessões de um dia. É SVG porque `border` só faz canto
// arredondado, não a curva dupla com a ponta no meio. O viewBox é esticado sem
// manter proporção (preserveAspectRatio="none") para acompanhar a altura do
// grupo; `vector-effect="non-scaling-stroke"` mantém a espessura do traço igual
// mesmo esticado, senão a linha engrossaria junto.
const DAY_BRACE_SVG = `<svg class="week-day-brace" viewBox="0 0 12 100" preserveAspectRatio="none" aria-hidden="true"><path d="M10 1C6 1 6 6 6 12L6 40C6 46 5 48 1 50C5 52 6 54 6 60L6 88C6 94 6 99 10 99" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke" /></svg>`;

function subjectTagClass(subject) {
  const classes = { "Matemática": "", "Português": "mint-session", "Biologia": "lilac-session", "História": "mint-session", "Física": "lilac-session", "Química": "mint-session" };
  return classes[subject] || "";
}

function addMinutes(time, minutesToAdd) {
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = (hours * 60 + minutes + minutesToAdd) % (24 * 60);
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const mm = String(totalMinutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function minutesBetween(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

function renderWeekPlan() {
  const list = $("#week-list");
  if (!list) return;
  const subjects = planSubjects();
  const startTime = state.user.studyTimeStart || "08:00";
  const endTime = state.user.studyTimeEnd || "10:00";
  // Limita a 12h para não gerar um plano absurdo caso os horários fiquem iguais.
  const windowMinutes = Math.min(minutesBetween(startTime, endTime), 720);
  const today = new Date();
  const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

  // Fila de tópicos pendentes por matéria e um cursor para não repetir dia a dia.
  const queues = {};
  const cursors = {};
  subjects.forEach((subject) => { queues[subject] = pendingQueue(subject); cursors[subject] = 0; });
  // Tópico e intenção voltam separados para o cartão poder destacar o tópico
  // (o que a pessoa vai estudar) e jogar a intenção numa etiqueta discreta.
  // `topic` volta cru: quem renderiza escapa, e o painel de hoje precisa do
  // texto original para gravar no banco.
  const nextSession = (subject, time, fallbackIntent) => {
    const queue = queues[subject] || [];
    let topic = "";
    let intent = fallbackIntent;
    if (queue.length) {
      const item = queue[cursors[subject] % queue.length];
      cursors[subject] += 1;
      topic = item.topic;
      intent = topicIntent(item.status);
    }
    return {
      time, subject, topic, intent,
      // Tempo definido para esse tópico na ementa; sem tópico, o padrão.
      minutes: topic ? topicMinutes(subject, topic) : TOPIC_MINUTES_DEFAULT,
      className: subjectTagClass(subject)
    };
  };

  // Preenche a janela livre com um bloco por tópico, cada um com a duração que a
  // pessoa escolheu na ementa (padrão 1h). O descanso no meio do dia é definido
  // por ela mesma no modal do plano (0 = sem descanso).
  const breakMinutes = Number.isInteger(state.user.breakMinutes) ? state.user.breakMinutes : DEFAULT_BREAK_MINUTES;
  // Sem espaço de sobra para caber estudo antes e depois, o descanso não entra
  // — sem isso, um descanso maior que a janela devoraria o dia inteiro.
  const breakFits = breakMinutes > 0 && windowMinutes > breakMinutes + TOPIC_MINUTES_MIN * 2;
  const studyMinutes = Math.max(TOPIC_MINUTES_MIN, windowMinutes - (breakFits ? breakMinutes : 0));

  let hasEmenta = false;
  // Só hoje, amanhã e depois de amanhã: um plano curto é um plano que se cumpre.
  const DAY_LABELS = ["Hoje", "Amanhã", "Depois de amanhã"];
  const html = DAY_LABELS.map((label, dayIndex) => {
    const date = new Date(today);
    date.setDate(today.getDate() + dayIndex);
    const dateLabel = dateFormatter.format(date).replace(".", "");

    let cursor = startTime;
    const items = [];
    let restante = studyMinutes;
    let descansoFeito = !breakFits;
    for (let slotIndex = 0; restante >= TOPIC_MINUTES_MIN; slotIndex += 1) {
      const overrideKey = `${dayIndex}-${slotIndex}`;
      const override = state.planOverrides[overrideKey];
      const subject = override ? override.subject : subjects[(dayIndex + slotIndex) % subjects.length];
      if ((queues[subject] || []).length) hasEmenta = true;
      // Edição manual substitui a matéria/tópico sorteados, mas mantém a mesma
      // regra de duração — se o tópico existe na ementa, usa o tempo dela.
      const session = override
        ? {
            time: cursor, subject: override.subject, topic: override.topic, intent: "definido por você",
            minutes: override.topic ? topicMinutes(override.subject, override.topic) : TOPIC_MINUTES_DEFAULT,
            className: subjectTagClass(override.subject)
          }
        : nextSession(subject, cursor, slotIndex === 0 ? "conteúdo novo" : "questões e prática");
      let duration = Math.min(session.minutes, restante);
      // Sobra curta demais não vira bloco próprio: entra neste.
      if (restante - duration < TOPIC_MINUTES_MIN) duration = restante;
      items.push({ ...session, duration, dayIndex, slotIndex });
      cursor = addMinutes(cursor, duration);
      restante -= duration;
      // Descanso no meio do dia, e só se ainda houver estudo depois dele.
      if (!descansoFeito && restante >= TOPIC_MINUTES_MIN && restante <= studyMinutes / 2) {
        items.push({ type: "break", time: cursor });
        cursor = addMinutes(cursor, breakMinutes);
        descansoFeito = true;
      }
    }

    // Guarda os blocos de hoje (sem o descanso) para o painel de confirmação
    // em "Meu progresso" saber o que perguntar.
    if (dayIndex === 0) {
      state.todayPlan = items.filter((item) => item.type !== "break");
    }

    const rows = items.map((item) => {
      if (item.type === "break") {
        return `<div class="week-session break-session"><span class="time">${item.time}</span><div class="week-session-main"><strong>Descanso</strong></div><span class="week-session-intent">recarregar</span><span class="week-session-duration">${breakMinutes} min</span></div>`;
      }
      // O tópico é o título do cartão; a matéria vira etiqueta acima dele. Sem
      // ementa preenchida não há tópico, então a matéria assume o título.
      const kicker = item.topic ? `<span class="week-session-subject">${item.subject}</span>` : "";
      return `<div class="week-session ${item.className}" data-day="${item.dayIndex}" data-slot="${item.slotIndex}" data-subject="${escapeHtml(item.subject)}" data-topic="${escapeHtml(item.topic || "")}">
        <span class="time">${item.time}</span>
        <div class="week-session-main">${kicker}<strong>${escapeHtml(item.topic || item.subject)}</strong></div>
        <span class="week-session-intent">${item.intent}</span>
        <span class="week-session-duration">${item.duration} min</span>
        <button class="week-session-edit" data-action="edit-plan-slot" aria-label="Editar matéria e conteúdo"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg></button>
      </div>`;
    }).join("");
    return `<article class="week-day ${dayIndex === 0 ? "today" : ""}"><div class="week-day-label"><strong>${label}</strong><span>${dateLabel}</span>${DAY_BRACE_SVG}</div><div class="week-day-sessions">${rows}</div></article>`;
  }).join("");

  list.innerHTML = html;

  const noteEl = $("#plan-note");
  if (noteEl) {
    noteEl.textContent = hasEmenta
      ? "✦ Priorizando os tópicos que você marcou como “Não sei” na sua ementa."
      : "✦ Dica: preencha sua ementa para o plano priorizar o que você ainda não aprendeu.";
  }
  // O plano mudou, então o painel de confirmação de hoje precisa acompanhar.
  renderTodayCheck();
}

function tagClassFor(tag) {
  const classes = { "Foco": "tag-coral", "Leitura": "tag-mint", "Prática": "tag-lilac", "Extra": "tag-mint" };
  return classes[tag] || "tag-lilac";
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function lastNDates(n) {
  const dates = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);
    dates.push(date);
  }
  return dates;
}

// Dias (Date) dentro da janela do seletor de datas: de hoje-startAgo até
// hoje-endAgo. É isso que garante que "Ontem" mostre só ontem — estudo mais
// antigo simplesmente não entra na soma.
function datesInRange(rangeKey) {
  const cfg = PROGRESS_RANGES[rangeKey] || PROGRESS_RANGES["30d"];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const dates = [];
  for (let ago = cfg.startAgo; ago >= cfg.endAgo; ago--) {
    const date = new Date(base);
    date.setDate(base.getDate() - ago);
    dates.push(date);
  }
  return dates;
}

// Barras do gráfico grande: soma os dias da janela em grupos de bucketDays.
function progressChartBars(dailyMap, rangeKey) {
  const cfg = PROGRESS_RANGES[rangeKey] || PROGRESS_RANGES["30d"];
  const dates = datesInRange(rangeKey);
  const buckets = [];
  for (let i = 0; i < dates.length; i += cfg.bucketDays) {
    const slice = dates.slice(i, i + cfg.bucketDays);
    buckets.push(slice.reduce((sum, date) => sum + (dailyMap.get(toDateKey(date))?.minutes || 0), 0));
  }
  return buckets;
}

function buildDailyMap(daily) {
  const map = new Map();
  daily.forEach((row) => {
    map.set(row.date, { minutes: Number(row.minutes) || 0, hasCompleted: Boolean(row.has_completed) });
  });
  return map;
}

function computeStreak(dailyMap) {
  let current = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (dailyMap.get(toDateKey(cursor))?.hasCompleted) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  let best = current;
  let running = 0;
  let prevDate = null;
  [...dailyMap.keys()].sort().forEach((key) => {
    if (!dailyMap.get(key).hasCompleted) {
      running = 0;
      prevDate = null;
      return;
    }
    const date = new Date(key);
    const diffDays = prevDate ? Math.round((date - prevDate) / 86400000) : 1;
    running = diffDays === 1 ? running + 1 : 1;
    best = Math.max(best, running);
    prevDate = date;
  });

  return { current, best };
}

function renderStreakCard(dailyMap, streak) {
  const countEl = $("#streak-count");
  if (countEl) countEl.textContent = streak.current;
  const labelEl = $("#streak-label");
  if (labelEl) labelEl.textContent = streak.current > 0 ? "Você está no ritmo!" : "Comece sua sequência hoje.";
  const bestEl = $("#streak-best");
  if (bestEl) bestEl.textContent = `Melhor: ${streak.best} ${streak.best === 1 ? "dia" : "dias"}`;

  const daysEl = $("#mini-days");
  if (daysEl) {
    daysEl.innerHTML = lastNDates(7).map((date, index) => {
      const isToday = index === 6;
      const done = dailyMap.get(toDateKey(date))?.hasCompleted;
      return `<span class="${isToday ? "today" : done ? "done" : ""}"></span>`;
    }).join("");
  }
}

function renderWeekMetric(dailyMap) {
  const last7 = lastNDates(7);
  const minutesPerDay = last7.map((date) => dailyMap.get(toDateKey(date))?.minutes || 0);
  const totalMinutes = minutesPerDay.reduce((sum, minutes) => sum + minutes, 0);

  const hoursEl = $("#week-hours");
  if (hoursEl) hoursEl.innerHTML = `${Math.floor(totalMinutes / 60)}h <small>${totalMinutes % 60}m</small>`;

  const prevTotal = lastNDates(14).slice(0, 7).reduce((sum, date) => sum + (dailyMap.get(toDateKey(date))?.minutes || 0), 0);
  const changeEl = $("#week-change");
  if (changeEl) {
    if (totalMinutes === 0 && prevTotal === 0) {
      changeEl.textContent = "Comece a registrar suas sessões";
    } else if (prevTotal === 0) {
      changeEl.textContent = "Primeira semana registrada";
    } else {
      const change = Math.round(((totalMinutes - prevTotal) / prevTotal) * 100);
      changeEl.textContent = `${change >= 0 ? "+" : ""}${change}% vs. semana passada`;
    }
  }

  const barsEl = $("#week-bars");
  if (barsEl) {
    const max = Math.max(...minutesPerDay, 1);
    barsEl.innerHTML = minutesPerDay.map((minutes) => `<span style="height:${Math.max(8, Math.round((minutes / max) * 100))}%"></span>`).join("");
  }
}

function renderWeeklyChart(dailyMap) {
  const chartEl = $("#weekly-line-chart");
  const labelsEl = $("#weekly-chart-labels");
  if (!chartEl || !labelsEl) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date;
  });

  const minutesPerDay = weekDates.map((date) => dailyMap.get(toDateKey(date))?.minutes || 0);
  const metaMinutes = minutesBetween(state.user.studyTimeStart || "08:00", state.user.studyTimeEnd || "10:00");
  const maxMinutes = Math.max(...minutesPerDay, metaMinutes, 60);

  const xAt = (i) => ((i + 0.5) / 7) * 100;
  const yAt = (minutes) => 98 - (minutes / maxMinutes) * 90;

  // A linha "Estudado" só vai até hoje — dias futuros não viram zero (isso
  // distorceria o gráfico), ficam sem ponto.
  const studyPoints = [];
  weekDates.forEach((date, i) => {
    if (date > today) return;
    studyPoints.push({ i, x: xAt(i), y: yAt(minutesPerDay[i]), minutes: minutesPerDay[i], isToday: toDateKey(date) === toDateKey(today) });
  });

  const studyPath = studyPoints.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const metaY = yAt(metaMinutes).toFixed(2);
  const metaPath = `M ${xAt(0).toFixed(2)} ${metaY} L ${xAt(6).toFixed(2)} ${metaY}`;

  const svg = `<svg class="line-chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none">` +
    `<path class="line-meta" vector-effect="non-scaling-stroke" d="${metaPath}" />` +
    (studyPoints.length > 1 ? `<path class="line-study" vector-effect="non-scaling-stroke" d="${studyPath}" />` : "") +
    `</svg>`;

  const markers = studyPoints.map((p) =>
    `<div class="line-marker ${p.isToday ? "today" : ""}" style="left:${p.x.toFixed(2)}%;top:${p.y.toFixed(2)}%" data-min="${p.minutes}" data-label="${WEEKDAY_LABELS[p.i]}"></div>`
  ).join("");

  chartEl.innerHTML = svg + markers + `<div class="chart-tooltip hidden" id="weekly-chart-tooltip"></div>`;

  labelsEl.innerHTML = weekDates.map((date, i) =>
    `<span class="${toDateKey(date) === toDateKey(today) ? "today-label" : ""}">${WEEKDAY_LABELS[i]}</span>`
  ).join("");

  const yAxisEl = $("#chart-y-axis");
  if (yAxisEl) {
    const maxHours = Math.max(1, Math.ceil(maxMinutes / 60));
    yAxisEl.innerHTML = `<span>${maxHours}h</span><span>${Math.round((maxHours / 2) * 10) / 10}h</span><span>0h</span>`;
  }
}

function renderProgressView(dailyMap, subjects, streak) {
  const rangeKey = PROGRESS_RANGES[state.progressRange] ? state.progressRange : "30d";
  const cfg = PROGRESS_RANGES[rangeKey];

  const totalMinutes = datesInRange(rangeKey).reduce((sum, date) => sum + (dailyMap.get(toDateKey(date))?.minutes || 0), 0);
  const hoursEl = $("#big-progress-hours");
  if (hoursEl) hoursEl.innerHTML = `${Math.floor(totalMinutes / 60)}<span>h</span> ${totalMinutes % 60}<span>min</span>`;

  const noteEl = $("#progress-hours-note");
  if (noteEl) noteEl.textContent = cfg.note;

  const largeChartEl = $("#large-chart");
  if (largeChartEl) {
    const buckets = progressChartBars(dailyMap, rangeKey);
    const max = Math.max(...buckets, 1);
    largeChartEl.innerHTML = buckets.map((minutes) => `<span style="height:${Math.max(4, Math.round((minutes / max) * 100))}%"></span>`).join("");
  }

  const subjectListEl = $("#subject-progress-list");
  if (subjectListEl) {
    if (!subjects.length) {
      subjectListEl.innerHTML = `<p class="empty-state-text">Ainda sem sessões suficientes para calcular seu domínio por matéria. Conclua algumas sessões para ver esse gráfico.</p>`;
    } else {
      subjectListEl.innerHTML = subjects.map((subject) => {
        const total = Number(subject.total);
        const completed = Number(subject.completed);
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
        const colorClass = subjectColorClass(subject.subject);
        return `<div class="subject-progress-row"><span class="subject-dot ${colorClass}"></span><b>${subject.subject}</b><span class="progress-mini-track"><i class="${colorClass}" style="width:${percent}%"></i></span><strong>${percent}%</strong></div>`;
      }).join("");
    }
  }

  renderSubjectHours(subjects);

  const titleEl = $("#achievement-title");
  const textEl = $("#achievement-text");
  if (titleEl && textEl) {
    if (streak.current >= 7) {
      titleEl.textContent = "Semana consistente";
      textEl.textContent = `Você estudou em ${streak.current} dias seguidos. É assim que uma rotina começa.`;
    } else if (streak.current > 0) {
      titleEl.textContent = "Sequência em construção";
      textEl.textContent = `${streak.current} ${streak.current === 1 ? "dia seguido" : "dias seguidos"} até agora. Continue firme!`;
    } else {
      titleEl.textContent = "Comece sua sequência";
      textEl.textContent = "Conclua uma sessão de estudo hoje para começar sua sequência.";
    }
  }
}

function renderSubjectHours(subjects) {
  const listEl = $("#subject-hours-list");
  if (!listEl) return;

  const minutesBySubject = new Map(subjects.map((row) => [row.subject, Number(row.minutes) || 0]));
  const chosenSubjects = state.user.subjects.length ? state.user.subjects : subjects.map((row) => row.subject);
  const rows = chosenSubjects.map((subject) => ({ subject, minutes: minutesBySubject.get(subject) || 0 }));

  if (!rows.length || rows.every((row) => row.minutes === 0)) {
    listEl.innerHTML = `<p class="empty-state-text">Conclua sessões de estudo nas suas matérias para ver o tempo investido em cada uma.</p>`;
    return;
  }

  const max = Math.max(...rows.map((row) => row.minutes), 1);
  listEl.innerHTML = rows.map((row) => {
    const percent = Math.round((row.minutes / max) * 100);
    const colorClass = subjectColorClass(row.subject);
    return `<div class="subject-hours-row"><span class="subject-dot ${colorClass}"></span><b>${row.subject}</b><span class="progress-mini-track"><i class="${colorClass}" style="width:${percent}%"></i></span><strong>${formatMinutes(row.minutes)}</strong></div>`;
  }).join("");
}

function applyDashboardData(data) {
  state.sessions = data.today.map((row) => ({
    id: row.id,
    time: row.session_time,
    subject: row.subject,
    detail: row.detail,
    duration: `${row.duration_minutes} min`,
    tag: row.tag,
    tagClass: tagClassFor(row.tag),
    completed: row.completed
  }));

  const dailyMap = buildDailyMap(data.daily);
  const streak = computeStreak(dailyMap);

  renderSchedule();
  renderTodayCheck();
  renderStreakCard(dailyMap, streak);
  renderWeekMetric(dailyMap);
  renderWeeklyChart(dailyMap);
  renderProgressView(dailyMap, data.subjects, streak);

  state.studyAlerts = (data.suggestions || []).filter(
    (item) => !state.dismissedAlerts.has(syllabusKey(item.subject, item.topic))
  );
  renderStudyAlert();
}

// Notifica que já são 2h+ num tópico ainda em "Não sei" e oferece mudar o
// estado. Uma por vez: resolvida ou dispensada, a próxima da fila aparece.
function renderStudyAlert() {
  const alertEl = $("#study-alert");
  if (!alertEl) return;
  const item = state.studyAlerts[0];
  alertEl.classList.toggle("hidden", !item);
  if (!item) return;

  // Título: o total da matéria. Ao lado do tópico: o tempo só dele.
  const totalMateria = formatMinutes(item.subject_minutes || item.minutes);
  $("#study-alert-title").textContent = `${item.subject} · ${totalMateria} no total`;
  $("#study-alert-text").innerHTML =
    `Você estudou <b>${escapeHtml(item.topic)}</b> <span class="study-alert-time">${formatMinutes(item.minutes)}</span>. Como ficou seu entendimento desse conteúdo?`;
}

// Resposta da pessoa ao aviso: grava o nível escolhido na ementa. "Não entendi
// ainda" também é gravado (mesmo sem mudar o status): o updated_at da linha é o
// que faz o aviso calar até haver estudo novo nesse tópico.
async function answerTopicLevel(status) {
  const item = state.studyAlerts[0];
  if (!item) return;
  try {
    const response = await fetch(`${API_BASE}/api/syllabus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      // snooze só em "Não entendi ainda": os outros dois já saem da fila pelo status.
      body: JSON.stringify({ items: [{ subject: item.subject, topic: item.topic, status, snooze: status === "unknown" }] })
    });
    if (!response.ok) throw new Error("save failed");
    state.syllabus[syllabusKey(item.subject, item.topic)] = status;
    state.studyAlerts.shift();
    renderStudyAlert();
    renderSyllabusView();
    renderWeekPlan();
    showToast(`${item.topic}: ${SYLLABUS_STATUS_LABEL[status]}.`);
  } catch (error) {
    showToast("Não foi possível atualizar o tópico agora.");
  }
}

function dismissStudyAlert() {
  const item = state.studyAlerts.shift();
  if (item) state.dismissedAlerts.add(syllabusKey(item.subject, item.topic));
  renderStudyAlert();
}

// Seletor de datas da view de progresso: abre/fecha o menu, marca a opção
// ativa e recarrega o dashboard com a janela escolhida. O menu é absoluto,
// então abrir não empurra nada no layout.
function syncProgressRangeUi() {
  const cfg = PROGRESS_RANGES[state.progressRange];
  const labelEl = $("#progress-range-label");
  if (labelEl && cfg) labelEl.textContent = cfg.label;
  $$("#progress-range-menu .date-dropdown-item").forEach((item) =>
    item.classList.toggle("selected", item.dataset.range === state.progressRange)
  );
}

function closeDateRangeMenu() {
  const menu = $("#progress-range-menu");
  const button = $("#progress-range-button");
  if (!menu || menu.classList.contains("hidden")) return;
  menu.classList.add("hidden");
  if (button) button.setAttribute("aria-expanded", "false");
}

function toggleDateRangeMenu() {
  const menu = $("#progress-range-menu");
  const button = $("#progress-range-button");
  if (!menu) return;
  menu.classList.toggle("hidden");
  if (button) button.setAttribute("aria-expanded", String(!menu.classList.contains("hidden")));
}

function selectProgressRange(rangeKey) {
  if (!PROGRESS_RANGES[rangeKey]) return;
  closeDateRangeMenu();
  if (state.progressRange === rangeKey) return;
  state.progressRange = rangeKey;
  syncProgressRangeUi();
  fetchDashboard();
}

async function fetchDashboard() {
  try {
    const range = PROGRESS_RANGES[state.progressRange] ? state.progressRange : "30d";
    const response = await fetch(`${API_BASE}/api/dashboard?range=${range}`, { credentials: "include" });
    // 402: assinatura venceu no meio da sessão — volta para o paywall.
    if (response.status === 402) {
      state.user.plan = "free";
      showScreen("paywall-screen");
      const savedTheme = localStorage.getItem("studyforge-theme");
      if (savedTheme === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
      }
      return;
    }
    if (!response.ok) return;
    const data = await response.json();
    applyDashboardData(data);
  } catch (error) {
    // Mantém os últimos dados renderizados se o servidor ficar indisponível.
  }
}

async function fetchSyllabus() {
  try {
    const response = await fetch(`${API_BASE}/api/syllabus`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    state.syllabus = {};
    state.topicMinutes = {};
    (data.progress || []).forEach((row) => {
      state.syllabus[syllabusKey(row.subject, row.topic)] = row.status;
      if (row.minutes) state.topicMinutes[syllabusKey(row.subject, row.topic)] = row.minutes;
    });
    renderSyllabusView();
  } catch (error) {
    // Mantém o que já estava renderizado se o servidor cair.
  }
}

function renderSyllabusView() {
  const tag = $("#syllabus-objective-tag");
  if (tag) tag.innerHTML = `<span>${state.user.objective}</span>`;

  // Só as matérias do plano: a ementa não deve cobrar conteúdo que a pessoa
  // não vai estudar (antes caía para todas as matérias de SYLLABUS).
  const knownSubjects = planSubjects().filter((subject) => topicsForSubject(subject).length);

  const listEl = $("#syllabus-subject-list");
  if (listEl) {
    listEl.innerHTML = knownSubjects.map((subject) => {
      const { coverage, counts } = subjectMastery(subject);
      const total = topicsForSubject(subject).length;
      const colorClass = subjectColorClass(subject);
      return `<article class="panel syllabus-subject" data-syllabus-subject="${subject}">
        <div class="syllabus-subject-head"><span class="subject-dot ${colorClass}"></span><div><strong>${subject}</strong><small>${counts.mastered} de ${total} tópicos dominados</small></div><span class="syllabus-learned-pill">${coverage}% aprendido</span></div>
        <div class="syllabus-subject-bar"><i class="${colorClass}" style="width:${coverage}%"></i></div>
        <div class="syllabus-subject-foot"><span>${coverage}% da ementa</span><button class="text-button" data-action="open-syllabus" data-subject="${subject}">Preencher ementa <span>→</span></button></div>
      </article>`;
    }).join("");
  }

  const totals = { mastered: 0, learning: 0, unknown: 0 };
  knownSubjects.forEach((subject) => {
    const { counts } = subjectMastery(subject);
    totals.mastered += counts.mastered;
    totals.learning += counts.learning;
    totals.unknown += counts.unknown;
  });
  const totalTopics = totals.mastered + totals.learning + totals.unknown;

  ["mastered", "learning", "unknown"].forEach((status) => {
    const count = totals[status];
    const percent = totalTopics ? Math.round((count / totalTopics) * 100) : 0;
    const pctEl = $(`#syllabus-${status}-pct`);
    if (pctEl) pctEl.innerHTML = `${percent}<span>%</span>`;
    const countEl = $(`#syllabus-${status}-count`);
    if (countEl) countEl.textContent = `${count} de ${totalTopics} tópicos`;
    const barEl = $(`#syllabus-${status}-bar`);
    if (barEl) barEl.style.width = `${percent}%`;
  });

  const totalLearned = totalTopics ? Math.round((totals.mastered / totalTopics) * 100) : 0;

  const answered = knownSubjects.some((subject) => topicsForSubject(subject).some((topic) => state.syllabus[syllabusKey(subject, topic)]));
  const hintTitle = $("#syllabus-hint-title");
  const hintText = $("#syllabus-hint-text");
  if (hintTitle && hintText) {
    if (!answered) {
      hintTitle.textContent = "Comece pelo que ainda não viu.";
      hintText.textContent = "Preencha a ementa de cada matéria para o StudyForge priorizar os tópicos que faltam no seu plano.";
    } else {
      const focus = [...knownSubjects].sort((a, b) => subjectMastery(b).remaining - subjectMastery(a).remaining)[0];
      hintTitle.textContent = totalLearned >= 85 ? "Você está quase lá!" : `Foque em ${focus} agora.`;
      hintText.textContent = totalLearned >= 85
        ? "Você já aprendeu quase toda a ementa. Capriche na revisão dos últimos tópicos."
        : `${focus} é a matéria menos avançada (só ${subjectMastery(focus).coverage}% aprendido).`;
    }
  }
}

// <details> nativo: abre e fecha sem listener, sem estado e sem CSS de accordion.
function topicContentHtml(subject, topic) {
  const content = (TOPIC_CONTENT[subject] || {})[topic];
  if (!content) return "";
  return `<details class="topic-content">
    <summary>Resumo do tópico</summary>
    <div class="topic-content-body">
      <p>${content.summary}</p>
      <pre class="topic-formula">${content.formula}</pre>
      ${content.image ? `<figure>
        <img src="${content.image}" alt="${escapeHtml(topic)}" loading="lazy" />
        <figcaption>${content.caption} <span>Wikimedia Commons</span></figcaption>
      </figure>` : ""}
    </div>
  </details>`;
}

function syllabusRowHtml(subject, topic, current) {
  const safe = escapeHtml(topic);
  const options = ["unknown", "learning", "mastered"].map((status) =>
    `<button class="topic-option ${status} ${current === status ? "selected" : ""}" data-topic-status="${status}">${SYLLABUS_STATUS_LABEL[status]}</button>`
  ).join("");
  const frequencyTag = isHighFrequency(subject, topic)
    ? `<span class="topic-frequency" title="Tema recorrente nas provas do ENEM">🔥 cai muito</span>`
    : "";
  const level = topicDifficulty(subject, topic);
  const levelTag = level
    ? `<span class="topic-level topic-level-${level}" title="Dificuldade estimada do conteúdo">${TOPIC_DIFFICULTY_LABEL[level]}</span>`
    : "";
  const minutos = topicMinutes(subject, topic);
  return `<div class="syllabus-topic-row" data-topic="${safe}" data-status="${current}" data-minutes="${minutos}">
    <span class="syllabus-topic-name">${safe}${levelTag}${frequencyTag}</span>
    <div class="topic-options">${options}</div>
    <div class="topic-row-tools">
      <label class="topic-minutes" title="Duração do bloco desse tópico no plano">
        <input type="number" min="${TOPIC_MINUTES_MIN}" max="${TOPIC_MINUTES_MAX}" step="5" value="${minutos}" data-topic-minutes aria-label="Minutos por bloco de ${safe}" /><span>min</span>
      </label>
      <button class="topic-remove" data-action="remove-syllabus-topic" title="Excluir ${safe} da ementa" aria-label="Excluir ${safe}">✕</button>
    </div>
    ${topicContentHtml(subject, topic)}
  </div>`;
}

// Linha compacta de tópico excluído, com o caminho de volta. Sem isso, apagar um
// tópico da base seria irreversível pela interface.
function removedRowHtml(topic) {
  const safe = escapeHtml(topic);
  return `<div class="syllabus-removed-row" data-topic="${safe}">
    <span>${safe}</span>
    <button class="text-button" data-action="restore-syllabus-topic">Restaurar</button>
  </div>`;
}

let editingSyllabusSubject = null;
function openSyllabusModal(subject) {
  const topics = topicsForSubject(subject);
  if (!topics.length && !SYLLABUS[subject]) return;
  editingSyllabusSubject = subject;
  $("#syllabus-modal-title").textContent = `Ementa de ${subject}`;
  $("#syllabus-modal-sub").textContent = "Marque o quanto você já sabe de cada tópico, ajuste quanto tempo quer dedicar a ele e exclua o que não vai estudar.";
  $("#syllabus-new-topic").value = "";
  $("#syllabus-topic-list").innerHTML = topics
    .map((topic) => syllabusRowHtml(subject, topic, state.syllabus[syllabusKey(subject, topic)] || "unknown"))
    .join("");
  renderRemovedTopics();
  $("#syllabus-modal").classList.remove("hidden");
}

function renderRemovedTopics() {
  const box = $("#syllabus-removed");
  const removidos = removedTopics(editingSyllabusSubject);
  box.classList.toggle("hidden", !removidos.length);
  $("#syllabus-removed-summary").textContent = `${removidos.length} tópico${removidos.length === 1 ? "" : "s"} excluído${removidos.length === 1 ? "" : "s"}`;
  $("#syllabus-removed-list").innerHTML = removidos.map(removedRowHtml).join("");
}

// Excluir e restaurar só mexem no DOM; quem grava é saveSyllabus, então
// "Cancelar" desfaz tudo. Um tópico excluído só sai da ementa depois de salvar.
function removeSyllabusTopic(row) {
  const topic = row.dataset.topic;
  row.remove();
  $("#syllabus-removed-list").insertAdjacentHTML("beforeend", removedRowHtml(topic));
  const box = $("#syllabus-removed");
  box.classList.remove("hidden");
  box.open = true;
  const total = $$("#syllabus-removed-list .syllabus-removed-row").length;
  $("#syllabus-removed-summary").textContent = `${total} tópico${total === 1 ? "" : "s"} excluído${total === 1 ? "" : "s"}`;
  showToast(`"${topic}" sai da ementa quando você salvar.`);
}

function restoreSyllabusTopic(row) {
  const topic = row.dataset.topic;
  row.remove();
  $("#syllabus-topic-list").insertAdjacentHTML("beforeend", syllabusRowHtml(editingSyllabusSubject, topic, "unknown"));
  const total = $$("#syllabus-removed-list .syllabus-removed-row").length;
  $("#syllabus-removed").classList.toggle("hidden", !total);
  $("#syllabus-removed-summary").textContent = `${total} tópico${total === 1 ? "" : "s"} excluído${total === 1 ? "" : "s"}`;
}

function addSyllabusTopic() {
  const input = $("#syllabus-new-topic");
  const topic = input.value.trim();
  if (!topic) return;
  if (topic.length > 120) {
    showToast("Tópico muito longo (máximo 120 caracteres).");
    return;
  }
  const listEl = $("#syllabus-topic-list");
  const exists = $$(".syllabus-topic-row", listEl).some((row) => row.dataset.topic.toLowerCase() === topic.toLowerCase());
  if (exists) {
    showToast("Esse tópico já está na ementa.");
    input.focus();
    return;
  }
  listEl.insertAdjacentHTML("beforeend", syllabusRowHtml(editingSyllabusSubject, topic, "unknown"));
  input.value = "";
  input.focus();
  listEl.lastElementChild.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function closeSyllabusModal() {
  $("#syllabus-modal").classList.add("hidden");
  editingSyllabusSubject = null;
}

async function saveSyllabus() {
  if (!editingSyllabusSubject) return;
  const subject = editingSyllabusSubject;
  const items = $$("#syllabus-topic-list .syllabus-topic-row").map((row) => {
    const input = $("[data-topic-minutes]", row);
    const bruto = Number(input && input.value) || TOPIC_MINUTES_DEFAULT;
    return {
      subject,
      topic: row.dataset.topic,
      status: row.dataset.status || "unknown",
      minutes: Math.min(TOPIC_MINUTES_MAX, Math.max(TOPIC_MINUTES_MIN, Math.round(bruto)))
    };
  });
  // O que ficou na gaveta de excluídos vai como "removed" na mesma requisição.
  const removidos = $$("#syllabus-removed-list .syllabus-removed-row").map((row) => ({
    subject, topic: row.dataset.topic, status: "removed"
  }));
  const items_e_removidos = [...items, ...removidos];
  if (!items_e_removidos.length) {
    closeSyllabusModal();
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/syllabus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ items: items_e_removidos })
    });
    if (!response.ok) throw new Error("save failed");
    items_e_removidos.forEach((item) => {
      state.syllabus[syllabusKey(item.subject, item.topic)] = item.status;
      if (item.minutes) state.topicMinutes[syllabusKey(item.subject, item.topic)] = item.minutes;
    });
    closeSyllabusModal();
    renderSyllabusView();
    renderWeekPlan();
    const { coverage } = subjectMastery(subject);
    showToast(`Ementa de ${subject} salva. Você já aprendeu ${coverage}%.`);
  } catch (error) {
    showToast("Não foi possível salvar sua ementa agora.");
  }
}

function enterDashboard() {
  setUserLabels();
  renderWeekPlan();
  renderSyllabusView();
  showScreen("dashboard-screen");
  switchView("overview");
  fetchDashboard();
  fetchSyllabus();
  const savedTheme = localStorage.getItem("studyforge-theme");
  if (savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  }
}

// Portão de pagamento no front. O bloqueio real é o requirePlus do servidor;
// esta tela só evita mostrar um painel que não carregaria dados nenhum.
function enterAppOrPaywall() {
  if (state.user.plan !== "plus") {
    showScreen("paywall-screen");
    renderPaywallPrice();
    const savedTheme = localStorage.getItem("studyforge-theme");
    if (savedTheme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
    return;
  }
  enterDashboard();
}

// Busca o preço na Stripe em vez de deixá-lo escrito no HTML, para a tela não
// anunciar um valor diferente do que é cobrado. Se não vier, o parágrafo fica
// vazio (e some pelo `:empty` do CSS): sem preço é melhor que preço errado.
const PRICE_INTERVAL_LABEL = { day: "dia", week: "semana", month: "mês", year: "ano" };
async function renderPaywallPrice() {
  const el = $("#paywall-price");
  if (!el || el.textContent.trim()) return;
  try {
    const response = await fetch(`${API_BASE}/api/billing/price`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    if (typeof data.amount !== "number") return;
    const valor = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: (data.currency || "brl").toUpperCase()
    }).format(data.amount / 100);
    const periodo = PRICE_INTERVAL_LABEL[data.interval];
    el.innerHTML = periodo
      ? `Depois do teste: <strong>${valor}</strong> por ${periodo}, cancele quando quiser.`
      : `Valor: <strong>${valor}</strong>.`;
  } catch (error) {
    // Rede fora: melhor não mostrar preço nenhum.
  }
}

// Relê o plano no servidor (usado ao voltar do Stripe e no botão "Verificar
// novamente", para o caso do webhook chegar depois do redirect).
async function refreshPlan() {
  try {
    const response = await fetch(`${API_BASE}/api/me`, { credentials: "include" });
    if (!response.ok) return false;
    const data = await response.json();
    state.user.plan = data.plan || "free";
    return state.user.plan === "plus";
  } catch (error) {
    return false;
  }
}

function goToOnboarding() {
  showScreen("onboarding-screen");
  state.step = 1;
  $(".form-card").classList.remove("is-generating");
  $("#generating-state").classList.remove("active");
  updateOnboardingProgress();
  const savedTheme = localStorage.getItem("studyforge-theme");
  if (savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  }
}

function goToLogin(step = "login-form") {
  showScreen("login-screen");
  $("#login-form").reset();
  showLoginStep(step);
  const savedTheme = localStorage.getItem("studyforge-theme");
  if (savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  }
}

// Login, "esqueci a senha" e "nova senha" são três .form-step no mesmo card.
function showLoginStep(formId) {
  ["login-form", "forgot-form", "reset-form"].forEach((id) => {
    $(`#${id}`).classList.toggle("active", id === formId);
  });
}

function switchView(view) {
  state.currentView = view;
  $$("[data-view-panel]").forEach((panel) => panel.classList.toggle("active-view", panel.dataset.viewPanel === view));
  $$(".side-nav-item[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  const labels = { overview: "Visão geral", plan: "Meu plano", syllabus: "Minha ementa", progress: "Meu progresso" };
  $("#breadcrumb-current").textContent = labels[view] || "Visão geral";
  $(".sidebar")?.classList.remove("sidebar-open");
}

function openPlanModal() {
  $$("#plan-modal-subjects .subject").forEach((button) => {
    button.classList.toggle("selected", state.user.subjects.includes(button.dataset.subject));
  });
  $("#plan-modal-days").value = state.user.days;
  $("#plan-modal-time-start").value = state.user.studyTimeStart;
  $("#plan-modal-time-end").value = state.user.studyTimeEnd;
  $("#plan-modal-break").value = Number.isInteger(state.user.breakMinutes) ? state.user.breakMinutes : DEFAULT_BREAK_MINUTES;
  $("#plan-modal").classList.remove("hidden");
}

function closePlanModal() {
  $("#plan-modal").classList.add("hidden");
}

function savePlanFromModal() {
  const subjects = $$("#plan-modal-subjects .subject.selected").map((button) => button.dataset.subject);
  if (!subjects.length) {
    showToast("Escolha pelo menos uma matéria.");
    return;
  }
  state.user.subjects = subjects;
  state.user.days = Number($("#plan-modal-days").value) || state.user.days;
  state.user.studyTimeStart = $("#plan-modal-time-start").value || state.user.studyTimeStart;
  state.user.studyTimeEnd = $("#plan-modal-time-end").value || state.user.studyTimeEnd;
  const breakInput = Math.round(Number($("#plan-modal-break").value));
  state.user.breakMinutes = Number.isInteger(breakInput)
    ? Math.min(240, Math.max(0, breakInput))
    : DEFAULT_BREAK_MINUTES;
  closePlanModal();
  saveProfile();
  setUserLabels();
  renderWeekPlan();
  renderSyllabusView();
  showToast("Plano atualizado com seu novo foco.");
}

// --- Edição manual de um bloco do plano (botão de lápis) --------------------
let editingPlanSlot = null;

function openPlanSlotModal(card) {
  editingPlanSlot = { day: card.dataset.day, slot: card.dataset.slot };
  const subjects = planSubjects();
  $("#plan-slot-subject").innerHTML = subjects
    .map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`)
    .join("");
  $("#plan-slot-subject").value = card.dataset.subject;
  if (!$("#plan-slot-subject").value) $("#plan-slot-subject").selectedIndex = 0;
  $("#plan-slot-topic").value = card.dataset.topic || "";
  // true: mostra a ementa inteira, não só o que bate com o valor já preenchido
  // (senão reabrir um bloco já editado mostraria só aquele tópico na lista).
  renderPlanSlotTopicList(true);
  $("#plan-slot-modal").classList.remove("hidden");
}

// Lista própria em vez de <datalist>: o nível ao lado do tópico não aparece
// em <option label>, a maioria dos navegadores ignora esse atributo.
// `ignoreFilter`: ao focar o campo, mostra a ementa inteira mesmo com texto já
// digitado; só filtra de verdade a partir da próxima tecla.
function renderPlanSlotTopicList(ignoreFilter) {
  const subject = $("#plan-slot-subject").value;
  const digitado = ignoreFilter ? "" : $("#plan-slot-topic").value.trim().toLowerCase();
  const listEl = $("#plan-slot-topic-list");
  const topics = topicsForSubject(subject)
    .filter((topic) => !digitado || topic.toLowerCase().includes(digitado));

  if (!topics.length) {
    listEl.classList.add("hidden");
    return;
  }
  listEl.innerHTML = topics.map((topic) => {
    const status = state.syllabus[syllabusKey(subject, topic)] || "unknown";
    return `<button type="button" class="topic-picker-item" data-topic="${escapeHtml(topic)}">
      <span>${escapeHtml(topic)}</span>
      <span class="status-pill ${status}">${SYLLABUS_STATUS_LABEL[status]}</span>
    </button>`;
  }).join("");
  listEl.classList.remove("hidden");
}

function fillPlanSlotTopics() {
  $("#plan-slot-topic").value = "";
  renderPlanSlotTopicList();
}

function closePlanSlotModal() {
  $("#plan-slot-modal").classList.add("hidden");
  $("#plan-slot-topic-list").classList.add("hidden");
  editingPlanSlot = null;
}

function savePlanSlot() {
  if (!editingPlanSlot) return;
  const subject = $("#plan-slot-subject").value;
  const topic = $("#plan-slot-topic").value.trim().slice(0, 120);
  state.planOverrides[`${editingPlanSlot.day}-${editingPlanSlot.slot}`] = { subject, topic };
  closePlanSlotModal();
  renderWeekPlan();
  renderTodayCheck();
  showToast("Bloco atualizado.");
}

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  localStorage.setItem("studyforge-theme", theme);
}

function openSettingsModal() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  $("#dark-mode-toggle").checked = isDark;
  $("#settings-modal").classList.remove("hidden");
}

function closeSettingsModal() {
  $("#settings-modal").classList.add("hidden");
}

function openLogSessionModal() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  $("#log-session-time").value = `${hh}:${mm}`;
  $("#log-session-minutes").value = 30;
  $("#log-session-detail").value = "";
  // Só as matérias do plano, e sempre relidas: trocar as matérias no plano muda
  // esta lista sem recarregar a página.
  $("#log-session-subject").innerHTML = planSubjects()
    .map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`)
    .join("");
  fillLogSessionTopics();
  $("#log-session-modal").classList.remove("hidden");
}

// Sugere os tópicos da ementa da matéria escolhida. Se o nome bater com um
// tópico, o tempo conta para ele — é o que dispara a notificação das 2h.
// Texto livre continua valendo: aí a sessão só entra no total do dia.
function fillLogSessionTopics() {
  const topics = topicsForSubject($("#log-session-subject").value);
  $("#log-session-topics").innerHTML = topics
    .map((topic) => `<option value="${escapeHtml(topic)}"></option>`)
    .join("");
}

function closeLogSessionModal() {
  $("#log-session-modal").classList.add("hidden");
}

async function submitLogSession() {
  const subject = $("#log-session-subject").value;
  const minutes = Number($("#log-session-minutes").value);
  const time = $("#log-session-time").value || "08:00";
  // Tag "Extra" identifica o que foi estudado fora do plano; ela já tem estilo
  // próprio em tagClassFor() e aparece assim no painel de hoje.
  const detail = ($("#log-session-detail").value || "").trim().slice(0, 120);

  if (!detail) {
    showToast("Escreva qual conteúdo você estudou.");
    $("#log-session-detail").focus();
    return;
  }
  if (!minutes || minutes <= 0) {
    showToast("Informe quantos minutos você estudou.");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ subject, detail, time, duration: minutes, tag: "Extra", completed: true })
    });
    if (!response.ok) throw new Error("create failed");
    await fetchDashboard();
    closeLogSessionModal();
    showToast(`Sessão registrada: ${formatMinutes(minutes)} de ${subject}.`);
  } catch (error) {
    showToast("Não foi possível registrar a sessão agora.");
  }
}

// Abre o portal da Stripe (cancelar, trocar cartão, faturas). Quem ainda não
// assinou cai no checkout, porque não existe customer para gerenciar.
async function openBillingPortal() {
  if (state.user.plan !== "plus") {
    startCheckout();
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/api/billing/portal`, { method: "POST", credentials: "include" });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Não foi possível abrir o portal de assinatura.");
      return;
    }
    window.location.href = data.url;
  } catch (error) {
    showToast("Não foi possível conectar ao servidor.");
  }
}

async function startCheckout() {
  try {
    const response = await fetch(`${API_BASE}/api/billing/checkout`, { method: "POST", credentials: "include" });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Não foi possível iniciar o pagamento.");
      return;
    }
    window.location.href = data.url;
  } catch (error) {
    showToast("Não foi possível conectar ao servidor.");
  }
}

function showToast(message) {
  const toast = $("#toast");
  $("#toast-message").textContent = message;
  toast.classList.add("show");
}

document.addEventListener("click", async (event) => {
  const actionTarget = event.target.closest("[data-action]");
  const viewTarget = event.target.closest("[data-view-target]");
  const navTarget = event.target.closest(".side-nav-item[data-view]");
  const choiceTarget = event.target.closest("[data-choice-group]");
  const subjectTarget = event.target.closest(".subject");

  if (actionTarget) {
    const action = actionTarget.dataset.action;
    if (action === "start") goToOnboarding();
    if (action === "login") goToLogin();
    if (action === "goto-login") goToLogin();
    if (action === "forgot-password") showLoginStep("forgot-form");
    if (action === "back-to-login") goToLogin();
    if (action === "back-landing") showScreen("landing-screen");
    if (action === "landing-page") showScreen("landing-page-screen");
    if (action === "next-step") {
      if (state.step === 1) {
        actionTarget.disabled = true;
        const registered = await registerUser();
        actionTarget.disabled = false;
        if (!registered) return;
      }
      state.step = Math.min(3, state.step + 1);
      updateOnboardingProgress();
    }
    if (action === "prev-step") {
      state.step = Math.max(1, state.step - 1);
      updateOnboardingProgress();
    }
    if (action === "generate-plan") {
      collectFormData();
      if (!state.user.subjects.length) {
        showToast("Escolha pelo menos uma matéria.");
        return;
      }
      saveProfile();
      $(".form-card").classList.add("is-generating");
      setTimeout(enterAppOrPaywall, 1900);
    }
    if (action === "demo") {
      $("#features").scrollIntoView({ behavior: "smooth" });
      showToast("Este é o jeito StudyForge de organizar sua rotina.");
    }
    if (action === "upgrade") startCheckout();
    if (action === "manage-subscription") openBillingPortal();
    if (action === "refresh-plan") {
      if (await refreshPlan()) enterDashboard();
      else showToast("Ainda não vemos uma assinatura ativa nesta conta.");
    }
    if (action === "regenerate") openPlanModal();
    if (action === "close-plan-modal") closePlanModal();
    if (action === "save-plan") savePlanFromModal();
    if (action === "edit-plan-slot") openPlanSlotModal(event.target.closest(".week-session"));
    if (action === "close-plan-slot-modal") closePlanSlotModal();
    if (action === "save-plan-slot") savePlanSlot();
    if (action === "open-syllabus") openSyllabusModal(actionTarget.dataset.subject);
    if (action === "remove-syllabus-topic") removeSyllabusTopic(event.target.closest(".syllabus-topic-row"));
    if (action === "restore-syllabus-topic") restoreSyllabusTopic(event.target.closest(".syllabus-removed-row"));
    if (action === "add-syllabus-topic") addSyllabusTopic();
    if (action === "close-syllabus-modal") closeSyllabusModal();
    if (action === "save-syllabus") await saveSyllabus();
    if (action === "toggle-password") {
      const input = actionTarget.parentElement.querySelector("input");
      if (input) {
        const reveal = input.type === "password";
        input.type = reveal ? "text" : "password";
        actionTarget.innerHTML = reveal ? EYE_OPEN : EYE_CLOSED;
        actionTarget.setAttribute("aria-label", reveal ? "Ocultar senha" : "Mostrar senha");
      }
    }
    if (action === "answer-topic-level") await answerTopicLevel(actionTarget.dataset.level);
    if (action === "dismiss-study-alert") dismissStudyAlert();
    if (action === "open-log-session") openLogSessionModal();
    if (action === "close-log-session-modal") closeLogSessionModal();
    if (action === "save-log-session") await submitLogSession();
    if (action === "toggle-sidebar") $(".sidebar").classList.toggle("sidebar-open");
    if (action === "toggle-date-range") toggleDateRangeMenu();
    if (action === "select-date-range") selectProgressRange(actionTarget.dataset.range);
    if (action === "open-settings") openSettingsModal();
    if (action === "close-settings-modal") closeSettingsModal();
    if (action === "logout") {
      await fetch(`${API_BASE}/api/logout`, { method: "POST", credentials: "include" });
      window.location.reload();
    }
  }

  if (viewTarget) switchView(viewTarget.dataset.viewTarget);
  if (navTarget) switchView(navTarget.dataset.view);
  if (choiceTarget) {
    const group = choiceTarget.dataset.choiceGroup;
    $$(`[data-choice-group="${group}"]`).forEach((choice) => choice.classList.remove("selected"));
    choiceTarget.classList.add("selected");
  }
  if (subjectTarget) subjectTarget.classList.toggle("selected");

  const topicOption = event.target.closest(".topic-option");
  if (topicOption) {
    const row = topicOption.closest(".syllabus-topic-row");
    row.dataset.status = topicOption.dataset.topicStatus;
    $$(".topic-option", row).forEach((option) => option.classList.toggle("selected", option === topicOption));
  }

  const session = event.target.closest(".schedule-item");
  if (session && event.target.closest(".schedule-check")) {
    const sessionId = Number(session.dataset.sessionId);
    // Sem id é um bloco só previsto (painel de hoje em "Meu progresso"):
    // confirmar cria a sessão em vez de alternar uma que já existe.
    if (!sessionId) {
      await confirmPlannedSession(session.dataset);
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/sessions/${sessionId}/toggle`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("toggle failed");
      const updated = await response.json();
      await fetchDashboard();
      showToast(updated.completed ? "Boa! Sessão concluída." : "Sessão reaberta para você retomar.");
    } catch (error) {
      showToast("Não foi possível atualizar a sessão agora.");
    }
  }

});

$("#log-session-subject").addEventListener("change", fillLogSessionTopics);
// Trocar a matéria zera o tópico digitado (ele era de outra matéria) e
// mostra a lista de novo; digitar filtra; clicar num item escolhe; clicar fora
// ou fechar o modal esconde.
$("#plan-slot-subject").addEventListener("change", fillPlanSlotTopics);
// Sem o wrapper, o próprio evento do listener viraria o argumento ignoreFilter
// (e um objeto é sempre "verdadeiro"), quebrando o filtro ao digitar.
$("#plan-slot-topic").addEventListener("input", () => renderPlanSlotTopicList());
$("#plan-slot-topic").addEventListener("focus", () => renderPlanSlotTopicList(true));
$("#plan-slot-topic-list").addEventListener("mousedown", (event) => {
  const item = event.target.closest(".topic-picker-item");
  if (!item) return;
  event.preventDefault(); // não deixa o input perder o foco antes do clique registrar
  $("#plan-slot-topic").value = item.dataset.topic;
  $("#plan-slot-topic-list").classList.add("hidden");
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".topic-picker")) $("#plan-slot-topic-list").classList.add("hidden");
});
// Fecha o seletor de datas num clique fora (botão e menu ficam de fora).
document.addEventListener("click", (event) => {
  if (!event.target.closest("#progress-range-button") && !event.target.closest("#progress-range-menu")) closeDateRangeMenu();
});

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = $("#login-form button[type=submit]");
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;

  if (!email || !password) {
    showToast("Preencha e-mail e senha para entrar.");
    return;
  }

  submitButton.disabled = true;
  const loggedIn = await loginUser(email, password);
  submitButton.disabled = false;
  if (loggedIn) enterAppOrPaywall();
});

// Token do link de recuperação, lido da URL em handlePasswordResetLink().
let resetToken = null;

$("#forgot-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = $("#forgot-form button[type=submit]");
  const email = $("#forgot-email").value.trim();
  if (!email) {
    showToast("Informe o e-mail da sua conta.");
    return;
  }

  submitButton.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/api/password/forgot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Erro ao enviar o e-mail.");
    // Mensagem igual exista ou não a conta: o servidor não revela quem existe.
    showToast("Se existir uma conta com esse e-mail, o link de recuperação já está a caminho.");
    $("#forgot-form").reset();
    goToLogin();
  } catch (error) {
    showToast(error.message);
  }
  submitButton.disabled = false;
});

$("#reset-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = $("#reset-form button[type=submit]");
  const password = $("#reset-password").value;
  const confirmation = $("#reset-password-confirm").value;

  if (password.length < 6) {
    showToast("A nova senha precisa ter pelo menos 6 caracteres.");
    return;
  }
  if (password !== confirmation) {
    showToast("As duas senhas não são iguais.");
    return;
  }

  submitButton.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/api/password/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token: resetToken, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Erro ao redefinir a senha.");
    resetToken = null;
    $("#reset-form").reset();
    goToLogin();
    showToast("Senha redefinida! Entre com a nova senha.");
  } catch (error) {
    showToast(error.message);
  }
  submitButton.disabled = false;
});

$("#plan-modal").addEventListener("click", (event) => {
  if (event.target.id === "plan-modal") closePlanModal();
});

$("#log-session-modal").addEventListener("click", (event) => {
  if (event.target.id === "log-session-modal") closeLogSessionModal();
});

$("#settings-modal").addEventListener("click", (event) => {
  if (event.target.id === "settings-modal") closeSettingsModal();
});

$("#syllabus-modal").addEventListener("click", (event) => {
  if (event.target.id === "syllabus-modal") closeSyllabusModal();
});

// Landing page carousel
let carouselIndex = 0;
const carouselTrack = $("#carousel-track");
const carouselSlides = $$(".carousel-slide");
const carouselIndicators = $("#carousel-indicators");

function initCarousel() {
  if (!carouselTrack || !carouselIndicators) return;
  carouselIndicators.innerHTML = "";
  carouselSlides.forEach((_, i) => {
    const dot = document.createElement("button");
    dot.className = "carousel-dot" + (i === 0 ? " active" : "");
    dot.dataset.index = i;
    dot.setAttribute("aria-label", `Slide ${i + 1}`);
    dot.addEventListener("click", () => goToSlide(i));
    carouselIndicators.appendChild(dot);
  });
}

function goToSlide(index) {
  if (!carouselTrack) return;
  carouselIndex = Math.max(0, Math.min(index, carouselSlides.length - 1));
  carouselTrack.style.transform = `translateX(-${carouselIndex * 100}%)`;
  $$(".carousel-slide").forEach((slide, i) => slide.classList.toggle("active", i === carouselIndex));
  $$(".carousel-dot").forEach((dot, i) => dot.classList.toggle("active", i === carouselIndex));
}

$("#syllabus-new-topic").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addSyllabusTopic();
  }
});

$("#dark-mode-toggle").addEventListener("change", (event) => {
  applyTheme(event.target.checked ? "dark" : "light");
});

applyTheme(localStorage.getItem("studyforge-theme") === "dark" ? "dark" : "light");

const weeklyChartEl = $("#weekly-line-chart");
if (weeklyChartEl) {
  weeklyChartEl.addEventListener("mouseover", (event) => {
    const marker = event.target.closest(".line-marker");
    const tip = $("#weekly-chart-tooltip");
    if (!marker || !tip) return;
    tip.textContent = `${marker.dataset.label}: ${formatMinutes(Number(marker.dataset.min))}`;
    tip.style.left = marker.style.left;
    tip.style.top = `calc(${marker.style.top} - 12px)`;
    tip.classList.remove("hidden");
  });
  weeklyChartEl.addEventListener("mouseout", (event) => {
    if (!event.target.closest(".line-marker")) return;
    const tip = $("#weekly-chart-tooltip");
    if (tip) tip.classList.add("hidden");
  });
}

// Landing page video demo
function playVideoDemo() {
  const placeholder = $("#video-placeholder");
  if (!placeholder) return;
  placeholder.innerHTML = `
    <iframe 
      width="100%" 
      height="100%" 
      src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0" 
      title="StudyForge AI - Demo" 
      frameborder="0" 
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
      allowfullscreen>
</iframe>
  `;
  placeholder.removeAttribute("data-action");
}

async function restoreSession() {
  try {
    const response = await fetch(`${API_BASE}/api/me`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    state.user.id = data.id;
    state.user.name = data.name;
    state.user.plan = data.plan || "free";
    applyProfile(data.profile);
    enterAppOrPaywall();
    handleCheckoutRedirect();
  } catch (error) {
    // Sem conexão com o servidor: permanece na landing page.
  }
}

async function handleCheckoutRedirect() {
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get("checkout");
  params.delete("checkout");
  const newUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
  window.history.replaceState({}, "", newUrl);
  if (!checkout) return;

  if (checkout === "cancelled") {
    showToast("Assinatura não concluída.");
    return;
  }
  if (checkout !== "success") return;

  // O webhook do Stripe pode chegar um instante depois deste redirect, então
  // insistimos algumas vezes antes de desistir e pedir para recarregar.
  showToast("Pagamento recebido, confirmando sua assinatura...");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (await refreshPlan()) {
      enterDashboard();
      showToast("Assinatura confirmada! Bem-vindo ao StudyForge.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  showToast("Ainda estamos confirmando seu pagamento. Recarregue a página em instantes.");
}

// Chegou por um link de recuperação: mostra o formulário de nova senha em vez
// de restaurar a sessão (que jogaria direto no dashboard se o cookie existir).
function handlePasswordResetLink() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("reset");
  if (!token) return false;
  resetToken = token;
  params.delete("reset");
  window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
  goToLogin("reset-form");
  return true;
}

if (!handlePasswordResetLink()) restoreSession();
