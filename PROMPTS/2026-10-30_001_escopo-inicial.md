# Prompt 001 — escopo inicial e registro de prompts

Data: 30/10/2026 (America/Sao_Paulo).
Origem: mensagem do usuário nesta conversa; registro manual do texto disponível.

## Texto do prompt

Queremos criar uma aplicação para vencer um Hackathon de tecnologia com tema de educação, veja nosso desafio e ideias:



Objetivo:

- Aumentar o engajamento dos alunos 6° ano do fundamental até o 9° ano no Brasil&#x20;
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



não faça nada ainda. entenda o escopo do projeto e faça perguntas pertinentes sobre o projeto.&#x20;





o hackathon tem uma regra:

temos que colocar no repositorio do github uma pasta "PROMPTS" com os .md com os prompts escritos na sessao com a LLM. entao faça um hook para, toda vez que for autocompactar uma conversa, guardar os .md de prompts nessa pasta
