# Prompt — revisão da progressão anual

Data: 30/10/2026 (America/Sao_Paulo).
Origem: prompt do assistente para um subagente LLM; não é nova instrução do usuário.

## Texto do prompt

Calcule uma sugestão de patentes anuais progressivas para o hackathon educacional. Não use ferramentas nem crie arquivos. Dados: 6 matérias, cada uma com10 questões iniciais e troca2/semana =>60 iniciais e12 novas por semana. Questão original base sugerida100 pontos (ainda proposta); adaptativas valem70% da primeira segundo usuário e até2 acertos consecutivos encerra recuperação. Precisa propor10 patentes LoL com limiares cumulativos, primeiras rápidas e últimas mais lentas, viáveis em ~36 semanas letivas (explique hipótese). Considere que acerto original só acontece uma vez e 70% por cada questão pode inflar pontuação; sugira regra simples sem alterar silenciosamente a decisão70%. Retorne tabela com pontos mínimos, pontos adicionais entre patentes e semana ideal aproximada, mais uma pergunta decisiva70% fixo original vs decaimento sucessivo e teto.
