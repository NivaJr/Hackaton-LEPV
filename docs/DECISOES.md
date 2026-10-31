# Decisões de implementação

## Pontuação da demonstração — 30/10/2026

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
