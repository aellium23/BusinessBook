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

## SEC-03 · P1 · Transições de estado não são impostas na base de dados

**O quê.** A máquina de estados vive só no browser. Uma chamada directa:

```js
supabase.from('deals').update({ stage: 'Invoiced' }).eq('id', '<negócio próprio>')
```

move um negócio de Lead para Faturado. A política verifica a empresa e mais
nada.

**Impacto.** Conta para o funil, para as vendas por cliente e para a
reconciliação com o SAP. Um parceiro pode inflacionar receita reportada nossa.
Os nossos comerciais podem fazer o mesmo.

**Correcção.** Trigger `before update` em `deals` a validar contra a mesma
tabela de transições. **Precisa de decisão:** quem fica isento. Correcções de
dados e imports vão precisar de passar por cima.

**Esforço:** 1 migração. **Risco:** bloqueia correcções legítimas se a lista de
isenções ficar curta.

---

## SEC-04 · P2 · Um parceiro não lê o nosso custo, mas pode sobrepô-lo

**O quê.** Fechar o SEC-01 tirou o `SELECT` das colunas de custo, e deixou o
`INSERT` e o `UPDATE` — que são precisos, porque o quick deal grava custo. Mas
a política de escrita em `deal_products` deixa um parceiro alterar as linhas dos
negócios da empresa dele, essas colunas incluídas.

Não pode espiar. Pode estragar — e as nossas margens saem dali.

**Porque não se resolve com `grant`.** Ao nível do Postgres somos todos o mesmo
papel `authenticated`: um grant de coluna não distingue um comercial nosso de um
distribuidor. Tem de ser RLS ou um trigger.

**Nota:** um parceiro nunca grava custo legitimamente — o quick deal escreve
`cost_price: null` quando quem cota não é dos nossos. Portanto a regra é simples
de enunciar: quem não vê custo não o escreve.

**Parente do SEC-03.** Mesmo mecanismo, mesma migração se forem feitos juntos.

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

## BIZ-04 · P1 · As três propostas da TIMED foram gravadas ao preço errado

**O quê.** A correcção de 11-09 (BR-032) muda o que o ecrã calcula, não o que
está gravado. Os três negócios que a TIMED criou têm `deal_products.unit_price`
e `net_price` escritos com o custo inflacionado — a lista regional inteira como
custo deles — e portanto um preço ao cliente ~54% acima da nossa lista.

**O que acontece agora.** Abrir a proposta no quick deal mostra os números
corrigidos; o negócio só passa a valer isso quando alguém gravar. Até lá o
pipeline e os relatórios por produto carregam os valores antigos.

**Correcção.** Abrir cada um dos três, confirmar o preço e gravar. São três
cliques deliberados, que é o que deve ser: mexer no valor de um negócio já
cotado não é uma decisão de ecrã.

---

## BIZ-06 · P1 · A tabela PROPOSAL mede a nossa margem contra o preço do cliente

**O quê.** No `table` do quick deal (`QuickQuote.jsx`), `gm = pvp − cost`. Num
negócio de canal o `pvp` é o preço do CLIENTE e a nossa receita é a
transferência, portanto a margem que a tabela imprime inclui a fatia do
parceiro.

Com o custo real do CWM Dose a rondar 20k nos cinco anos:

| | tabela diz | é |
|---|---|---|
| Margem bruta | 45.573 € · 69% | 19.344 € · 49% |

Sobreavaliada por exactamente os 26.229 € que são do parceiro, em todos os
negócios de canal. O aviso âmbar existente ("algumas linhas não têm custo")
apanha o caso do custo zero e não apanha este.

**Bloqueia numa decisão.** Repartir a transferência por linha precisa de saber
se os serviços de implementação passam pelo parceiro ou são nossos directos:

- **Passam pelo parceiro** — a margem de cada linha mede-se contra a parte da
  transferência que lhe cabe, serviços incluídos.
- **São nossos** — os serviços mantêm a margem cheia e só os produtos são
  medidos contra a transferência.

Na dúvida a leitura conservadora é a primeira, porque é a que não inventa
margem. Não foi aplicada sem resposta: é um número de dinheiro em todos os
negócios de canal.

---

## BIZ-05 · P2 · O que fazem os programas nomeados depois do BR-032

**O quê.** `NAMED_PROGRAMMES` guarda `netPctOfList 60 / transferPctOfList 42` e
`65 / 45`. Estão expressos contra a lista — que agora está estabelecido ser o
preço do cliente — portanto continuam a ler-se bem do lado da `partnerEconomics`.
O que não existe é o caminho do parceiro: a proposta da TIMED não conhece
programas, e num deal de deslocação competitiva o custo dela devia ser 42% da
lista, não 60%.

**Correcção.** Passar o programa ao `partnerLineCost` quando houver um. Não foi
feito agora porque nenhum dos três negócios da TIMED tem programa e a regra
merece ser confirmada antes de ser codificada.

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
