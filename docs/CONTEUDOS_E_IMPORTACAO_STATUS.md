# Conteúdos, progresso e importação — estado em 31/10/2026

## Regra do mapa de aprendizagem

O percentual de cada disciplina é:

`pontos de patente conquistados nos conteúdos ÷ pontos de patente disponíveis nos conteúdos publicados × 100`

Exemplo confirmado: História tem 2.000 pontos disponíveis e o aluno conquistou 200; o mapa mostra 10%.

A API real calcula `subjectProgress` no servidor a partir das listas de exercícios publicadas da turma e dos créditos anuais dessas mesmas raízes. O denominador conta 50 pontos por exercício publicado; o numerador inclui os créditos de exercícios e suas recuperações, sem impor teto aos créditos. Desafios e elogios não entram nesse mapa. Professor recebe somente suas disciplinas. O teste de integração verifica 200/2.000 = 10%. A demonstração continua identificada como sintética.

## Fluxo do aluno

A interface está preparada para a sequência:

1. selecionar a disciplina;
2. selecionar o conteúdo da turma;
3. selecionar o exercício ou desafio.

Atividades publicadas retornam `activityType`, `contentId`, `contentTitle` e `contentDefinedBy` (`teacher` ou `coordinator`). A autoria funcional vem da autorização do servidor. A migração aditiva trata registros anteriores como exercícios quando o tipo está ausente e os agrupa em "Conteúdos anteriores", preservando tentativas e créditos históricos.

## Login e publicação

- Existe o papel `professor`, autenticação compartilhada e rota protegida `/professor`.
- O contexto de sessão carrega as atribuições de turma e disciplina do professor no servidor.
- A área do professor agora espelha a hierarquia do aluno: disciplina → conteúdo → turma → lista de exercícios.
- A interface usa `/api/content`: disciplina/turma autorizada, conteúdo, tipo de atividade, PDF/Word ou texto colado, revisão, confirmação do gabarito e publicação.
- Rascunhos usam o banco privado e as RPCs do PR #17; a cota de IA é compartilhada entre instâncias. O original PDF/Word usa o bucket privado `teaching-sources`, com políticas por escola, turma e disciplina.
- A publicação reserva a versão revisada antes de entregar o snapshot ao catálogo. Em falha de transporte, "Concluir publicação" retoma a mesma versão; ela não pode ser editada durante essa etapa.
- Exercícios ficam disponíveis ao publicar. Desafios de dificuldade alta aguardam a seleção de dez por disciplina; a cada semana entram dois e saem os dois mais antigos dessa disciplina.
- A área do coordenador importa cadastros/turmas, não listas de exercícios.
- `mammoth` está disponível para extração de Word, mas a dependência isolada não representa um upload funcional.
- Professor define o escopo da sua turma/disciplina. Coordenador atua somente quando não há professor atribuído, com conferência no servidor. Nenhum gabarito entra na API destinada ao aluno.

O percurso e seus limites de validação estão em [Continuidade do Viegas](ENTREGA_VIEGAS_CONTINUIDADE.md). Testes de IA com transporte simulado não comprovam uma chamada a fornecedor real; esta branch não foi promovida a Production.
