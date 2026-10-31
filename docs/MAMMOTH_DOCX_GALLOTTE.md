# Word (.docx) — dependência para Gallotte

Nivaldo adicionou `mammoth@1.13.0` às dependências de produção, com versão exata e `package-lock.json` atualizado, conforme solicitação do usuário.

Depois de integrar a `main` à sua branch, execute `npm ci`.

Use a extração de texto no servidor, a partir do buffer do arquivo recebido:

```ts
import mammoth from "mammoth";

const buffer = Buffer.from(await file.arrayBuffer());
const { value: text, messages } = await mammoth.extractRawText({ buffer });
```

`text` é a entrada para a estruturação e revisão da lista; `messages` contém os avisos da extração. O upload, os limites do arquivo, a validação do professor e a integração com o gateway continuam no módulo de Gallotte. A entrada por texto colado pode ser mantida como alternativa à importação.

Referência: [documentação oficial do Mammoth](https://github.com/mwilliamson/mammoth.js#library).

## Verificação

- Extração de um `.docx` sintético com acentos, alternativas e gabarito: passou, sem avisos.
- `npm run typecheck`: passou.
- `npm test`: 101 testes passaram.
- `npm run build`: passou.

A biblioteca já inclui as declarações TypeScript; não foi necessário outro pacote de tipos. Esta entrega disponibiliza a dependência e o exemplo, deixando a implementação do fluxo de importação com Gallotte.
