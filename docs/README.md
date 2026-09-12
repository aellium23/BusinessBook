# `docs/` — o que está onde

| Ficheiro | Responde a |
|---|---|
| **`PRD.md`** | O que é este produto, para quem, e o que **não** é. |
| **`USER_STORIES.md`** | Quem quer o quê e porquê, com critérios verificáveis. |
| **`EPICS.md`** | As seis áreas, o que custou aprender em cada, e o que falta. |
| **`BUSINESS_RULES.md`** | As 40 regras, com a **origem da prova** de cada uma. |
| **`PERMISSIONS.md`** | Papel × página × dado. |
| **`DATA_CONTRACTS.md`** | As unidades das colunas. **Ler antes de mexer em margens.** |
| **`DESIGN_SYSTEM.md`** | Cores, espaço, componentes, e as regras de mobile. |
| **`UX_AUDIT.md`** | Os dez achados de 12-09 e o que a aplicação deles ensinou. |
| **`BACKLOG.md`** | O que está aberto, com estado. |
| **`RELEASE_NOTES.md`** | O que mudou, para quem usa o produto. |

## Como ler as marcas

No `BUSINESS_RULES.md` cada regra diz de onde vem a prova: **✅** confirmado pelo
dono do P&L, **📐** facto do código verificável sem opinião, **⚠** política que
foi inferida e ninguém aprovou.

Enquanto houver ⚠, o documento não consegue dizer que o código está errado — e
foi assim que um erro de 100× na margem sobreviveu três meses. As 21 que faltam
estão listadas em `BUSINESS_RULES.md` §8, escritas como perguntas de sim ou não.

## A regra que governa estes ficheiros

Estão desactualizados no momento em que o produto muda sem eles. O `CLAUDE.md`
obriga a actualizar o `HelpGuide` no mesmo commit que muda uma funcionalidade;
estes seguem a mesma ideia. **Um documento que descreve o que o produto era é
pior do que nenhum**, porque parece um que descreve o que ele é.
