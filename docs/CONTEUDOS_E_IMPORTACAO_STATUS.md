# Conteúdos, progresso e importação — estado em 31/10/2026

## Regra do mapa de aprendizagem

O percentual de cada disciplina é:

`pontos de patente conquistados nos conteúdos ÷ pontos de patente disponíveis nos conteúdos publicados × 100`

Exemplo confirmado: História tem 2.000 pontos disponíveis e o aluno conquistou 200; o mapa mostra 10%.

A demonstração usa valores sintéticos identificados. A API real ainda precisa projetar `subjectProgress` a partir do futuro catálogo de conteúdos publicado; a interface real não inventa o denominador quando esse contrato não está presente.

## Fluxo do aluno

A interface está preparada para a sequência:

1. selecionar a disciplina;
2. selecionar o conteúdo da turma;
3. selecionar o exercício ou desafio.

O cliente aceita `contentId`, `contentTitle` e `contentDefinedBy`. Enquanto a API real não fornece esses campos, o código agrupa por habilidade BNCC como fallback explícito.

## Login e publicação

- Em `/professor`, o painel de Gallotte (`TeacherContentPanel`) importa PDF, Word ou texto, gera rascunhos para revisão de gabarito e BNCC e publica para a turma pela API `/api/content`.
- Questões publicadas entram inativas. O professor da turma e matéria as libera em `#atividades`: dez desafios semanais de cada matéria e, depois, duas trocas por semana. O coordenador só atua em matéria sem professor atribuído.
- `TeacherContentWorkspace`, com a hierarquia disciplina → conteúdo → turma → lista, é usado somente em `/demo/professor`. A prévia fica no navegador e nada é publicado.
- A área do coordenador importa cadastros e turmas, não listas de exercícios.
- Toda questão publicada entra como desafio semanal, e o tipo não muda depois porque o snapshot é imutável. Exercício comum de 50 pontos depende de uma opção na publicação.
- Conteúdo como agrupamento (`contentId`) e `subjectProgress` ainda dependem de a API real fornecer esses campos.
