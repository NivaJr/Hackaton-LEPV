# Acessibilidade neurodivergente na área do aluno

## Decisão de experiência

A interface normal permanece inalterada quando a ficha não possui necessidade de apoio. Quando `student_support` possui um registro para o aluno, o servidor o converte em sinais funcionais e o modo acessível é ativado automaticamente:

- leitura confortável: tipografia sem serifa, maior espaçamento, linhas mais legíveis e alinhamento à esquerda;
- foco: remove do fluxo principal gamificação, ranking e painéis que não são necessários para iniciar uma atividade;
- previsibilidade: reduz movimento e efeitos decorativos, preserva posição e aparência consistentes dos controles;
- modo acessível: aumenta alvos interativos, torna o foco do teclado mais visível e usa linguagem mais direta;
- modo normal: continua disponível para o aluno que preferir a experiência original.

O botão com o símbolo internacional de acessibilidade fica no topo da página. Ele permite alternar os modos sem procurar a configuração na ficha. A demonstração parte com leitura, foco e previsibilidade ativos.

## Privacidade e persistência

O texto de `student_support` é lido no componente de servidor sob a sessão/RLS do aluno e não é enviado ao navegador. O cliente recebe apenas os sinais `reading`, `focus` e `predictability`. Termos conhecidos selecionam o apoio correspondente; um registro não categorizado usa o conjunto acessível completo.

O aluno continua sem permissão para editar saúde/apoio, que permanece sob o responsável confirmado. O navegador guarda somente a escolha de usar temporariamente a interface normal ou acessível. Não foi reutilizado o campo livre `context`, pois isso misturaria personalização pedagógica com informação de acessibilidade e alteraria indevidamente a versão usada pelas questões.

## Referências aplicadas

- [W3C — Making Content Usable for People with Cognitive and Learning Disabilities](https://www.w3.org/TR/coga-usable/): simplificação, personalização, linguagem clara, controle sobre mudanças e redução de distrações.
- [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/): foco visível, ordem de foco, movimento reduzível e tamanho de alvos.
- [British Dyslexia Association — Dyslexia Style Guide 2023](https://cdn.bdadyslexia.org.uk/uploads/documents/Advice/style-guide/BDA-Style-Guide-2023.pdf): fonte sem serifa, texto maior, espaçamento e entrelinha, sem itálico ou blocos em caixa alta.
- [Department for Education (UK) — Cognitive accessibility guidelines](https://deliver-good-services.education.gov.uk/guides/cognitive-accessibility-guidelines): hierarquia visual, tarefas estreitas, leiaute sem poluição e orientação para retomar o foco.
- [Home Office — Layout and typography](https://design.homeoffice.gov.uk/accessibility/page-structure/layout-typography): fontes claras, unidades relativas, reflow, zoom e estrutura semântica.
- [UX Collective Brasil — Acessibilidade na experiência do usuário neurodivergente](https://brasil.uxdesign.cc/acessibilidade-na-experi%C3%AAncia-do-usu%C3%A1rio-neurodivergente-98f6c34b6da5): reforça que necessidades variam e que não existe uma solução única por diagnóstico.

Estas diretrizes orientam o produto, mas não substituem testes de usabilidade com alunos neurodivergentes e seus responsáveis.
