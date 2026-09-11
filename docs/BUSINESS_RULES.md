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

**Uma linha sem custo tira o negócio inteiro da conta.** `lineCostTotals` deixa-a
de fora e diz quantas são; só com todas respondidas é que a margem é desenhada.
Até 11-09 havia duas leituras em desacordo: o `DealForm` somava a coluna em bruto
e a linha contava zero (margem 100%), o `ProductLineItems` fazia
`cost_price || unit_price` e a linha contava pelo seu preço de venda (margem 0%).
O mesmo negócio, dois ecrãs, duas respostas opostas, e nenhuma delas a verdadeira.

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

**BR-032 — R1–R4 é preço de TRANSFERÊNCIA, não preço de cliente.**
A escada regional é a lista de compra de quem está a jusante de nós: o
distribuidor **e** a subsidiária Fujifilm. Não é o preço de venda de ninguém.

Consequências, e são três:

1. **O custo do parceiro é essa lista**, no escalão a que o volume chega. Onde a
   autorização fixa um preço para aquele produto naquele país, esse preço ganha.
2. **O que o cliente paga é decisão do parceiro.** Nós não o sabemos. O ecrã
   estima-o à margem protegida — 35% — e diz que é uma estimativa.
3. **Um desconto sobre essa lista sai inteiro da nossa receita.** Não há
   concessão ao cliente final num negócio de canal, porque não somos nós que
   lhe pomos o preço.

*Corrigido a 11-09, depois de eu ter deduzido o contrário e ter sido corrigido.*
A banda de canal chamava "o cliente paga" ao que o parceiro nos paga, e tirava-
lhe outros 40% para inventar uma transferência. Nos números do negócio
"test chile": dizia cliente 65.574 € / transferência 39.344 €, quando o parceiro
nos paga 65.574 € e vende ao hospital por cerca de 100.883 €.

**BR-036 — Nunca escrever uma estimativa numa coluna com nome de facto.**
`deal_channel.end_customer_price` e `partner_margin_pct` ficam a **nulo** quando
somos nós a cotar um negócio de canal. Uma estimativa que entra numa coluna
chamada `end_customer_price` deixa de ser estimativa no primeiro relatório que
a leia. Só a proposta do próprio parceiro as preenche, porque só ela as sabe.

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
| Lead | Pipeline, **Proposta apresentada**, Perdido |
| Pipeline | Proposta apresentada, Lead, Perdido |
| Proposta apresentada | BackLog, Pipeline, Perdido |
| BackLog | Faturado, Proposta apresentada, Perdido |
| Faturado | Perdido *(apenas correcção)* |
| Perdido | Lead *(reabertura)* |

**BR-050a — Lead → Proposta apresentada salta o Pipeline, de propósito.**
Acrescentada a 11-09. As fases de um distribuidor são Lead, Proposta, BackLog e
Perdido — o Pipeline é a nossa qualificação interna e está fora do ecrã deles de
propósito. O formulário cruza as duas listas, e a partir de um Lead a
intersecção era **só Perdido**: um parceiro podia desistir de um negócio e não
podia fazê-lo avançar.

A aresta está certa por si e não como remendo: um negócio que vai directo a
orçamento é corrente, e é o que o quick deal faz — cria e cota no mesmo ecrã, e
a fase a seguir a isso é Proposta apresentada. O Pipeline fica para os negócios
que são mesmo qualificados antes de alguém cotar.

Nada do que se reporta se mexe: os funis contam negócios pela fase em que estão,
não pelo caminho que fizeram.

**BR-056 — Os grupos de estados de contrato têm um nome só.**
`SLA_PIPELINE_STATUSES` (draft, waiting_po) e `SLA_ACTIVE_STATUSES` (warranty,
active, pending_renewal), em `src/constants.js`. **Não existe um estado
`pipeline`** — isso é o id de um separador, e três ecrãs usaram-no como valor de
coluna até 11-09. Não apanhava nada, e dois números do painel eram zero por
construção.

**BR-055 — O ciclo de vida de um contrato também é imposto pela base de dados.**
Dezassete transições em `sla_status_transitions`, e um trigger em `slas` recusa
o resto. Mesmos isentos que os negócios: admin, e o SQL Editor. O INSERT fica de
fora — um contrato pode chegar-nos já activo.

| De | Para |
|---|---|
| draft | waiting_po, cancelado |
| waiting_po | garantia, activo, cancelado |
| garantia | activo, cancelado |
| activo | renovação pendente, cancelado, expirado |
| renovação pendente | renovado, expirado, cancelado |
| renovado | activo, renovação pendente |
| expirado | activo *(reactivação)* |
| cancelado | draft *(recomeçar)* |

**BR-051 — A tabela acima é imposta pela base de dados.**
`deal_stage_transitions` guarda estes treze pares e um trigger em `deals` recusa
o que lá não estiver. Deixou de ser só a caixa de selecção: uma chamada directa
à API já não move um Lead para Faturado.

**Isento: admin**, para correcções e imports. Manager não. O SQL Editor também
passa — corre como superutilizador sem `auth.uid()`.

**O INSERT não é governado.** Um negócio pode nascer em qualquer fase: um
import, ou um negócio que nos chega já ganho. A máquina governa movimento.

A regra existe em dois sítios por necessidade — o ecrã tem de desenhar a caixa
antes de qualquer pedido — e os dois são comparados a cada `npm run test`.

**BR-054 — Quem vê custo: admin, manager e os nossos comerciais.**
A pergunta é `sees_internal_economics()`, e é a mesma nos três sítios onde se
faz: `roles.js`, a função SQL e a view `deal_products_cost`. Distribuidores,
parceiros e *viewers* ficam de fora. Até 11-09 a view respondia admin e manager
só, portanto um comercial escrevia o custo no quick deal e era informado, ao
reabrir o negócio, de que a linha não tinha custo.

**BR-052 — Quem não vê custo não o escreve.**
`cost_price` e `margin_pct` em `deal_products` são forçados a nulo no INSERT, e
repostos ao valor anterior no UPDATE, para quem não passa
`sees_internal_economics()`. Coagido e não recusado: a proposta de um parceiro
manda essas colunas em todas as gravações e manda-as vazias, e rebentar ali
partia gravações legítimas para castigar um caso que não acontece.

**BR-053 — Custo desconhecido grava-se a nulo, nunca a zero.**
`parseFloat(null) || 0` é `0`, e durante meses foi assim que todas as gravações
de parceiro escreveram custo zero e 100% de margem. Ver `numOrNull` em
`src/lib/numbers.js`. É o BR-061 aplicado ao caminho de escrita, que era o único
sítio onde não estava.

---

## 7. Nunca mostrar um número que não se sabe

**BR-060 — Uma taxa sobre nada é desconhecida, não zero.**
Uma conversão cuja fase anterior está vazia não mostra `0%` — `0%` lê-se como um
funil a falhar quando significa um funil vazio.

**BR-061 — Custo desconhecido assinala-se, não se assume zero.**

**BR-062 — Um erro de carregamento diz-se, não se mostra vazio.**
Uma página de zeros e uma lista vazia são respostas. Dá-las quando a pergunta
falhou é mentir com confiança.

**Onde o erro está, e não é onde parece.** Uma query do Supabase **não rejeita**
quando falha: resolve, com `{ data: null, error }`. Portanto `.catch(() => {})`
quase nunca corre, e quem engole é o `data || []` — com o erro no mesmo objecto,
por ler. Toda a leitura passa por `readResult` (`src/lib/loadFailures.js`), e
uma falha põe uma linha âmbar no ecrã com o nome do que falta.

**Uma gravação que falha diz-se ainda mais depressa.** Não se deixa o número que
a pessoa escreveu na caixa com ar de guardado, e não se soma esse número a
nenhum total no ecrã.

---

## Regras que ficaram por formalizar

| Área | Falta | Risco |
|---|---|---|
| Pipeline nos funis | Se é a oportunidade inteira ou a fatia do ano | Divergiu em três ecrãs até 11-09 |
| Negócios de origem interna | Se o parceiro os pode editar | Hoje pode; não foi decidido |
| `PACS ACTIVE MONITORING FEE` | O tecto real de desconto | Carrega 80% herdados, ditos incorrectos |
| Quem vê custo | Matriz papel × coluna | `roles.js` e a view discordam |
