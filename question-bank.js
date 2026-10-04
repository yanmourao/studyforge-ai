// Acervo autoral de prática; gabarito restrito ao servidor.
const bank = {
"Matemática": [
["Funções","Se f(x) = 2x + 3, quanto vale f(4)?",["7","8","11","14"],2,"2 × 4 + 3 = 11."],
["Logaritmos","Quanto vale log₁₀(1000)?",["2","3","10","100"],1,"10³ = 1000."],
["Progressões","Qual é o próximo termo de 3, 7, 11, 15?",["17","18","19","20"],2,"A razão é 4: 15 + 4 = 19."],
["Geometria plana","Um triângulo tem base 8 cm e altura correspondente 5 cm. Qual é sua área?",["13 cm²","20 cm²","40 cm²","80 cm²"],1,"Área = base × altura ÷ 2 = 20 cm²."],
["Geometria espacial","Qual é o volume de um cubo de aresta 3 cm?",["9 cm³","18 cm³","27 cm³","36 cm³"],2,"Volume = 3³ = 27 cm³."],
["Trigonometria","Em um triângulo retângulo, o cateto oposto a um ângulo mede 3 e a hipotenusa 5. Qual é o seno desse ângulo?",["3/5","4/5","5/3","3/4"],0,"Seno = cateto oposto ÷ hipotenusa."],
["Combinatória","De quantas maneiras três livros diferentes podem ser ordenados?",["3","6","9","12"],1,"São 3! = 3 × 2 × 1 = 6 permutações."],
["Probabilidade","Qual a probabilidade de sair um número par em um dado justo de seis faces?",["1/6","1/3","1/2","2/3"],2,"Três faces pares em seis: 3/6 = 1/2."],
["Estatística","Qual a média aritmética de 4, 6 e 8?",["5","6","7","8"],1,"(4 + 6 + 8) ÷ 3 = 6."],
["Matemática financeira","Um produto de R$ 200 recebe desconto de 15%. Qual o preço final?",["R$ 150","R$ 170","R$ 185","R$ 195"],1,"O desconto é R$ 30: 200 − 30 = 170."]
],
"Português": [
["Interpretação","Em ‘Embora cansada, Ana terminou o trabalho’, ‘embora’ expressa:",["Causa","Conclusão","Concessão","Finalidade"],2,"Concessão indica um obstáculo que não impede o fato."],
["Gêneros textuais","Qual a finalidade principal de uma notícia?",["Ensinar receitas","Informar acontecimentos","Apresentar versos","Instruir uma montagem"],1,"Notícias relatam acontecimentos de interesse público."],
["Figuras de linguagem","Em ‘A vida é uma viagem’, qual figura está presente?",["Metáfora","Onomatopeia","Eufemismo","Hipérbole"],0,"A metáfora aproxima conceitos sem termo comparativo explícito."],
["Funções da linguagem","Em ‘Compre agora!’, qual função predomina?",["Metalinguística","Fática","Emotiva","Conativa"],3,"A função conativa busca influenciar o receptor."],
["Variação linguística","Nomes diferentes para um alimento em regiões distintas exemplificam variação:",["Regional","Exclusivamente histórica","Exclusivamente etária","Biológica"],0,"Variação regional relaciona diferenças linguísticas a lugares."],
["Sintaxe","Em ‘Os alunos chegaram cedo’, qual é o sujeito?",["Chegaram","Cedo","Os alunos","Alunos chegaram"],2,"‘Os alunos’ é o sujeito; ‘chegaram cedo’ é o predicado."],
["Concordância","Qual frase segue a concordância da norma-padrão?",["Fazem dois anos que estudo.","Faz dois anos que estudo.","Os aluno chegaram.","As pessoas chegou."],1,"Fazer indicando tempo decorrido é impessoal e fica no singular."],
["Regência","No sentido de ver, qual frase segue a regência tradicional?",["Assistimos o filme.","Assistimos no filme.","Assistimos ao filme.","Assistimos pelo filme."],2,"Assistir no sentido de ver exige a preposição a na regência tradicional."],
["Crase","Em qual frase a crase está correta?",["Entreguei à ela.","Comecei à estudar.","Fui à escola.","Viajei à pé."],2,"A preposição a e o artigo a formam à."],
["Redação","Em um texto dissertativo-argumentativo, a tese é:",["A lista de fontes","O ponto de vista central defendido","Uma fala de personagem","O título de qualquer parágrafo"],1,"A tese é a posição sustentada pelos argumentos."]
],
"Biologia": [
["Citologia","Qual organela produz a maior parte do ATP na respiração aeróbia de células eucarióticas?",["Lisossomo","Complexo golgiense","Mitocôndria","Ribossomo"],2,"A mitocôndria realiza etapas da respiração aeróbia, incluindo a fosforilação oxidativa."],
["Bioquímica","Enzimas atuam principalmente como:",["Catalisadores biológicos","Reservas de água","Inibidores de todas as reações","Componentes exclusivos do DNA"],0,"Enzimas aceleram reações, reduzindo a energia de ativação."],
["Genética","Em Aa × Aa, qual a probabilidade de descendente aa?",["0%","25%","50%","100%"],1,"AA, Aa, Aa e aa: um em quatro."],
["Evolução","A seleção natural favorece, em certo ambiente, indivíduos com:",["Mudanças genéticas por vontade própria","Características hereditárias que aumentam o sucesso reprodutivo","Maior tamanho sempre","Ausência de mutações"],1,"Características vantajosas podem aumentar sobrevivência e reprodução naquele ambiente."],
["Ecologia","Plantas fotossintetizantes são:",["Consumidores primários","Consumidores secundários","Produtores","Predadores"],2,"Produtores sintetizam matéria orgânica a partir de substâncias inorgânicas."],
["Fisiologia","Onde ocorre a maior parte das trocas gasosas nos pulmões?",["Traqueia","Alvéolos","Laringe","Diafragma"],1,"As paredes finas dos alvéolos e os capilares permitem as trocas."],
["Botânica","Qual tecido transporta água e sais minerais das raízes?",["Floema","Epiderme","Xilema","Meristema apical"],2,"O xilema conduz a seiva bruta."],
["Zoologia","Qual característica é típica dos mamíferos?",["Glândulas mamárias","Respiração exclusivamente por brânquias","Ausência de coluna vertebral","Exoesqueleto de quitina"],0,"Glândulas mamárias caracterizam os mamíferos."],
["Microbiologia","Vírus dependem de células hospedeiras para reprodução porque:",["São bactérias","Não possuem maquinaria celular completa para reprodução autônoma","Fazem fotossíntese","Possuem tecidos próprios"],1,"Vírus usam estruturas e processos da célula hospedeira."],
["Biotecnologia","A PCR é usada para:",["Amplificar segmentos de DNA","Produzir órgãos instantaneamente","Medir apenas glicose","Eliminar todas as mutações"],0,"A PCR produz muitas cópias de um segmento de DNA."]
],
"História": [
["Antiguidade","Quem participava diretamente das decisões na democracia ateniense clássica?",["Todos os habitantes","Apenas mulheres livres","Homens adultos reconhecidos como cidadãos atenienses","Todos os escravizados"],2,"Mulheres, estrangeiros e escravizados eram excluídos da cidadania política."],
["Idade Média","Suserania e vassalagem envolviam:",["Fidelidade e obrigações entre nobres","Sufrágio universal","Contratos industriais","Igualdade jurídica universal"],0,"Estabeleciam obrigações recíprocas, como proteção e serviço militar."],
["Navegações","Uma motivação econômica das navegações portuguesas era:",["Encerrar comércio marítimo","Buscar rotas para o Oriente","Implantar fábricas de carros","Proibir especiarias"],1,"Buscavam acesso a especiarias e outros produtos orientais."],
["Brasil colônia","A produção açucareira colonial foi marcada por:",["Pequenas propriedades sem exportação","Trabalho apenas assalariado","Latifúndio, monocultura e trabalho escravizado","Ausência de comércio externo"],2,"Grandes propriedades produziam açúcar para exportação com trabalho escravizado."],
["Iluminismo","Uma ideia iluminista é:",["Crítica ao absolutismo e valorização da razão","Defesa unânime de reis absolutos","Rejeição de toda ciência","Fim dos debates políticos"],0,"Iluministas valorizaram a razão e questionaram poder e privilégios."],
["Independência","A independência do Brasil foi proclamada em:",["1500","1789","1822","1889"],2,"A proclamação ocorreu em 1822."],
["Primeira República","O coronelismo relacionava-se a:",["Controle político local e influência sobre eleitores","Ausência de elites agrárias","Voto eletrônico","Igualdade política"],0,"Elites locais exerciam influência por favores, dependência econômica e coerção."],
["Era Vargas","A CLT foi promulgada em 1943 no governo de:",["Dom Pedro II","Getúlio Vargas","Juscelino Kubitschek","Deodoro da Fonseca"],1,"A CLT foi promulgada durante o Estado Novo, no governo Vargas."],
["Guerras mundiais","Qual evento marca o início da Segunda Guerra Mundial na Europa?",["Queda do Muro de Berlim","Independência dos EUA","Invasão alemã da Polônia em 1939","Revolução Francesa"],2,"A invasão levou Reino Unido e França a declararem guerra à Alemanha."],
["Guerra Fria","Os principais polos da Guerra Fria foram:",["Portugal e Espanha","Estados Unidos e União Soviética","Atenas e Esparta","Brasil e Argentina"],1,"EUA e URSS lideraram blocos rivais após a Segunda Guerra Mundial."]
],
"Física": [
["Cinemática","Um carro percorre 120 km em 2 h. Qual sua velocidade média?",["30 km/h","60 km/h","120 km/h","240 km/h"],1,"120 ÷ 2 = 60 km/h."],
["Newton","Força resultante de 10 N atua em massa de 2 kg. Qual a aceleração?",["2 m/s²","5 m/s²","10 m/s²","20 m/s²"],1,"a = F/m = 5 m/s²."],
["Trabalho","Força de 20 N move um corpo por 3 m no mesmo sentido da força. Qual o trabalho?",["6 J","23 J","60 J","120 J"],2,"W = F × d = 60 J."],
["Hidrostática","Em líquido em repouso de densidade constante, a pressão aumenta quando:",["A profundidade aumenta","A profundidade diminui","A gravidade desaparece","O recipiente fica menor sempre"],0,"Pressão hidrostática = ρgh; cresce com a profundidade."],
["Termologia","Calor é energia transferida por diferença de:",["Massa","Temperatura","Volume","Velocidade horizontal"],1,"Calor é energia em trânsito devido à diferença de temperatura."],
["Óptica","Em espelho plano, a imagem de um objeto real é:",["Real e ampliada","Virtual e do mesmo tamanho","Invertida verticalmente","Menor e real"],1,"A imagem é virtual, direita e do mesmo tamanho."],
["Ondas","Uma onda tem frequência 5 Hz e comprimento 2 m. Qual sua velocidade?",["2,5 m/s","5 m/s","7 m/s","10 m/s"],3,"v = f × λ = 10 m/s."],
["Eletrostática","Cargas elétricas de mesmo sinal:",["Se atraem","Se repelem","Não interagem","Sempre se anulam"],1,"Cargas de mesmo sinal se repelem."],
["Circuitos","Um resistor de 4 Ω recebe 12 V. Qual a corrente?",["0,33 A","3 A","8 A","48 A"],1,"I = V/R = 3 A."],
["Eletromagnetismo","Corrente elétrica em um fio produz ao redor dele:",["Campo magnético","Apenas som","Nenhum efeito físico","Redução obrigatória da gravidade"],0,"Correntes geram campo magnético ao redor do condutor."]
],
"Química": [
["Estrutura atômica","Número atômico corresponde ao número de:",["Nêutrons","Prótons","Prótons mais nêutrons","Ligações"],1,"Z é a quantidade de prótons no núcleo."],
["Tabela periódica","Elementos do mesmo grupo costumam ter:",["Mesma massa","Propriedades químicas semelhantes","Mesmo número atômico","Mesmo número de nêutrons"],1,"A semelhança relaciona-se à configuração eletrônica da camada de valência."],
["Ligações","Ligação covalente caracteriza-se por:",["Compartilhamento de elétrons","Compartilhamento de prótons","Desaparecimento de núcleos","Aumento do número atômico"],0,"Átomos compartilham pares de elétrons."],
["pH","Uma solução aquosa de pH 2 a 25 °C é:",["Neutra","Básica","Ácida","Sempre gasosa"],2,"pH menor que 7 a 25 °C indica solução ácida."],
["Reações","Em 2 H₂ + O₂ → 2 H₂O, qual a razão entre mols de H₂ consumidos e H₂O formados?",["1:2","2:1","1:1","3:1"],2,"Os coeficientes são 2 e 2: razão 1:1."],
["Estequiometria","Água tem massa molar 18 g/mol. Quantos mols há em 36 g?",["0,5 mol","1 mol","2 mol","18 mol"],2,"n = m/M = 36/18 = 2 mol."],
["Soluções","Há 10 g de soluto em 2 L de solução. Qual a concentração comum?",["2 g/L","5 g/L","10 g/L","20 g/L"],1,"Concentração = massa ÷ volume = 5 g/L."],
["Termoquímica","Uma reação exotérmica:",["Libera calor","Sempre absorve calor","Não envolve energia","Só ocorre a 0 °C"],0,"Libera calor e tem variação de entalpia negativa."],
["Orgânica","Qual grupo caracteriza os álcoois?",["Carboxila","Hidroxila ligada a carbono saturado","Carbonila entre carbonos","Amina"],1,"Álcoois apresentam −OH ligado a carbono saturado."],
["Eletroquímica","Oxidação corresponde a:",["Perda de elétrons","Ganho de elétrons","Perda exclusiva de nêutrons","Criação de prótons"],0,"Oxidação é perda de elétrons e aumento do número de oxidação."]
]};
const questions = Object.entries(bank).flatMap(([subject, rows], s) => rows.map((r, i) => ({
id: `${s+1}-${i+1}`, subject, number: i+1, topic: r[0], prompt: r[1], options: r[2], answer: r[3], explanation: r[4]
})));
module.exports = {questions, subjects: Object.keys(bank)};
