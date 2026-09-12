# Epics

**Versão:** 2026-09-12.

Seis epics. Cada um agrupa histórias (`USER_STORIES.md`), regras
(`BUSINESS_RULES.md`) e o que ficou aberto (`BACKLOG.md`), para que se possa
olhar para uma área de cada vez e saber onde ela está.

**Não são um plano de trabalho.** São a maneira de arrumar o que existe. O que
vem a seguir decide-se olhando para as colunas "aberto".

| | Epic | Histórias | Estado |
|---|---|---|---|
| **E1** | Cotar um negócio | H1.1 – H1.3 | fechado, com uma ponta |
| **E2** | Descontar e aprovar | H2.1 – H2.2 | fechado |
| **E3** | O canal | H3.1 – H3.3 | uma decisão em aberto |
| **E4** | Confiar nos números | H4.1 – H4.2 | fechado |
| **E5** | Governo dos dados | H5.1 – H5.2 | fechado |
| **E6** | Mobile e línguas | H6.1 – H6.2 | duas pontas |

---

## E1 · Cotar um negócio

**O que é.** Do cliente ao preço defensável: lista regional, escalões de volume,
conversão cambial, as duas metades de cada linha, os serviços em dias-homem.

**Regras:** BR-001 a BR-005 (valor), BR-010 a BR-014 (margens e unidades).

**O que custou aprender.** Três unidades de margem diferentes em três colunas
cujo nome não as distingue — fracção, markup sobre custo, margem sobre preço — e
a confusão entre elas custou um erro de 100×. Estão escritas no `BUSINESS_RULES`
§2 e têm teste próprio.

**Aberto:** DATA-01 — duas linhas com preço e sem produto, 27.500 € e 400 €, à
espera de alguém lhes dar nome. O caminho que as criava está fechado.

---

## E2 · Descontar e aprovar

**O que é.** Duas máquinas paralelas: um desconto sobre o que fazemos sai do
preço ao cliente e precisa de assinatura; um desconto sobre o que compramos sai
do nosso custo e precisa do fornecedor. E a negociação que se segue.

**Regras:** BR-020 a BR-024.

**O que custou aprender.** Que uma aprovação por menos do que foi pedido **é**
uma contraproposta, e que a diferença importa a jusante: uma aprovação é final,
uma contraproposta espera. E que `applied_at` é o que impede responder duas vezes
de descontar duas vezes.

**Aberto:** nada. BIZ-01 fechou com o `PACS ACTIVE MONITORING FEE` a sair do
catálogo.

---

## E3 · O canal

**O que é.** Vender através de um distribuidor: catálogo autorizado por empresa e
por país, preço de transferência, margem protegida, e a economia dos dois lados.

**Regras:** BR-030 a BR-037.

**O que custou aprender.** Foi o epic mais caro, e a lição é de método. Deduzi que
R1–R4 era o preço do cliente final porque uma proposta directa o põe à frente do
hospital. Estava errado — é a lista de transferência — e a dedução produziu um
ecrã que dizia que o cliente pagava 65.574 € quando o parceiro nos paga esse
valor e revende por cerca de 100.883 €. O dono do P&L corrigiu-o em duas frases.

A segunda lição saiu da primeira: **uma margem assumida não verifica nada.**
Enquanto ninguém escrever o preço que o parceiro vai cobrar, a margem dele é a
assunção lida de volta, e um piso testado contra ela passa sempre.

**Aberto — e é a decisão de maior peso que resta:**

- **BR-031** — o que significam os 40% do Full VAR. Hoje são uma referência
  contra a margem medida, e não entram em cálculo nenhum.
- **H3.3 critério 3** — hoje **qualquer** utilizador de um distribuidor vê
  **todos** os números da empresa. Não há noção de "só os meus". Precisa de duas
  decisões: como se marca o CEO de um distribuidor, e se isto é ecrã ou RLS.

---

## E4 · Confiar nos números

**O que é.** O princípio que atravessa tudo: nunca mostrar um número que não se
sabe. E uma regra só para valorizar um negócio.

**Regras:** BR-060 a BR-062, BR-036.

**O que custou aprender.** Quatro maneiras diferentes de valorizar o mesmo
negócio, todas rotuladas em euros. E que um erro do Supabase **não chega por
rejeição** — a query resolve com `{ data: null, error }` — portanto o
`.catch(() => {})` que parecia o culpado quase nunca corria, e quem engolia era o
`data || []` com o erro por ler no mesmo objecto.

**Aberto:** nada. As 41 leituras silenciosas estão fechadas.

---

## E5 · Governo dos dados

**O que é.** As regras que protegem dinheiro, vivas na base de dados e não no
ecrã: transições de estado, quem lê custo, quem o escreve.

**Regras:** BR-050 a BR-058.

**O que custou aprender.** Que **o ecrã não é um controlo** — tudo o que uma
política permite, uma consola de browser consegue fazer. E que uma regra escrita
em dois sítios precisa de ser comparada automaticamente, senão diverge: o teste
lê os pares do próprio ficheiro de migração.

A lição mais útil foi de sequência. Fechar o SEC-01 (custo ilegível) abriu o
SEC-04 (escrevível por quem não o lê), que ao ser fechado revelou o SEC-05 (todas
as gravações escreviam custo zero), cuja correcção expôs o SEC-06 (uma gravação
de parceiro apagava o custo por apagar a linha). **Quatro defeitos em fila, e
nenhum era visível antes de o anterior estar fechado.**

**Aberto:** nada. Os cinco estão fechados e verificados contra a base de dados.

---

## E6 · Mobile e línguas

**O que é.** Usar isto num telemóvel, num hospital, na língua de quem o usa.

**Regras:** `DESIGN_SYSTEM.md` §7 — duas larguras, 44px, transbordo, grelhas,
`tabular-nums`.

**O que custou aprender.** Que uma substituição automática sobre layout tem de ser
lida uma a uma: sessenta grelhas estragadas numa passagem porque a condição
procurava `sm:` e `md:` e não `lg:`.

**Aberto, e são as duas pontas que restam do produto inteiro:**

- **H6.1 critério 6** — nada disto foi visto num telemóvel a sério. Está certo
  por medição, não por observação.
- **H6.2 critério 3** — cerca de 325 strings em inglês no código. As chaves estão
  completas; o código não.

---

## O que ficou de fora de propósito

Não há epic para **relatórios avançados**, **integração com o SAP em tempo real**,
nem **multi-tenant**. Estão no `PRD.md` §5 como não-objectivos, e não estão aqui
para não parecerem trabalho adiado.
