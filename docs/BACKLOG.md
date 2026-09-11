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

## UX-01 · ✅ FECHADO · Erros de carregamento engolidos em silêncio

**O quê.** Quarenta e um sítios liam uma tabela e, se a leitura falhasse,
seguiam com nada. Um painel desenhava zeros e uma caixa de selecção desenhava-se
vazia — e as duas coisas são **respostas**: "não facturaste nada este trimestre",
"este parceiro não tem produtos". Nenhuma delas era o que tinha acontecido, e
quem estava a olhar para o ecrã não tinha maneira de saber.

**O que estava mesmo a engolir, e não era o que parecia.**

```js
.then(({ data }) => setBudget(data || []))
.catch(() => {})
```

O `.catch` é o que se lê como descuido, e é o inofensivo: **uma query do Supabase
não rejeita quando falha** — resolve, com `{ data: null, error }` — por isso
aquele catch quase nunca corre. Quem engolia era o `data || []`, com o erro ali
ao lado no mesmo objecto, nunca lido, e um array vazio a ir para o ecrã no lugar
dele.

Foi por isso que a correcção não podia ser embrulhar a promessa. A unidade é a
**resposta**, que é a única forma que consegue ver o erro.

**Fechado a 11-09** com `src/lib/loadFailures.js` (a parte pura, com testes) e
`src/hooks/useLoadFailures.jsx` (o lado React, mais o banner). Cada leitura tem
uma etiqueta que nomeia a coisa e não a tabela — "o orçamento", não `budget` — e
uma falha põe uma linha âmbar no topo do ecrã que a mostra. Uma segunda tentativa
bem sucedida tira-a de lá: um aviso que continua a pedir desculpa por uma coisa
que já chegou ensina as pessoas a ignorá-lo.

**Três casos que não são leituras e foram tratados à parte:**

- **`SlaFormModal`** gravava três campos ao sair da caixa com
  `.then(() => {}).catch(() => {})` e deitava o resultado fora. Uma gravação que
  a base de dados recusasse deixava o número que a pessoa escreveu na caixa, com
  ar de guardado — e a da quota anual ia mais longe: somava-o ao total do
  contrato no ecrã, portanto o contrato valia aqui mais do que na base de dados.
  Agora diz que não guardou, e o total não se mexe quando a gravação falha.
- **`useSettings`** não tem ecrã próprio. Fica o log; o que protege o dinheiro
  ali é o `DEFAULTS`, onde `man_day_cost` é nulo em vez de uma diária plausível.
- **`storage.js`** limpa um blob órfão depois de a inserção dos metadados
  falhar. Continua best-effort — quem chamou já tem o erro a sério — mas passou
  a registar, porque um bucket que cresce sem ninguém saber porquê é um problema
  de outro dia.

**O que ficou deliberadamente silencioso:** `localStorage` em janela privada. São
preferências de quem está a ver, e cada um desses `catch` leva agora uma palavra
a dizer que é de propósito.

---

## SPEC-01 · ✅ FECHADO · Quem vê custo: três fontes, uma discordante

**O quê.** Três respostas a "quem pode ver o que uma linha nos custa":

| | responde |
|---|---|
| `src/lib/roles.js`, `seesCost()` | admin · manager · **member** |
| `sees_internal_economics()` | admin · manager · **member** |
| view `deal_products_cost` | admin · manager |

A view era a discordante. Foi escrita a 11-09 e pegou no par de governança
quando a pergunta que respondia era a interna.

**E não era académico.** Um comercial nosso cota um negócio no quick deal —
escolhe os SKUs, lê o custo, decide a margem — grava, reabre, e o ecrã diz-lhe
que as linhas não têm custo. Escreveu o número e não o consegue ler de volta.

Desde o SEC-04 contradizia também um guard: o `deal_products_cost_guard` deixa um
`member` **escrever** custo, porque o `sees_internal_economics()` diz que pode.
Escrever e não ler é ao contrário, e ninguém o desenhou.

**Fechado a 11-09** com `supabase_migration_20260911_cost_readers.sql`: a view
passa a fazer a mesma pergunta que o resto do sistema. Alarga a leitura aos
nossos comerciais e a mais ninguém — distribuidores, parceiros e *viewers* não
estão no `sees_internal_economics()` e continuam de fora.

**E o ecrã deixou de confundir duas coisas.** O bloco de economia do `DealForm`
aparecia para "quem não é distribuidor", o que deixava passar um *viewer* — que
não pode preçar nada — e depois lhe dizia que as linhas não tinham custo. Não é
uma verdade mais pequena, é outra afirmação: "ninguém preencheu" onde a resposta
era "isto não é teu para veres". Passou a perguntar `canPrice`.

---

## BIZ-05 · ⏳ PARCIAL · A arquitectura de desconto assenta numa lista que não existe

**`partnerEconomics()` continua desligada.** Modela o briefing — o cliente paga
`netPrice` sobre uma lista publicada, e a transferência desce por baixo dela —
e todos os números dela se medem contra uma lista **do cliente**. Com o BR-032
estabelecido, essa lista não é a R1–R4 e não se sabe onde vive.

**Confirmado pelo dono do P&L a 11-09:** *"o Transfer Price para o parceiro é o
que aparece na pricelist na coluna que corresponde R1, R2, R3, R4 dependendo do
país."* O BR-032 deixa de estar por confirmar.

**O que ficou resolvido, e por que caminho.** A pergunta "o que significa o Full
VAR 40%" não tinha resposta — *"não sei qual a resposta mais indicada"* — e não
era para inventar. Resolveu-se pelo outro lado: **uma caixa para escrever o preço
que o parceiro nos diz que vai cobrar.**

- **Vazia** — o painel estima à margem protegida, a cinzento com `≈`, como antes.
- **Preenchida** — a estimativa dá lugar a uma medição. A margem do parceiro
  passa a ser calculada e não assumida, e os pisos 35/20/15 passam a ser
  **verificáveis** em vez de recitáveis.

Isto dá também um trabalho honesto aos 40%: deixam de prometer uma conta que não
existe e passam a ser **a referência contra a qual a margem medida é lida** — "o
acordo diz 40%, este negócio dá-lhes 45,4%". Não entra em cálculo nenhum, que é
o que se sabe ser verdade.

**A armadilha que isto evita, e que está no teste:** uma margem assumida é igual
à assunção, portanto uma verificação de piso contra ela **passa sempre** — e uma
verificação que não pode falhar lê-se como uma verificação que passou. Por isso
`belowFloor`, `belowAbsolute`, `underTransfer` e `onRoleRate` são todos falsos
enquanto ninguém escrever um preço.

**Grava só o que foi dito.** `end_customer_price` e `partner_margin_pct` ficam a
nulo enquanto a caixa estiver vazia (BR-036). A estimativa do painel nunca chega
à base de dados.

**O que continua aberto:**

- **O significado dos 40%.** Hoje são uma referência. Se forem a margem que um
  Full VAR deve mesmo ter, a proposta do parceiro devia abrir a 40% e não aos 35%
  do alvo protegido — são dois números a fazer o mesmo trabalho em ecrãs
  diferentes.
- **Os programas nomeados.** A razão entre os dois números sobrevive a qualquer
  base (30% e 30,8%) e é essa que se usa. Os dois números em separado não.

---

## BIZ-01 · ✅ FECHADO · `PACS ACTIVE MONITORING FEE` sai do catálogo

Carregava 80% de tecto de desconto herdados da folha de preços, ditos
incorrectos. A resposta a "qual é o número certo" acabou por ser que o SKU não
deve ser cotável.

**Desactivado, não apagado.** Uma proposta guardada com este SKU foi uma
proposta a sério, a um preço a sério. Apagar a linha não desfaz isso — faz com
que a proposta guardada aponte para uma coisa que já não existe, e um preço que
ninguém consegue ligar a um part number é um preço que ninguém consegue
defender. O `product_items` já tem `active`, e todos os ecrãs que lêem o
catálogo filtram por ele, portanto sai de todos os selectores sem mexer num
único valor gravado.

SQL: `supabase_migration_20260911_retire_monitoring_fee.sql`, que começa por uma
consulta para ler **antes** de mudar seja o que for — um `like` sobre um nome é
um instrumento grosseiro.

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

**O funil, corrigido a 11-09.** Três coisas diferentes aterravam no mesmo traço,
e só uma delas é um problema de dados:

| Agora diz | É |
|---|---|
| `(no product)` | o **negócio** não tem linhas nenhumas |
| `(line with no product)` | uma **linha** que não nomeia produto — dinheiro por atribuir |
| `(no category)` | um produto a sério, com a categoria por preencher |

As duas primeiras aparecem a âmbar.

**Por onde entravam, fechado a 11-09.** A caixa do nome só aparece quando uma
linha personalizada está expandida — portanto uma linha acrescentada e deixada
fechada nunca pedia nome nenhum, e o cabeçalho mostrava o texto do *placeholder*,
que se lê como uma etiqueta e não como uma falta. Agora a linha nova abre-se
sozinha, o cabeçalho fica âmbar a dizer "dá um nome a esta linha", e gravar um
negócio com uma linha que leva preço e não leva nome é recusado.

**As três que existem** (confirmado contra a base de dados a 11-09):

| Cliente | Valor | Quando |
|---|---|---|
| IPOC | 27.500 € | 26-08 |
| REMAGNA | 400 € | 17-08 |
| LPCC NRC — SYN | 0 € | 27-05 |

As duas primeiras são dinheiro a sério a cair em `(line with no product)`. Só tu
sabes o que foi vendido, portanto ficam para nomeares — abre cada negócio,
expande a linha e escreve o nome. A terceira não vale nada e não move número
nenhum; fica onde está até haver motivo para lhe tocar.

---

## DOC-01 · P2 · Documentação sem autoridade

Os documentos em `docs/` são descritivos até serem revistos. Enquanto ninguém os
confirmar, não conseguem dizer que o produto está errado — foi assim que a
margem 100× sobreviveu.

**Correcção:** leres `BUSINESS_RULES.md` e tirares as marcas `⚠ POR CONFIRMAR`
do que estiver certo, corrigindo o resto. A partir daí uma divergência entre o
documento e o código é um bug do código.

---

## DOC-02 · ✅ FECHADO · `ASSESSMENT.md` dava por fechado o que estava aberto

Tinha três meses e nada o marcava como histórico, portanto lia-se como o estado
actual. **Fechado a 11-09:** cabeçalho a datá-lo como instantâneo de 2 de Junho,
e uma coluna de estado por item no TOP 10 — verificada contra o repositório e a
base de dados, não por memória.

O documento **não** é actualizado ponto por ponto de propósito. Uma auditoria
reescrita deixa de ser uma auditoria; fica a valer pelo registo de onde se
partiu, e o estado de hoje vive aqui e no `BUSINESS_RULES.md`.

Seis dos dez estão fechados, quatro estão a meio, e os quatro estão em baixo.

---

## SEC-07 · ✅ FECHADO · As transições de contratos só existiam no browser

**Encontrado a datar o `ASSESSMENT.md`.** O ponto #7 de Junho dizia "sem
validação de transições de estado (negócios **e contratos**)". O SEC-03 fechou
metade; a outra ficou por fazer e ninguém a tinha escrito.

O `canTransition('sla', …)` corria no `SlaFormModal` e não havia nada por trás.
Uma chamada directa movia um contrato de `draft` para `active` sem passar por
`waiting_po`, e daí contava para a receita recorrente do painel e para o EST1.

**Fechado a 11-09** com `supabase_migration_20260911_sla_guards.sql`, na mesma
forma dos negócios de propósito: a regra como dados (`sla_status_transitions`,
17 pares), um trigger `before update of status on slas`, admin isento, INSERT
livre. Um segundo mecanismo para o mesmo tipo de regra é um segundo mecanismo
para correr mal.

**O teste do SEC-03 ganhou o par.** Compara as duas cópias, exige que a máquina
só nomeie estados que o `SLA_STATUSES` desenha, e que nenhum estado seja um beco
sem saída — que foi exactamente o que aconteceu aos distribuidores no UX-02, no
outro mecanismo.

**E o extractor passou a ser imune a um detalhe que me apanhou:** um
ponto-e-vírgula dentro de um comentário `--` terminava o `[^;]*` mais cedo, e a
primeira versão leu 15 dos 17 pares. O teste falhou — o sistema a funcionar — mas
quem lesse o erro ia procurar no ficheiro errado. Os comentários são retirados
antes da extracção.

---

## DATA-03 · ✅ FECHADO · Três números do painel filtravam por um estado que não existe

**Encontrado a escrever o SEC-07.** `Dashboard.jsx`, `DashboardSummary.jsx` e
`SLAs.jsx` filtravam contratos por `status === 'pipeline'`. Não há estado
`pipeline`: os oito são draft, waiting_po, warranty, active, pending_renewal,
renewed, expired e cancelled.

O que existia era um **separador** na página de contratos com o id `pipeline`,
cujo conteúdo é draft mais waiting_po. **O id de um separador, usado como valor
de uma coluna.**

**Confirmado contra a base de dados a 11-09:** só os oito existem, nenhuma linha
com `pipeline`. Portanto o filtro não apanhava nada e `slaRecurring.pipeline` e
`slaStats.pipelineValue` eram **zero por construção** — e um zero lê-se como
"não há pipeline recorrente", não como uma soma partida.

**Fechado a 11-09.** `SLA_PIPELINE_STATUSES` e `SLA_ACTIVE_STATUSES` em
`src/constants.js`, usados nos quatro sítios — os três ecrãs e a contagem do
próprio separador, que era onde a definição verdadeira já estava escrita.

**É uma alteração de reporte, não de ecrã.** Dois números que estavam a zero
passam a mostrar o valor anual dos contratos em draft e à espera de PO. Se
parecerem altos, é porque estiveram escondidos.

O teste que faltava não era de nenhuma das duas listas: é de que **nenhum grupo
nomeie um estado que não existe**, e que `pipeline` não seja confundido com um.

---

## BIZ-06 · ⏳ EM CURSO · Strings em inglês no código

As chaves de i18n estão completas — **1.416 nas três línguas, zero lacunas** —
mas parte da interface está escrita em inglês directamente no JSX. Um espanhol
abria o formulário de contratos e lia-o em inglês.

**Feito a 11-09, os quatro piores:**

| Ficheiro | Antes | Agora |
|---|---|---|
| `SlaFormModal.jsx` | 41 | 0 |
| `History.jsx` | 38 | os códigos de coluna |
| `Settings.jsx` | 30 | 0 |
| `ContactsList.jsx` | 27 | 0 |

**Total: 524 → 425.**

**O que ficou em inglês de propósito, no `History`:** `VGT NS`, `ECT GM`,
`Op.Inc`, `Ach.%`, `Int%`, `Iberia NS`. São códigos de coluna do P&L, lidos
contra o SAP, e traduzi-los tornaria a tabela mais difícil de conferir e não mais
fácil de ler. A prosa e as etiquetas a sério foram todas.

**Dois achados pelo caminho:** o contador de clientes do `History` dizia
`Clientes` — português cravado num ficheiro inglês — e `hist_title` e
`hist_metric` já existiam, portanto reaproveitaram-se em vez de duplicar.

**O que falta**, por ordem: `DashboardSummary` (26), `Clients` (23),
`RequirementsMatrix` (22), `UsersTab` (22), `Approvals` (19),
`DiscountHistory` (16). É ficheiro a ficheiro e cada string precisa de uma chave
e de três traduções — não há atalho.

**Nota sobre a contagem:** é grosseira — texto entre tags e
`placeholder`/`title` com palavras que começam por maiúscula. Serve para ordenar
os ficheiros por tamanho do problema, não para reportar progresso ao décimo.
