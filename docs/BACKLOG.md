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

## SEC-05 · P1 · Toda a gravação de linhas escrevia custo zero

**Encontrado a 11-09, ao fechar o SEC-04, e é pior do que o SEC-04.**

`saveDealProducts` fazia `cost_price: parseFloat(l.cost_price) || 0`. O quick
deal manda `cost_price: null` em **todas** as gravações de parceiro — e
`parseFloat(null) || 0` é **0**. Portanto cada gravação de um parceiro escrevia
custo zero e margem zero, que se lê como "entregue de graça" e produz 100% de
margem. A mentira exacta que todos os ecrãs desta aplicação foram ensinados a
recusar, escrita na tabela pelo ajudante que os grava.

**Corrigido** com `numOrNull` em `src/lib/numbers.js`, com teste. Desconhecido
fica nulo; um zero a sério sobrevive, porque é alguém a dizer zero de propósito.

**Fica por fazer:** contar quantas linhas já ficaram com `cost_price = 0` por
causa disto e decidir o que fazer com elas. Zero e nulo já não se distinguem
depois do facto, portanto isto precisa de um olho humano e não de um UPDATE:

```sql
select dp.deal_id, d.client, d.company_id, count(*) as linhas
from public.deal_products dp
join public.deals d on d.id = dp.deal_id
where dp.cost_price = 0
group by 1, 2, 3
order by linhas desc;
```

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

## UX-02 · P2 · Um distribuidor não consegue fazer avançar um Lead

**O quê.** O ecrã cruza `DIST_STAGES` (Lead, Proposta apresentada, BackLog,
Perdido) com as transições permitidas. Num Lead as permitidas são Pipeline e
Perdido, e Pipeline não está na lista de um distribuidor — logo a caixa oferece
**só Perdido**. Para chegar a Proposta apresentada tem de passar por uma fase que
não lhe é mostrada.

**Já era assim antes do trigger.** O trigger não o causou; torna-o permanente, e
por isso fica escrito. A correcção é decidir qual das duas listas está errada: ou
um distribuidor vê Pipeline, ou Lead → Proposta apresentada passa a ser uma
transição legítima.

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
