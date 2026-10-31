# Pendências para Nivaldo após a interface do aluno

Data do levantamento: 31/10/2026  
Branch da interface: `codex/acessibilidade-aluno`

Este documento registra o que ainda precisa ser integrado ou validado pelo responsável por banco, autenticação, permissões, tentativas e pontuação. Ele não substitui os handoffs de professor/IA, gestão ou interface.

## O que já existe e não deve ser refeito

- contexto de sessão no servidor e políticas RLS;
- APIs e serviço do domínio de aprendizagem;
- registro de tentativas com proteção contra repetição, concorrência e idempotência;
- recuperação, dicas e interrupção;
- separação entre XP ativo e pontos anuais de patente;
- ranking público limitado ao TOP 10;
- rotação de desafios semanais;
- configuração e uma validação anterior com Supabase e Vercel;
- regras confirmadas no código desta branch: exercício regular `50 patente / 0 XP`, desafio semanal `100 patente / 100 XP` e recuperação `35 patente / 0 XP`;
- patentes cumulativas de Ferro a Onisciente, avançando em intervalos de 1.000 pontos e sem teto aprovado.

## P0 — bloqueadores para integrar e publicar

### 1. Integrar as branches sem apagar trabalho paralelo

- partir da `main` remota atualizada e integrar `codex/acessibilidade-aluno` por PR ou merge revisado;
- preservar, ao resolver conflitos, a interface/acessibilidade do aluno, o som apenas na interface padrão, as regras de pontuação confirmadas e a lista segura de interesses;
- preservar também os trabalhos já integrados na `main` de Gallotte, Fabiano e `fix/nivaldo-recovery-preferences`;
- não substituir arquivos inteiros sem comparar os contratos, porque esta branch nasceu antes das integrações mais recentes da `main`.

### 2. Confirmar as migrações no Supabase hospedado

Verificar o histórico remoto e aplicar, se ainda não estiverem presentes, sem alterar migrações já aplicadas:

- `20261031050000_learning_classroom_name.sql`;
- `20261031110000_learning_scoring_confirmed.sql`.

Depois, validar ausência de drift, registrar o resultado e confirmar rollback/backup aplicável. A documentação existente só comprova explicitamente a aplicação remota das migrações anteriores de fundação e aprendizagem.

### 3. Fechar o contrato real de disciplina e conteúdo

A interface do aluno já trabalha com disciplina e conteúdo, mas o endpoint real de atividades ainda precisa projetar de forma autoritativa:

- `activityType` (`exercise` ou `weekly_challenge`);
- `contentId`;
- `contentTitle`;
- `contentDefinedBy` (`teacher` ou `coordinator`).

O publicador de conteúdo do professor deve chamar o registro real de atividade com esses dados. É preciso reconciliar esse contrato com a implementação de conteúdo do Gallotte, garantir persistência no snapshot/estado e fazer backfill seguro para registros antigos. Nenhuma lista regular pode receber XP de desafio semanal por omissão ou fallback incorreto.

### 4. Implementar o progresso real por disciplina

O resumo real deve fornecer `subjectProgress` com:

- `subjectId`;
- `earnedRankPoints`;
- `availableRankPoints`.

O percentual é `pontos de patente conquistados / pontos de patente disponíveis nos conteúdos publicados da disciplina`. Exemplo: 200 pontos obtidos entre 2.000 disponíveis em História resultam em 10%. Numerador e denominador devem ser calculados no servidor, respeitando escola, turma, série, publicações e permissões; não aceitar totais enviados pelo navegador.

### 5. Preservar a validação segura de interesses

- manter no contrato do servidor a lista `APPROVED_STUDENT_INTERESTS` desta branch;
- rejeitar strings arbitrárias, inclusive conteúdo ofensivo, sexual, violento ou inadequado;
- auditar caminhos internos/privilegiados para que não contornem a validação da API;
- definir migração ou ocultação segura de valores legados que não estejam na lista aprovada;
- atualizar a documentação, que ainda descreve interesses como texto arbitrário.

### 6. Publicar a versão integrada

- executar typecheck, testes e build na `main` integrada;
- implantar o SHA integrado na Vercel;
- confirmar que `https://eai-lepv.vercel.app` serve o novo SHA, e não o deploy anterior da branch de núcleo;
- validar callbacks de autenticação, variáveis de servidor e conexão com o Supabase no ambiente publicado;
- registrar SHA, data, ambiente e evidências do smoke test.

## P1 — validação funcional e de segurança

- validar exercício regular: `50 patente / 0 XP`;
- validar desafio semanal: `100 patente / 100 XP`;
- validar recuperação: `35 patente / 0 XP`, independentemente do número de tentativas, encerrando após dois acertos consecutivos ou interrupção;
- validar 10 desafios ativos inicialmente, entrada de 2 novos por semana e saída dos 2 mais antigos pelo timestamp;
- confirmar que o XP de desafios expirados deixa o ranking e que os pontos anuais de patente permanecem;
- validar todos os limiares das patentes e o nome final `Onisciente`;
- testar tentativas duplicadas e concorrentes para impedir pontuação dupla;
- garantir que o aluno nunca receba o gabarito antecipadamente;
- garantir isolamento entre escolas e turmas;
- garantir que professor só altere a própria disciplina/turma e que coordenador respeite a própria escola;
- testar sessões reais de aluno, professor, coordenador e responsável;
- validar que atividades publicadas retornam disciplina, conteúdo e tipo corretos;
- validar no gráfico o caso 200/2.000 = 10%;
- validar que interesses fora da lista são rejeitados pelo servidor;
- validar que o som de acerto toca somente na interface padrão e não na interface acessível;
- manter a interface padrão para aluno sem necessidade e a acessível como padrão para aluno cuja ficha indique necessidade, permitindo a troca manual para a interface normal.

## Limpeza de contratos e documentação

- remover ou marcar como obsoletas em `.env.example` e na documentação as variáveis da política provisória de pontuação que o código confirmado já não utiliza;
- atualizar `docs/ROTAS_REAIS_TAREFA_03_NIVALDO.md` com `activityType`, campos de conteúdo, `subjectProgress` e a lista fechada de interesses;
- atualizar os documentos de configuração do Supabase e da Vercel com as migrações e o SHA realmente publicados;
- marcar claramente como histórica/superada qualquer seção de `docs/DECISOES.md` que ainda descreva pontuação provisória conflitante;
- registrar resultados reais sem afirmar que demonstração fictícia, gateway desabilitado ou simples presença de configuração comprova integração.

## Dependências de outros responsáveis

Estas entregas não são responsabilidade exclusiva do Nivaldo, mas ele precisa integrar seus contratos de banco, autenticação e RLS:

- **Gallotte:** upload PDF/Word, extração, gabarito, revisão/publicação, IA real, cobertura BNCC e geração das listas; Nivaldo conecta persistência, permissões e projeção para a API de aprendizagem.
- **Fabiano:** telas de coordenador, turmas, importação de alunos, vínculos e painel do responsável; Nivaldo valida autenticação, callbacks, contexto de sessão e RLS.
- **Viegas:** interface do aluno, acessibilidade, navegação, apresentação de disciplina/conteúdo e retorno sonoro; já estão nesta branch e precisam ser preservados na integração.

Não declarar a importação do professor como concluída até upload, armazenamento, revisão, publicação e consumo real pelo aluno terem sido testados de ponta a ponta.

## Depois do hackathon, se não couber no fechamento

- revisar paginação, compactação e custo do estado privado/CAS para escala;
- adicionar observabilidade para falhas de pontuação, rotação, publicação e autorização;
- revisar retenção/auditoria dos eventos e estratégia formal de recuperação de desastre.

## Definição objetiva de concluído

O trabalho do núcleo estará concluído quando:

1. a `main` contiver a interface desta branch e os trabalhos paralelos sem regressão;
2. o histórico do Supabase comprovar todas as migrações necessárias;
3. atividades reais trouxerem tipo, disciplina e conteúdo definidos pelo professor/coordenador;
4. `subjectProgress` for calculado no servidor com o denominador real publicado;
5. pontuação, recuperação, patentes e expiração de XP passarem nos testes;
6. interesses não aprovados forem recusados no servidor;
7. RLS e fluxos dos quatro perfis forem validados com sessões reais;
8. typecheck, testes e build passarem após a integração;
9. a produção estiver no SHA integrado e o smoke test estiver documentado.
