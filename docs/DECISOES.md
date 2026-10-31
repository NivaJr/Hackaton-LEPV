# Decisões de implementação

## Pontuação definitiva — 31/10/2026

Esta decisão substitui a política provisória de 30/10/2026 para novas instâncias:

- Exercício comum correto: 50 pontos de patente e 0 XP.
- Desafio semanal correto: 100 pontos de patente e 100 XP.
- Recuperação correta: 35 pontos de patente e 0 XP, independentemente da quantidade de tentativas.
- A recuperação continua até dois acertos consecutivos ou interrupção.
- Há dez desafios semanais ativos. A cada semana entram dois e saem os dois mais antigos, por `activatedAt`; o XP dos desafios removidos deixa de compor o ranking, mas seus pontos de patente permanecem.
- Patentes cumulativas: Ferro (0), Bronze (1.000), Prata (2.000), Ouro (3.000), Platina (4.000), Esmeralda (5.000), Diamante (6.000), Mestre (7.000), Grão-Mestre (8.000) e Onisciente (9.000).

A regra é validada no serviço e na função SQL de persistência; valores enviados pelo navegador não são aceitos como autoridade. As variáveis `LEPV_*` deixaram de ser usadas.

Os dez desafios ativos são contados por turma e matéria, e toda questão publicada entra como desafio semanal, porque a publicação ainda não oferece a opção de exercício comum.

## Pontuação anterior da demonstração — 30/10/2026

Confirmação explícita do usuário registrada em `PROMPTS/03-nivaldo-2026-10-30_029_politica-pontuacao-demonstracao.md`:

- Original correta: 100 pontos.
- Cada adaptativa vale 70% do valor nominal da questão anterior, com arredondamento a duas casas: 100 → 70 → 49 → 34,30.
- Resposta incorreta não concede crédito; o valor de referência é o valor nominal da questão anterior, não o crédito recebido ao errar.
- XP adaptativo acompanha a raiz: quando a original sai da seleção ativa, seus créditos de XP saem da classificação. Pontos anuais continuam preservados.
- Sem teto de recuperação: `recoveryCapPoints = null`.

Configuração correspondente: `LEPV_ORIGINAL_POINTS=100`, `LEPV_RECOVERY_REFERENCE=previous` e `LEPV_ADAPTIVE_XP_FOLLOWS_ROOT=true`.

A decisão foi solicitada para a demonstração. Os limites de patentes e bônus adicionais continuam como propostas, sem aprovação implícita. Instâncias e cadeias já abertas preservam o snapshot da política usado na atribuição.

## Banco da demonstração — 30/10/2026

O usuário escolheu criar um projeto Supabase exclusivo para o LEPV. Projeto `hackaton-lepv`, ref `alkvhjnqfjyjflaswdmi`, na organização pessoal `nivaldo-raiz's Org`, região São Paulo (`sa-east-1`). Credenciais ficam somente em arquivos locais ignorados e no ambiente privado do serviço que vier a hospedar a aplicação.

## Endereço gratuito da aplicação — 31/10/2026

O usuário pediu inicialmente `eai.com` e depois esclareceu que desejava um endereço gratuito terminado em `.vercel.app`. O nome exato `eai.vercel.app` já estava em uso; o usuário informou não ter acesso a esse endereço e confirmou manter o sufixo `-lepv`.

Endereço escolhido: **https://eai-lepv.vercel.app**. O domínio foi vinculado ao projeto Vercel existente; a URL pública do ambiente e o Site URL do Supabase usam esse endereço. O alias inicial e seu callback são preservados para compatibilidade. Não foi solicitada compra de domínio ou transferência de domínio de terceiros.
