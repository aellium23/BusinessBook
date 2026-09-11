# Backlog — o que a auditoria deixou em aberto

**Origem:** auditoria de 2026-09-11. Fechados nessa mesma sessão, não listados
aqui: margem 100×, markup confundido com margem, quatro valorizações
divergentes, ponderado do cartão, caixa de fase vazia, 52 avisos de linter.

Severidade: **P1** precisa de decisão e acção · **P2** vale a pena · **P3** ruído.

---

## SEC-01 · ✅ FECHADO · Custo legível na tabela base

**O quê.** `deal_products` é directamente legível por qualquer conta
autenticada, colunas incluídas. A view `deal_products_v` mascara `cost_price` e
`margin_pct`; a tabela não. Um parceiro na consola do browser:

```js
supabase.from('deal_products').select('*')
```

devolve o nosso custo em todas as linhas dos negócios da empresa dele.

**Evidência.** 217 linhas na tabela, 217 com custo e margem preenchidos.
Confirmado contra a base de dados a 11-09. Não é teórico.

**História.** É o problema #1 do `ASSESSMENT.md` de 2 de Junho. A resposta na
altura foi criar a view. A view resolve o ecrã e não a API.

**Correcção, em duas fases sem janela de quebra:**

1. ✅ **Feito em 11-09.** `deal_products_cost` criada, e `src/lib/dealLines.js`
   junta as duas. Tolera a view não existir, portanto a ordem entre o SQL e o
   deploy é indiferente. SQL: `supabase_migration_20260911_cost_view.sql`.
2. ✅ **Feito em 11-09**, depois de a fase 1 estar em produção e o breakdown
   económico confirmado. `supabase_migration_20260911_cost_revoke.sql`: a view
   perde as colunas e a tabela base troca o `grant select` de tabela por um de
   lista de colunas. A partir daqui a consola de um parceiro devolve erro, não
   um número.

**Porque não numa fase:** a view é agora `security_invoker`, portanto lê a
tabela como quem chama. Revogar a coluna parte a view também para os admins, e
o `DealForm` calcula o breakdown económico a partir dela.

**Verificado a 11-09**, do lado da base de dados e não por inferência:
`information_schema.column_privileges` não dá `SELECT` a `authenticated` em
`cost_price` nem em `margin_pct`, e dá-o nas catorze restantes. `INSERT` e
`UPDATE` continuam — de propósito, o quick deal grava custo — e o `REFERENCES`
que aparece é resíduo do grant de tabela, sem valor de leitura.

**Nota para o futuro:** o `grant` na tabela base é agora por lista de colunas.
Uma coluna nova fica ilegível até ser acrescentada a essa lista — que é o
comportamento certo para uma tabela que guarda o nosso custo, mas explica
qualquer "permission denied" inesperado depois de uma migração.

---

## SEC-03 · ✅ FECHADO · Transições de estado não eram impostas na base de dados

**O quê.** A máquina de estados vivia só no browser. Uma chamada directa:

```js
supabase.from('deals').update({ stage: 'Invoiced' }).eq('id', '<negócio próprio>')
```

movia um negócio de Lead para Faturado. A política verificava a empresa e mais
nada. Conta para o funil, para as vendas por cliente e para a reconciliação com
o SAP: um parceiro podia inflacionar receita nossa reportada, e os nossos
comerciais também.

**Fechado a 11-09.** `supabase_migration_20260911_write_guards.sql`:
`deal_stage_transitions` guarda a regra **como dados**, e um trigger
`before update of stage on deals` recusa o que lá não estiver.

**Isento: admin.** Correcções de dados e imports precisam de passar por cima, e
uma regra sem saída é contornada por acidente. Manager **não** é isento — quem
corrige histórico deve estar a fazê-lo de propósito. O SQL Editor também passa,
porque corre como superutilizador sem `auth.uid()`, e uma conta que é dona da
base de dados não é uma ameaça que um trigger resolva.

**O INSERT fica de fora, de propósito.** Um negócio pode nascer em qualquer fase
— um import, ou um negócio que nos chega já ganho. A máquina governa movimento.

**As duas cópias da regra são comparadas a cada `npm run test`.** O teste em
`src/lib/__tests__/writeGuards.test.js` lê os pares do próprio ficheiro de
migração e confronta-os com `DEAL_TRANSITIONS`, nomeando os que faltam de cada
lado. Duas cópias de uma regra é uma a mais; duas cópias que falham o build
quando divergem é a melhor resposta disponível enquanto o cliente tiver de
desenhar a caixa de selecção.

---

## SEC-04 · ✅ FECHADO · Um parceiro não lia o nosso custo, mas podia sobrepô-lo

**O quê.** Fechar o SEC-01 tirou o `SELECT` das colunas de custo e deixou o
`INSERT` e o `UPDATE`, que são precisos porque o quick deal grava custo. A
política de escrita em `deal_products` deixava um parceiro alterar as linhas dos
negócios da empresa dele, essas colunas incluídas. Não podia espiar. Podia
estragar — e as nossas margens saem dali.

**Porque não se resolve com `grant`.** Ao nível do Postgres somos todos o mesmo
papel `authenticated`: um grant de coluna não distingue um comercial nosso de um
distribuidor. Tem de ser RLS ou um trigger.

**Fechado a 11-09.** Trigger `deal_products_cost_guard`, no mesmo ficheiro: quem
não passa `sees_internal_economics()` tem `cost_price` e `margin_pct` forçados a
nulo no INSERT e repostos ao valor anterior no UPDATE.

**Coagido, não recusado.** A proposta de um parceiro manda estas colunas em todas
as gravações, e manda-as vazias. Rebentar ali partia todas as gravações legítimas
para castigar um caso que não acontece por esse caminho. O que nunca pode é
deixar passar um valor.

---

## SEC-05 · ✅ FECHADO · Toda a gravação de linhas escrevia custo zero

**Encontrado a 11-09, ao fechar o SEC-04, e era pior do que o SEC-04.**

`saveDealProducts` fazia `cost_price: parseFloat(l.cost_price) || 0`. O quick
deal manda `cost_price: null` em **todas** as gravações de parceiro — e
`parseFloat(null) || 0` é **0**. Portanto cada gravação de um parceiro escrevia
custo zero e margem zero, que se lê como "entregue de graça" e produz 100% de
margem. A mentira exacta que todos os ecrãs desta aplicação foram ensinados a
recusar, escrita na tabela pelo ajudante que os grava.

**Corrigido** com `numOrNull` em `src/lib/numbers.js`, com teste. Desconhecido
fica nulo; um zero a sério sobrevive, porque é alguém a dizer zero de propósito.

**Histórico limpo a 11-09.** 14 linhas em 13 negócios, todas com preço de venda e
custo zero — uma combinação que dá 100% de margem, e ninguém neste negócio vende
a 100%. Quatro da TIMED (o `null → 0` do parceiro) e o resto de Portugal (campo
em branco no formulário completo, em linhas de revenda e de serviços, que não
custam zero). Passaram a nulo:

```sql
update public.deal_products
set cost_price = null, margin_pct = null
where cost_price = 0 and net_price > 0;
```

**Verificado contra a base de dados**, não por inferência: `ainda_a_zero = 0`,
`agora_nulas = 14`.

**As 11 linhas com preço zero E custo zero ficaram como estavam.** Ali o zero não
afirma nada — são linhas vazias, e pertencem ao DATA-01.

---

## DATA-02 · ✅ FECHADO · Uma linha guardava três números que não podiam ser todos verdade

**Encontrado na limpeza do SEC-05.** A linha do `testelio23` (CWM Dose,
297.010,56 €) tinha custo 0 e `margin_pct` 100 — e `margin_pct` é **markup sobre
o custo** (BR-011). Custo 0 com markup 100% dá preço 0. Os três números não
fecham.

Não veio do quick deal: `markupOnCost(0, preço)` devolve nulo. Veio do editor de
linhas completo, onde alguém escreveu 100 num campo cujo nome não diz o que
significa.

**O perigo era concreto.** Em `ProductLineItems`, mexer no custo dispara
`if (margin > 0) unit_price = cost × (1 + margin/100)`. Com custo 0 e markup 100,
o preço recalculava-se para **zero** — os 297 mil desapareciam a meio de uma
edição que ninguém pediu, na maior linha da tabela.

O update do SEC-05 desarmou esta linha. **O mecanismo foi fechado a 11-09**: o
preço só segue o markup quando há um custo de onde partir. Sem custo, o markup é
registado e o preço fica exactamente onde alguém o pôs — um markup é uma maneira
de *chegar* a um preço a partir de um custo, e sem custo chega a zero.

De caminho, uma linha nova deixou de nascer com `cost_price` igual ao preço de
venda. `license_fee` é o que o produto **vende**, e pô-lo na caixa de custo diz
que a linha não ganha nada — uma linha que abre a declarar 0% de margem é uma
que ninguém se lembra de corrigir. Nasce vazia e a caixa fica âmbar até alguém
responder.

---

## SPEC-02 · ✅ FECHADO · Dois ecrãs discordavam sobre uma linha sem custo

**O quê.** `DealForm` soma `n(l.cost_price)` em bruto: custo zero dá margem
**100%**. `ProductLineItems` faz `cost_price || unit_price`: o mesmo zero dá custo
igual ao preço e margem **0%**. O mesmo negócio, dois ecrãs, duas margens
opostas.

**Fechado a 11-09** com uma definição só: `lineCostTotals` em
`src/lib/margins.js`, que ambos passam a chamar. Uma linha sem custo fica **fora**
da soma e é contada à parte; a margem só é desenhada quando todas responderam, e
até lá é um traço com a contagem das que faltam ao lado. Nem 100% nem 0%: a
resposta verdadeira era "não sabemos", e era a única que nenhum dos dois sabia
dizer.

---

## SEC-06 · P2 · Uma gravação de parceiro apaga o nosso custo à mesma

**O quê.** `saveDealProducts` apaga todas as linhas do negócio e reinsere-as. Um
parceiro a gravar um negócio que **nós** cotámos destrói o nosso custo nele — não
por escrever por cima, que o SEC-04 impede, mas por apagar a linha que o
guardava. A linha volta com custo nulo e o trigger mantém-no nulo.

**Não se fecha sem decidir o BIZ-02:** se um parceiro pode ou não editar um
negócio que nós criámos. A resposta muda o que o ecrã faz, e não só o que a base
de dados permite.

---

## UX-02 · ✅ FECHADO · Um distribuidor não conseguia fazer avançar um Lead

**O quê.** O ecrã cruza `DIST_STAGES` (Lead, Proposta apresentada, BackLog,
Perdido) com as transições permitidas. Num Lead as permitidas são Pipeline e
Perdido, e Pipeline não está na lista de um distribuidor — logo a caixa oferece
**só Perdido**. Para chegar a Proposta apresentada tem de passar por uma fase que
não lhe é mostrada.

**Já era assim antes do trigger.** O trigger não o causou; tornava-o permanente.

**Fechado a 11-09:** Lead → Proposta apresentada passa a transição legítima, nos
dois sítios onde a máquina vive. A aresta está certa por si e não como remendo —
um negócio que vai directo a orçamento é corrente, e é o que o quick deal faz.
O Pipeline fica para os que são mesmo qualificados antes de alguém cotar, e o
distribuidor deixa de ver uma fase que não é dele.

**O teste que faltava não era de nenhuma das duas listas, era do cruzamento.**
`writeGuards.test.js` percorre agora todas as fases de um distribuidor e exige
que reste um movimento para a frente em cada uma — desistir não conta.

---

## UX-01 · P2 · Quarenta e sete erros engolidos em silêncio

**O quê.** `.catch(() => {})` a carregar opções de listas. Falhar em silêncio
mostra uma lista vazia, que se lê como "não há produtos" em vez de "não consegui
carregar".

**História.** Problema #6 do `ASSESSMENT.md`. Quatro corrigidos a 11-09 —
Budget, History, matriz de requisitos, notificações. Restam 47.

**Correcção.** Um a um: cada sítio precisa de uma decisão sobre onde mostrar a
falha. Não é uma varredura automática.

**Esforço:** meio dia. **Risco:** baixo.

---

## SPEC-01 · P2 · Quem vê custo: duas fontes discordam

**O quê.** `roles.js` inclui `member` em quem vê custo e margem. A view mascara
para quem não é admin ou manager. Um comercial nosso vê a margem do negócio e
não vê o custo da linha.

**Não é claramente um bug.** Pode ser intencional. Precisa de decisão de produto,
e depois de alinhar as duas fontes.

---

## BIZ-05 · P1 · A arquitectura de desconto assenta numa lista que não existe

**O quê.** `partnerEconomics()` modela o que foi escrito no briefing: o cliente
paga `netPrice` sobre uma lista publicada, e a transferência desce por baixo
dela para proteger a margem do parceiro. Todos os números dela se medem contra
uma lista **do cliente**.

Com o BR-032 estabelecido, essa lista não é a R1–R4 — e não se sabe onde vive,
nem se existe. A função ficou desligada do quick deal a 11-09 e o ecrã passou a
usar `channelEconomics()`, que lê o negócio do nosso lado.

**O que fica órfão, e precisa de decisão tua:**

- **A taxa do papel, Full VAR 40%.** Já não é um desconto sobre lista de
  cliente. É a margem esperada do parceiro? Então porque é que a proposta dele
  abre a 35%? Hoje a taxa é só uma etiqueta no select — não entra em conta
  nenhuma.
- **Os pisos de 35 / 20 / 15.** Continuam a fazer sentido como política, mas o
  ecrã já não os pode *medir*: a margem do parceiro é uma escolha dele que não
  vemos. Só se mede se ele gravar a proposta dele.
- **Os programas nomeados** (60/42 e 65/45). A margem entre os dois é uma razão
  — 30% e 30,8% — e essa sobrevive a qualquer base, por isso continua a ser
  usada. Os dois números em separado não.

**Nota:** `partnerEconomics` e os seus testes ficaram no sítio de propósito. A
política que codificam é real e é o único registo dela.

---

## BIZ-01 · P2 · Tecto de desconto do `PACS ACTIVE MONITORING FEE`

Carrega 80% herdados, que foram ditos incorrectos. Falta o número real.

**Esforço:** trivial assim que houver o número.

---

## BIZ-02 · P2 · Pode um parceiro editar um negócio que nós criámos?

Hoje pode — é o que a política sempre permitiu, e o ecrã foi alinhado com ela a
11-09. Se a resposta for não, é uma regra nova nos dois lados: uma marca de
origem no negócio, ou comparar `created_by` com um perfil interno.

---

## BIZ-03 · P3 · Pipeline nos funis: oportunidade inteira ou fatia do ano?

Alinhado à regra do `CLAUDE.md` a 11-09, o que **alterou números reportados** nos
funis de produto e de comercial. Se a leitura antiga era deliberada, volta — mas
como regra escrita.

---

## DATA-01 · P3 · Linhas de produto sem produto

Pelo menos uma linha com `product_name` vazio e 27.500 € de valor líquido. Cai
em "(no product)" nos relatórios por produto. Vale confirmar quantas são e se é
intencional.

```sql
select id, deal_id, net_price, created_at
from public.deal_products
where product_name is null or trim(product_name) = ''
order by net_price desc;
```

---

## DOC-01 · P2 · Documentação sem autoridade

Os documentos em `docs/` são descritivos até serem revistos. Enquanto ninguém os
confirmar, não conseguem dizer que o produto está errado — foi assim que a
margem 100× sobreviveu.

**Correcção:** leres `BUSINESS_RULES.md` e tirares as marcas `⚠ POR CONFIRMAR`
do que estiver certo, corrigindo o resto. A partir daí uma divergência entre o
documento e o código é um bug do código.

---

## DOC-02 · P3 · `ASSESSMENT.md` dá por fechado o que está aberto

Tem três meses e nada o marca como histórico. Sete dos dez pontos estão
fechados; o #1 e o #7 não estão, e o documento não o diz.

**Correcção:** cabeçalho a datá-lo como instantâneo, e uma linha de estado por
item.
