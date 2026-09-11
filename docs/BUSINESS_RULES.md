# Regras de negócio — BusinessBook

**Estado:** derivado da implementação e do `CLAUDE.md`, em 2026-09-11.
**Autoridade:** este documento é **descritivo até ser revisto**. Regista o que o
sistema faz hoje, não o que deveria fazer. Cada regra marcada `⚠ POR CONFIRMAR`
foi inferida do código e ninguém a aprovou — é exactamente aí que os defeitos se
escondem, e foi aí que a auditoria de 11 de Setembro encontrou cinco.

Quando uma regra for confirmada por ti, retira a marca. A partir daí passa a ser
normativa: uma divergência entre esta página e o código passa a ser um bug do
código.

---

## 1. Valor de um negócio

**BR-001 — A regra única.**
O valor de um negócio é a soma das colunas mensais (`apr`…`mar`). Onde não há
calendarização mensal, recorre-se a `value_total`. O resultado é convertido pela
taxa **guardada no negócio** (`exchange_rate`), não pela taxa de hoje.

Implementação: `src/lib/dealValue.js`. Todos os ecrãs a chamam.

*Porquê a taxa guardada:* uma taxa é um instantâneo. Uma alteração cambial
amanhã não pode reavaliar em silêncio o que foi cotado hoje.

**BR-002 — Dentro de um período, não há recurso ao total.**
Num relatório mensal ou trimestral as colunas mensais são a única fonte honesta.
Usar `value_total` faria um negócio sem calendarização aterrar por inteiro em
todos os meses consultados.

Implementação: `src/lib/salesByClient.js`.

**BR-003 — Espelhos intercompany nunca contam.**
Um negócio com `is_intercompany_mirror = true` existe para mostrar a mesma
operação dos dois lados da casa. Contá-lo duplica receita.

**BR-004 — Pesos de previsão.**
Lead 10% · Pipeline 30% · Proposta apresentada 60% · BackLog 100% · Faturado
100% · Perdido 0%.

O BackLog vale 100% porque já foi adjudicado. Implementação: `WEIGHTS` em
`src/constants.js`.

**BR-005 — Perdido não é uma fase do funil.**
É a saída dele. Reporta-se à parte das cinco, senão sugere que um negócio passa
por lá a caminho de outro sítio.

---

## 2. Margens e unidades

Três unidades diferentes, duas delas em colunas cujo nome não o diz. Esta secção
existe porque a confusão entre elas custou um erro de 100× em Setembro.

**BR-010 — `deals.gm_pct` é uma FRACÇÃO.**
`0.35` são 35%. Todos os leitores multiplicam por 100 para mostrar.

**BR-011 — `deal_products.margin_pct` é um MARKUP SOBRE O CUSTO, em percentagem.**
O editor de linhas reconstrói o preço como `custo × (1 + margem/100)`.

**BR-012 — Margem bruta é sobre o preço de venda, não sobre o custo.**
São números diferentes para a mesma linha: 35% de margem é 53,8% de markup.

**BR-013 — Margem percentual agregada é ponderada, nunca uma média de percentagens.**
`soma(margem) / soma(receita)`. Uma média de percentagens deixa um negócio
pequeno mover um cliente grande.

**BR-014 — Margem desconhecida mostra-se como traço, não como zero.**
`0%` lê-se como "vendido ao custo" quando significa "ninguém preencheu".

---

## 3. Descontos

**BR-020 — Estados de um pedido.**
`to_request` → `pending` → (`approved` | `rejected` | `counter`).
Uma contraproposta espera pela aceitação de quem pediu; só então passa a
`approved` e o dinheiro se move.

**BR-021 — Aprovar por menos do que foi pedido é contrapor.**
O ecrã converte-o automaticamente. A diferença importa a jusante: uma aprovação
é final, uma contraproposta espera.

**BR-022 — Cada ronda é uma linha nova, não uma edição.**
A negociação guarda o histórico: o que foi pedido, o que voltou, o que se pediu
a seguir.

**BR-023 — O valor em risco acompanha por ponto de desconto.**
Um segundo pedido a 15% contra um primeiro a 20% vale três quartos dele.

**BR-024 — O alívio aplica-se uma só vez.**
`applied_at` impede que responder duas vezes desconte duas vezes.

---

## 4. Margem protegida do parceiro

**BR-030 — Alvo 35%, chão de desconto 20%, chão absoluto 15%.**
Os descontos não devem levar um parceiro abaixo de 20%. Nunca abaixo de 15%.

Implementação: `PROTECTED_MARGIN` em `src/lib/partnerMargin.js`.

**BR-031 — Dois acordos, não cinco.**
**Full VAR 40%** — o parceiro vende, implementa e dá primeiro nível de suporte.
É o que ser distribuidor significa aqui. **Direct 0%** — vendemos nós.

Existiram mais três, herdados da folha de preços e nunca usados: Revendedor 28%,
Renovação 25%, Referral 15%. Saíram das opções em 11-09, mas a aritmética
continua a saber preçá-los, para que uma proposta guardada a 28% continue a
valer 28%.

**BR-032 — O custo do parceiro é a pricelist regional da VGT.**
A escada R1/R2/R3 no escalão de volume aplicável — não o preço por produto da
autorização.

**BR-033 — Região de preço e papel de canal são coisas diferentes.**
A região (R1/R2/R3) diz quanto vale a lista naquele país, e deriva-se do país.
O papel de canal diz o que o parceiro faz por nós, e é contrato: dois
distribuidores no mesmo país podem ter papéis diferentes.

**BR-034 — A precedência do papel de canal.**
Papel explícito da empresa → a empresa é distribuidor, logo Full VAR →
`direct`. Não há nada para configurar no caso normal.

**BR-035 — Um negócio guardado nunca é reavaliado por ser aberto.**
A dedução aplica-se só a propostas novas. Um negócio anterior fica exactamente
como foi cotado, mesmo quando o papel guardado é o `direct` por omissão e
contradiz o parceiro — porque abrir uma página para a ver não pode mexer no que
ela vale, e gravá-la por outro motivo qualquer escreveria números que ninguém
acordou.

Onde essa contradição existe, o ecrã **diz**, e uma pessoa decide. Corrigir os
históricos é um acto, não um efeito secundário.

---

## 5. Âmbito por empresa

**BR-040 — Um parceiro está limitado às empresas por que age.**
A pertença está em `company_members`, e a função `acts_for()` é a única pergunta
que as políticas fazem.

**BR-041 — A unidade de um parceiro é a empresa, não a pessoa.**
Um negócio da empresa é editável por qualquer pessoa que aja por ela, seja quem
for que o criou.

**BR-042 — Um negócio pertence a uma empresa só.**
Ao criar com o filtro em "todas", vai para a empresa de origem.

**BR-043 — O catálogo é o da empresa DO NEGÓCIO.**
Abrir um negócio do Peru com o filtro no Chile valoriza-o pelas autorizações do
Peru.

---

## 6. Transições de estado

**BR-050 — Transições permitidas para negócios.**

| De | Para |
|---|---|
| Lead | Pipeline, Perdido |
| Pipeline | Proposta apresentada, Lead, Perdido |
| Proposta apresentada | BackLog, Pipeline, Perdido |
| BackLog | Faturado, Proposta apresentada, Perdido |
| Faturado | Perdido *(apenas correcção)* |
| Perdido | Lead *(reabertura)* |

**⚠ LACUNA CONHECIDA:** isto é aplicado só no browser. Não há trigger nem
constraint. Uma chamada directa à API move um negócio de Lead para Faturado sem
passar por nada. Ver `docs/BACKLOG.md`, item SEC-03.

---

## 7. Nunca mostrar um número que não se sabe

**BR-060 — Uma taxa sobre nada é desconhecida, não zero.**
Uma conversão cuja fase anterior está vazia não mostra `0%` — `0%` lê-se como um
funil a falhar quando significa um funil vazio.

**BR-061 — Custo desconhecido assinala-se, não se assume zero.**

**BR-062 — Um erro de carregamento diz-se, não se mostra vazio.**
Uma página de zeros e uma lista vazia são respostas. Dá-las quando a pergunta
falhou é mentir com confiança.

---

## Regras que ficaram por formalizar

| Área | Falta | Risco |
|---|---|---|
| Pipeline nos funis | Se é a oportunidade inteira ou a fatia do ano | Divergiu em três ecrãs até 11-09 |
| Negócios de origem interna | Se o parceiro os pode editar | Hoje pode; não foi decidido |
| `PACS ACTIVE MONITORING FEE` | O tecto real de desconto | Carrega 80% herdados, ditos incorrectos |
| Quem vê custo | Matriz papel × coluna | `roles.js` e a view discordam |
