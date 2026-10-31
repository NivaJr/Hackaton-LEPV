# Inventário do banco de questões

Data: 31/10/2026. Fonte: `src/features/content/fixtures/examples.ts` (os testes conferem esta contagem com `buildContentInventory()`).

A meta é 4 séries × 6 matérias × 10 questões = 240 questões revisadas por professor. Hoje existem **11 exemplos de demonstração** e **0 questões revisadas por professor**. Os exemplos foram escritos pela equipe de desenvolvimento para testar o fluxo. Ao importar um deles, ele entra como rascunho e precisa da revisão do professor antes de publicar.

| Série | Matéria | Exemplos de demonstração | Revisadas por professor | Meta |
| --- | --- | --- | --- | --- |
| 7º ano | Matemática | 6 | 0 | 10 |
| 7º ano | Geografia | 5 | 0 | 10 |
| As outras 22 combinações | | 0 | 0 | 10 cada |

## Habilidades usadas

Nenhum código foi conferido no texto oficial da BNCC durante esta tarefa. A coluna "Situação" diz o grau de certeza da equipe.

| Código | Assunto nos exemplos | Situação |
| --- | --- | --- |
| EF07MA04 | Problemas com operações entre números inteiros | Alta confiança, conferir no texto oficial |
| EF07MA18 | Equações polinomiais de 1º grau | Alta confiança, conferir no texto oficial |
| EF07MA08 | Comparar e ordenar frações | Habilidade a conferir |
| EF07MA02 | Problemas com porcentagem | Habilidade a conferir |
| EF07GE11 | Componentes físico-naturais e biomas do Brasil | Alta confiança, conferir no texto oficial |
| EF07GE12 | Unidades de conservação e SNUC | Alta confiança, conferir no texto oficial |
| EF07GE09 | Mapas temáticos com dados do Brasil | Habilidade a conferir |

## Limites

- PDF só com imagem (escaneado) não tem leitura: falta OCR. O professor deve colar o texto.
- Word .docx é lido no servidor com mammoth e segue o caminho do texto colado. O .doc antigo responde 415 pedindo para salvar como .docx.
- O repositório atual guarda rascunhos e publicadas na memória do servidor. Reiniciar o servidor apaga tudo. A tabela definitiva depende da migração `20261031020000_content.sql`, a combinar com o Nivaldo.
