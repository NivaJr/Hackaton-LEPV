# Divisão de implementação — Viegas, Fabia, Nivaldo e Gallotte

Esta divisão respeita as responsabilidades indicadas pela equipe. A base compartilhada deve ser usada por todos: contratos, autenticação, layouts e migração inicial já existem. O restante está organizado em quatro tarefas que podem avançar em paralelo.

| Pessoa | Missão principal | Também cobre | Arquivo individual |
| --- | --- | --- | --- |
| **Viegas** | Telas e fluxo do aluno | Ficha, atividades, dica, recuperação, perfil, ranking e conexões na interface | [TAREFA_01_VIEGAS.md](TAREFA_01_VIEGAS.md) |
| **Fabia** | Coordenador, turmas e importação de alunos | Painel do responsável, consulta do filho e edição autorizada de saúde/apoio | [TAREFA_02_FABIA.md](TAREFA_02_FABIA.md) |
| **Nivaldo** | Banco, autenticação e pontuação | Vínculos/permissões, tentativas, recuperação persistida, livro de pontos e rotação | [TAREFA_03_NIVALDO.md](TAREFA_03_NIVALDO.md) |
| **Gallotte** | Importação de questões, IA e validação completa | Painel do professor, PDF/Word, habilidades BNCC, banco de questões e gateway de LLM | [TAREFA_04_GALLOTTE.md](TAREFA_04_GALLOTTE.md) |

## Como trabalhar sem esperar outro integrante terminar

1. Todos partem do mesmo commit da base e abrem suas branches de trabalho.
2. Ler `AGENTS.md`, `README.md`, `src/contracts/` e sua tarefa individual antes de editar.
3. Viegas desenvolve a interface com implementações de teste dos contratos enquanto Nivaldo entrega APIs reais. Esses dados precisam continuar identificados como demonstração.
4. Fabia usa a autenticação/RLS e os layouts existentes; seus endpoints de gestão não devem reimplementar auth ou cálculo de pontos.
5. Gallotte implementa conteúdo e gateway seguindo os contratos. Nivaldo pode testar a recuperação com uma implementação determinística de desenvolvimento, explicitamente identificada, enquanto a integração real é finalizada.
6. Nivaldo mantém a integridade do banco e as regras comuns; os outros escrevem seus módulos e propõem migrações do domínio sem alterar os mesmos arquivos simultaneamente.
7. Combinar qualquer alteração em contrato antes de integrar; dependências e lockfile têm manutenção centralizada por Nivaldo após esta entrega.

## Ordem de integração

1. Autenticação/vínculos e banco inicial, comuns a todos.
2. Lista do professor publicada no banco de conteúdo.
3. Instância atribuída ao aluno, identificada por `questionInstanceId`.
4. Resposta e pontos persistidos por Nivaldo, consumidos pela interface de Viegas.
5. Questão de recuperação gerada pelo gateway de Gallotte e recebida no fluxo do aluno.
6. Métricas consultadas nos painéis de Fabia e Gallotte.
7. Validação final com os quatro perfis, perda de conexão, geração inválida e resposta repetida.

## Entrega de cada pessoa

Cada tarefa só é considerada pronta quando possui comportamento verificado, não apenas tela montada. Executar `npm run typecheck`, `npm test` e `npm run build`, registrar limitações e salvar os prompts usados. A fórmula completa de pontuação, o teto adaptativo e os limites de patentes ainda devem ser documentados como decisões de equipe ou confirmação do usuário.

As fichas individuais contêm checklists, contratos, diretórios e critérios de aceite. Esta entrega não envia mensagens ou atribuições a contas pessoais dos integrantes.
