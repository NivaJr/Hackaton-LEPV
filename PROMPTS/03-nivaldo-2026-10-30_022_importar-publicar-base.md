# Importar e publicar a base

Data: 2026-10-30 (America/Sao_Paulo)
Autoria: usuário (NivaJr / Nivaldo)
Origem: solicitação direta nesta conversa; registro manual após importar a base e ler AGENTS.md.

## Texto original

```text
c:\Users\nival\Downloads\LEPV_PUBLICAR_VSCODE.zip

Importe a base. Execute uma linha por vez:
git clone --branch codex/base-inicial-20261030 .\base-inicial.bundle .\Hackaton-LEPV-base
cd .\Hackaton-LEPV-base
git remote set-url origin https://github.com/VivasLasViegas/Hackaton-LEPV.git
git fetch origin


Se o fetch terminar sem erro, publique:
git push --set-upstream origin codex/base-inicial-20261030
```
