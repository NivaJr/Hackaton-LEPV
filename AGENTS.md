# Trabalho no projeto LEPV

## Escopo e equipe

Implementação de aplicação educacional web do 6º ao 9º ano com aluno, coordenador, professor e responsável. Ler `README.md`, `docs/DIVISAO_EQUIPE.md`, `docs/INTEGRACAO.md` e a tarefa individual.

- Viegas: telas e fluxo do aluno.
- Fabia: coordenador, turmas, importação de alunos e painel do responsável.
- Nivaldo: banco, autenticação, permissões, tentativas e pontuação.
- Gallotte: professor, importação das questões, IA e validação integrada.

Cada pessoa usa sua branch e preserva contratos compartilhados. Dependências, lockfile, auth e migrações fundamentais são coordenados por Nivaldo; propor alterações antes de editar os mesmos arquivos em paralelo.

## Regras confirmadas

Seis matérias e quatro séries. Professor importa PDF/Word e fornece o gabarito original. Ficha salva/editável pelo aluno. Erro mostra explicação e gera outra questão sobre a habilidade; a mesma instância não pode ser refeita. Recuperação termina após dois acertos consecutivos ou interrupção. Primeira questão adaptativa vale 70% da original. Ranking público exibe somente TOP 10; XP ativo e pontos anuais de patente são separados.

Base de 100 pontos, limites das patentes, referência dos 70% para cadeias e teto de pontuação ainda são propostas. Não ativar teto sugerido como decisão aprovada. O domínio inicial não concede pontos em APIs nem cria persistência de tentativas.

Saúde/apoio: perfis vinculados consultam; só responsável confirmado edita. Histórico: coordenador e professor da própria matéria/turma editam. Consulta da ficha por outros perfis ainda está pendente; manter restrição atual até decisão explícita.

## Segurança e verificação

Não confiar em papel, aluno, escola, vínculo ou pontos enviados pelo navegador. Usar `getSessionContext()` e RLS. `getOptionalSession()` retorna apenas o perfil autenticado; não substitui o contexto completo de vínculos.

Não enviar gabarito antecipadamente ao aluno. Não expor chaves do servidor. Não afirmar que demonstração fictícia, gateway desabilitado ou configuração presente representa IA integrada ou banco validado.

Antes de integrar, executar typecheck, testes e build. Validação contra Supabase real, convites, armazenamento e fornecedor de IA precisa ser registrada quando realizada. Não reverter trabalho de outros integrantes sem inspeção.

## Regra do hackathon

Registrar cada prompt visível de usuário no início do turno em `PROMPTS/`, com data, autoria e texto original. Registrar templates da aplicação separadamente. Não incluir credenciais, dados reais de alunos, raciocínio oculto ou instruções internas das ferramentas. Prompts repetidos em sessões diferentes continuam registrados.

O hook em `.codex/hooks.json` é preparatório para Codex local compatível e depende de carregamento/confiança. Não garante registro em Work Cloud nem em sites de Claude/ChatGPT. Guardar prompts por turno e verificar antes de qualquer compactação manual. Nunca reconstruir literalmente um prompt indisponível.

## Git

O usuário autorizou commit e push da base. Preservar o histórico remoto, inspecionar a branch antes de integrar e não usar force push. Se o acesso ao repositório falhar, manter commit local e informar o bloqueio sem afirmar publicação bem-sucedida.
