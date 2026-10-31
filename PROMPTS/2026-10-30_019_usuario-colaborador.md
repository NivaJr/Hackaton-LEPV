# Prompt 019 — usuário é o colaborador

- Data: 2026-10-30 (America/Sao_Paulo)
- Autor: usuário
- Origem: conversa do projeto LEPV

## Texto original

Isso confirma: o GitHub está configurado corretamente; falta autenticação HTTPS na máquina do colaborador.

Peça para ele fazer uma destas opções:

1. GitHub Desktop: entrar na própria conta em **File → Options → Accounts** e repetir o fetch/push.

2. Terminal com GitHub CLI:

```bash
gh auth login
git fetch origin
```

Escolher `GitHub.com` → `HTTPS` → login pelo navegador.

3. Se não tiver `gh`, configurar o Git Credential Manager e repetir:

```bash
git config --global credential.helper manager
git fetch origin
```

Ele deve autenticar com a conta dele — não com a sua — e não deve enviar senha ou token pelo chat. Como já é colaborador, após autenticar o `git push origin main` deverá funcionar, desde que a branch local esteja atualizada.

eu sou o colaborador
