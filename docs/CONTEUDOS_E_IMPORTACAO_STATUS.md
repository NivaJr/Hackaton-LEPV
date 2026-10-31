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

- Existe o papel `professor`, autenticação compartilhada e rota protegida `/professor`.
- O contexto de sessão carrega as atribuições de turma e disciplina do professor no servidor.
- A área do professor agora espelha a hierarquia do aluno: disciplina → conteúdo → turma → lista de exercícios.
- A interface permite escolher somente disciplinas/turmas presentes nos vínculos autenticados, selecionar ou criar o conteúdo, anexar PDF/Word/TXT, informar o gabarito e preparar uma prévia local para revisão.
- A prévia fica somente na sessão do navegador e é marcada como não publicada. Ainda não há API, armazenamento nem persistência para entregar a lista aos alunos.
- A área do coordenador importa cadastros/turmas, não listas de exercícios.
- `mammoth` está disponível para extração de Word, mas a dependência isolada não representa um upload funcional.
- A regra "professor define o escopo; coordenador define somente quando não houver professor" ainda precisa ser implementada no módulo de conteúdo, com autorização no servidor e persistência.

Não declarar importação de exercícios pronta antes de existir o percurso completo arquivo → extração → prévia → gabarito → revisão → publicação para turma/conteúdo.
