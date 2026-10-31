# Prompts — sessão 3ac8f95d

- Ferramenta: Claude Code
- Início: 2026-10-30T23:10:34.183Z

## Prompt 1 — 2026-10-30T23:10:34.183Z

<pasted_content>
Queremos criar uma aplicação para vencer um Hackathon de tecnologia com tema de educação, veja nosso desafio e ideias:

Objetivo:
- Aumentar o engajamento dos alunos 6° ano do fundamental até o 9° ano no Brasil 
- Adaptação do aluno como deficiências em geral
- Acompanhamento dos professores e responsáveis
- Educação individualizada levando em consideração a vivência do aluno a partir do preenchimento de uma ficha pedagógica que terá perguntas como seus gostos pessoais, deficiências ou problemas de saúde e opções de lazer, além do histórico escolar
nossa ideia é criar uma plataforma de ensino gamificada semelhante ao hackthebox e duolingo, com rank via patentes através de desafios semanais e listas de exercícios em que os alunos precisam realizar. Caso haja erro na solução da lista, uma nova lista será gerada via API de IA de forma que cria-se um exercício novo contextualizado baseado na ficha do aluno com o exato tópico de erro do aluno.

A aplicação terá as seguintes principais paginas para os alunos: tela de login (que no primeiro acesso, teria um formulario sobre seus gostos pessoais, personalidade etc); tela inicial (com algumas informações/opções de para onde prosseguir, ranking e XP e amizades); perfil com informações principais do aluno e avatar/personagem do usuario; página com as atividades (que iremos descrever melhor futuramente)

para o admin (coordenador):
ele é o responsável a criar turmas, alocar professores nas turmas e alocar os alunos nas turmas.
ele faz o cadastro de turmas: nome da turma.
dentro das turmas ele faz o cadastro dos professores e alunos via upload de uma planilha. ele pode dar upload de uma planilha propria (precisa conter cabeçalho: nome completo, email do aluno). cada turma teria uma planilha dessa. para o professor, teria o nome completo, email e a materia que ele dá.
a planilha base (cabeçalho: nome completo, email) está na propria pagina.

o coordenador vê na tela inicial: o desempenho das turmas em geral e tambem consegue ver individualmente o desempenho ao entrar nas turmas.
ele vê tambem o engajamento dos alunos nas atividades.

para os pais: tela de login
tela inicial que tem o diagnotisco, feedback do aluno e ve o engajamento do aluno nas atividades.

para professores: login
uma tela inicial mostrando informações gerais da turma como o progresso nas atividades e alunos com desempenho a melhorar, além das principais dificuldades enfrentadas na matéria, tanto individuais quanto coletivas.

para os pais: login/cadastro e uma página principal mostrando informações somente de seu filho

como funciona o rank: existem duas abas, a primeira é um ranking semanal, esse que vai para a classificação, todas as matérias começam com 10 exercícios e cada um deles valem pontos de classificação e pontos de patente, a cada semana 2 exercícios de cada matéria saem da lista e entram outros dois novos, os que saíram possuem seus pontos de classificação zerados, porém os de patente continuam. A classificação só mostrará o TOP10 da turma para evitar constrangimentos. Além disso, teremos as patentes, todo exercício vale ponto de patente, as patentes serão semelhantes aos rankings do LOL e só zeram ao final do ano.

Quero que guarde na memória e faça as perguntas que achar pertinente ANTES de iniciar o projeto em si

não faça nada ainda. entenda o escopo do projeto e faça perguntas pertinentes sobre o projeto. 


o hackathon tem uma regra:
temos que colocar no repositorio do github uma pasta "PROMPTS" com os .md com os prompts escritos na sessao com a LLM. entao faça um hook para, toda vez que for autocompactar uma conversa, guardar os .md de prompts nessa pasta
</pasted_content>


<pasted_content>
1. prazo: amanha 11h. 4 pessoas. o que acha melhor de tecnologia? &#x20;
2. faça o de aluno e o de admin (coordenador) primeiro
3. web pelo computador
4. sim tem que estar associados as habilidades bncc. professor faz upload de listas de exercicios e isso sera convertido em exercicios adaptados para o perfil do aluno por meio da IA. essas questoes compoem um banco de questoes. conforme os alunos erram, a IA cria questoes adaptadas ao aluno sobre o exercicio que ele errou e coloca para o aluno fazer, ate ele ter dominio da tarefa ou ate desistencia. e esses exercicios criados pela IA tambem compoem o banco de questoes.
5. só multipla escolha
6. somente atividades sobre a dificuldade identificada. sim, tem explicaçao após o erro sobre a questão errada, a dica será um botão caso o aluno tente fazer novamente e tenha dificuldade.
7. api do gemini gratuita. o professor já fornece o gabarito das questoes de ele sugeriu. porem quando a questao é feita pela IA, a IA faz a explicaçao e o gabarito.
8. o que é ficha pedagogica? a feita no primeiro login do aluno?
9. depois veremos mais sobre a acessibilidade
10. ele começa com 80 na pontuação de classificação, porem, mantem os 100 pontos na pontuação de patentes
11. a pontuaçao depende dos 3. um exercicio não pode ser refeito (quando um aluno erra, é gerada outro exercicio parecido com IA e uma vez que erra não tem como refazer a msm questao. esse novo exercicio tbm dá pontos, mas menos que o original).
12. todas as materias. XP é a classificação semanal que vai pro ranking, a pontuação de patentes vai para a patente. copie as patentes do LOL
13. engajamento = frequencia . desempenho = pontuaçao e tudo o que foi dito. sim, o diagnostico tera um resumo dessas informaçoes e feedback da IA (ela le os dados e da uma sugestao voltada para os pais).
14. o coordenador cadastra um aluno o email do aluno e no primeiro login ele muda a senha (tem a aba de primeiro acesso no login do aluno, onde ele define a senha).
15. sim. ambos. avisa e pergunte se quer mudar o aluno de turma.
16. por enquanto, so conexoes
17. será feito com claude, chatgpt, pois é em grupo. [https://github.com/VivasLasViegas/Hackaton-LEPV](https://github.com/VivasLasViegas/Hackaton-LEPV)
</pasted_content>

 use o git milenag2

## Prompt 2 — 2026-10-31T02:26:50.020Z

clone o repositorio e leia as intruçoes e planejamentos de la

## Prompt 3 — 2026-10-31T02:45:03.289Z

gostaria que fizesse prototipos das telas para o grupo decidir como seria a pagina inicial que o aluno enxerga

## Prompt 4 — 2026-10-31T02:50:59.652Z

qual nome podemos dar pra nossa plataforma?

## Prompt 5 — 2026-10-31T02:51:09.948Z

ta com o hook ligado dos prompts?

## Prompt 6 — 2026-10-31T03:01:27.049Z

gere mais prototipos de interface. quero que seja algo atrativo e gamificado para alunos

## Prompt 7 — 2026-10-31T03:03:18.806Z

use a skill https://github.com/nextlevelbuilder/ui-ux-pro-max-skill se precisar

## Prompt 8 — 2026-10-31T03:04:41.259Z

essa é a logo da plataforma [Image #3]

## Prompt 9 — 2026-10-31T03:05:30.200Z

https://github.com/blader/humanizer deixe essa skill pronta para quando for escrever algo na plataforma e nao ter AI slop

## Prompt 10 — 2026-10-31T03:13:17.654Z

agora leia minhas tarefas (gallotte) e faça um plano para começar . tambem gostaria que o professor tivesse a opçao de dar pontos a um aluno devido ao comportamento positivo em aula (ex: fez uma pergunta curiosa e relevante para a aula/ ajudou a professora a organizar a sala, etc) e uma notificaçao chega ao aluno da recompensa. é possivel fazer aqui? essa adiçao de pontos a um aluno deve ser feita acessando a plataforma facilmente pelo nvegador do celular

## Prompt 11 — 2026-10-31T03:26:48.961Z

1. pra patente / 2. 20 pontos / 3. no max 3 / 4. sim / 5. pode criar

## Prompt 12 — 2026-10-31T03:27:01.087Z

pode immplementar o plano. use o /goal
