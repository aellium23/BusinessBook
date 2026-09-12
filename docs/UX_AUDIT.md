# Auditoria de UX/UI — BusinessBook

**Data:** 2026-09-12 · **Âmbito:** 28 páginas e 51 componentes, todos abertos.
**Estado:** nada foi aplicado. Isto é uma lista de achados para decidires.

Cada achado tem **onde está**, **o que acontece** e **o que custa corrigir**. Os
números vêm de contar o código, não de olhar para ele — onde digo "quinze
botões" foram quinze botões medidos.

Severidade: **P1** parte alguma coisa · **P2** confunde quem usa · **P3** é
inconsistência que se acumula.

---

## Sumário

| | Achado | Sev |
|---|---|---|
| UX-A | O selector do Dashboard não representa o que está no ecrã | **P1** |
| UX-B | Duas tabelas saem do ecrã no telemóvel sem poderem ser roladas | **P1** |
| UX-C | O `main` esconde o que transborda em vez de o deixar rolar | **P1** |
| UX-D | Cada página tem uma largura diferente — o conteúdo salta ao navegar | **P2** |
| UX-E | Quinze botões abaixo do alvo de toque de 44px | **P2** |
| UX-F | Vinte e quatro grelhas de 3+ colunas que não empilham no telemóvel | **P2** |
| UX-G | O subtítulo do Dashboard descreve uma vista que pode não estar aberta | **P2** |
| UX-H | O filtro de BU desaparece para quem não é admin, sem dizer o que está a ver | **P2** |
| UX-I | Três perfis, três desenhos diferentes para a mesma decisão | **P2** |
| UX-J | 280 números formatados, 31 com `tabular-nums` — as colunas dançam | **P3** |

---

## UX-A · P1 · O selector do Dashboard não representa o que está no ecrã

**Onde:** `src/pages/DashboardIndex.jsx`, linhas 176–215.

**O que acontece.** Há dois grupos de botões: um par grande (Resumo · Detalhe) e
uma fila de pílulas (Produtos · Comerciais · Clientes · Funil). **Os seis
escrevem na mesma variável `view`.**

Desde que o funil passou a ser a vista de abertura, quem abre a aplicação vê o
par grande com **as duas opções apagadas** e uma pílula pequena acesa lá em
baixo. O elemento mais proeminente do ecrã não diz o que estás a ver.

**Correcção, duas opções:**

1. Um só grupo com seis opções e um estado — simples, e perde a hierarquia.
2. O par grande passa a três (Funil · Resumo · Detalhe) e as pílulas ficam só
   para os desdobramentos, que são outra pergunta. **É a que recomendo.**

**Custo:** meia hora. Nenhum risco de dados.

---

## UX-B · P1 · Duas tabelas saem do ecrã e não podem ser roladas

**Onde:** `src/pages/AuditLog.jsx:51` e `src/pages/AcceptancePage.jsx:124`.

**O que acontece.** São `<table className="w-full">` sem nenhum contentor com
`overflow-x-auto` à volta. Das quinze tabelas da aplicação, treze têm-no; estas
duas não. No telemóvel as colunas da direita ficam cortadas **e não há maneira
de lá chegar** — ver também o UX-C, que é o que as corta em silêncio.

**Correcção:** um `<div className="overflow-x-auto">` à volta de cada uma.
**Custo:** dois minutos.

---

## UX-C · P1 · O `main` esconde o que transborda em vez de o deixar rolar

**Onde:** `src/components/Layout.jsx:197`.

```jsx
<main className="flex-1 overflow-y-auto overflow-x-hidden pb-24 sm:pb-6 …">
```

**O que acontece.** `overflow-x-hidden` **corta** o que for mais largo do que o
ecrã, em vez de o deixar rolar. É o que torna o UX-B invisível: a tabela não
rebenta o layout — desaparece, e nada no ecrã diz que há mais à direita.

É uma defesa contra o scroll horizontal acidental, e nisso funciona. Mas trata
uma tabela larga de propósito e um `div` mal medido exactamente da mesma maneira,
e uma delas precisa de ser vista.

**Correcção:** manter o `overflow-x-hidden` no `main` e garantir que **todo** o
conteúdo genuinamente largo — tabelas, kanban, gráficos — leva o seu próprio
`overflow-x-auto`. Corrigir o UX-B fecha os dois casos conhecidos; o que fica é a
regra, escrita no `DESIGN_SYSTEM.md`, para não voltar.

**Custo:** o do UX-B, mais um parágrafo de documentação.

---

## UX-D · P2 · Cada página tem uma largura diferente

**Onde:** todas. Medido, uma por uma:

| Largura | Páginas |
|---|---|
| `max-w-lg` (512px) | MyAccount, Quotas |
| `max-w-2xl` (672px) | Approvals, Settings, Tasks |
| `max-w-3xl` (768px) | AuditLog, Budget, History, Permissions, Tenders |
| `max-w-4xl` (896px) | Contacts, Deals |
| `max-w-5xl` (1024px) | DashboardIndex, Verification |
| `max-w-6xl` (1152px) | WhiteSpace |
| `max-w-full` | Forecast |

E o espaçamento acompanha: `p-3`, `p-4`, `p-6`, `p-4 sm:p-6`.

**O que acontece.** Num ecrã grande, ir dos Negócios (896px) para o Orçamento
(768px) para o WhiteSpace (1152px) faz o conteúdo **saltar de largura a cada
navegação**. No telemóvel não se nota — é tudo largura total — o que explica
como sobreviveu.

**Correcção.** Duas larguras, não sete: uma para páginas de leitura densa
(tabelas, orçamento, histórico) e uma para o resto. E um `p-4 sm:p-6` único.
**A decisão é tua:** quais são as duas.

**Custo:** uma linha por página, 28 páginas. Meia hora, e é a mudança com mais
impacto visual por minuto gasto de toda esta lista.

---

## UX-E · P2 · Quinze botões abaixo do alvo de toque

**Onde:** medidos, 105 botões no total; 15 abaixo de 44px de altura e sem usar a
classe `.btn`.

| Ficheiro | Quantos |
|---|---|
| `pages/Quotas.jsx` | 3 |
| `pages/Accounts.jsx` | 2 |
| `CompanySwitcher`, `RolesTab`, `EST1Builder`, `ForecastCalendar`, `SalesByClient`, `InstaxFunnel`, `DashboardSummary`, `Products`, e mais | 1 cada |

**O que acontece.** O sistema de design está certo: `.btn`, `.input` e `.select`
têm todos `min-height: 44px`, e o `tailwind.config.js` tem `min-h-tap`. O
problema são os botões escritos à mão com Tailwind cru — as pílulas de filtro,
sobretudo `px-2.5 py-1`, que dão cerca de **26px**. Num telemóvel são um alvo
que se falha.

**Correcção:** `min-h-tap` nesses quinze, ou passá-los a `.btn-sm`, que já
respeita os 44px. **Custo:** quinze linhas.

---

## UX-F · P2 · Vinte e quatro grelhas que não empilham no telemóvel

**Onde:** 24 ocorrências de `grid-cols-3` a `grid-cols-6` sem qualquer
`sm:`/`md:`. As piores:

- `deal/RevenueRecognition.jsx:102` — **seis** colunas
- `pages/Budget.jsx:791` e `804` — **seis** colunas, duas vezes
- `forecast/ForecastCalendar.jsx:146` e `DistributorDashboard.jsx:237` — quatro
- `pages/Deals.jsx:647` — quatro
- e dezassete de três colunas

**O que acontece.** Num ecrã de 360px, seis colunas dão 60px cada. O número cabe;
a etiqueta por cima dele não, e parte em duas ou três linhas ou fica cortada.

Nem todas estão erradas — três colunas de números curtos funcionam. **Seis não
funcionam nunca.** O critério que proponho: 2 colunas até `sm`, o número
desejado a partir daí; e onde forem seis, duas linhas de três.

**Custo:** 24 linhas, mas cada uma precisa de ser vista no telemóvel — não é uma
substituição automática.

---

## UX-G · P2 · O subtítulo descreve uma vista que pode não estar aberta

**Onde:** `DashboardIndex.jsx:158`.

```js
{view === 'summary' ? 'At-a-glance performance…' : 'Detailed monthly breakdown…'}
```

Um `if/else` para **seis** estados. Nas vistas Funil, Produtos, Comerciais e
Clientes lê-se *"Detailed monthly and year-to-date breakdown"*, que descreve
outra coisa.

**Correcção:** um subtítulo por vista, ou nenhum. **Custo:** dez minutos.

---

## UX-H · P2 · O filtro de BU desaparece sem dizer o que estás a ver

**Onde:** `DashboardIndex.jsx:163`, `{isAdmin && (…)}`.

**O que acontece.** O selector VGT/ECT/All só existe para admins. Um manager de
VGT vê o título e nada à direita — e o ecrã nunca lhe diz que está a ver **só**
VGT. Os números são verdadeiros e a pergunta "isto é tudo?" fica sem resposta.

**Correcção:** para quem não é admin, uma etiqueta fixa com a BU no lugar do
selector. **Custo:** três linhas. É a correcção mais barata da lista com
consequência real na confiança nos números.

---

## UX-I · P2 · Três perfis, três desenhos para a mesma decisão

**Onde:** `DashboardIndex.jsx` — três ramos.

| Perfil | Selector |
|---|---|
| Admin / manager | par grande + fila de pílulas |
| Distribuidor | duas pílulas |
| Comercial | duas pílulas *(acrescentadas por mim ontem)* |

**O que acontece.** A mesma decisão — que vista quero — tem três aparências. E a
terceira fui eu que a fiz assim ontem, copiando a do distribuidor, que por sua
vez não segue a do admin. **É a auditoria a apanhar-me a mim.**

**Correcção:** um componente de selector, usado pelos três, com as opções que
cada perfil tem direito. **Custo:** duas horas, e resolve o UX-A ao mesmo tempo.

---

## UX-J · P3 · As colunas de números dançam

**Onde:** `formatK()` é chamado 280 vezes; `tabular-nums` aparece 31.

**O que acontece.** Sem `tabular-nums` os algarismos têm larguras diferentes, e
uma coluna de valores fica com as unidades desalinhadas de linha para linha. Numa
tabela de P&L ou num funil isso custa a leitura — é a diferença entre varrer uma
coluna com o olho e ter de a ler número a número.

**Correcção:** `tabular-nums` em todo o lado onde há uma coluna de números.
**Custo:** uma passagem, mas é preciso distinguir uma coluna de um número solto.

---

## O que NÃO está errado, e vale a pena dizer

Uma auditoria que só encontra defeitos não está a olhar com atenção.

- **O sistema de design está certo na base.** `.btn`, `.input` e `.select` têm
  todos 44px de altura mínima; há `min-h-tap` e `min-w-tap` configurados; o
  `text-micro` (10px) e o `text-tiny` (11px) estão definidos com propósito.
- **O `Modal` é bom trabalho.** Bottom-sheet no telemóvel com pega de arrasto,
  `92dvh` em vez de `vh` (que é o que evita a barra do Safari a comer o botão),
  `env(safe-area-inset-bottom)` no rodapé, cabeçalho e rodapé fora do scroll.
- **O `Layout` esconde a barra lateral no telemóvel** e dá `pb-24` ao conteúdo
  para a navegação inferior não tapar nada.
- **Zero larguras fixas acima de 360px.** Não há um único `min-w-[400px]` a
  rebentar o telemóvel — o que é raro, e é a razão pela qual os problemas de
  responsividade desta lista são todos de grelhas e não de layout.
- **Os gráficos usam `ResponsiveContainer`** nas 31 ocorrências, com altura fixa
  e largura fluida, que é a maneira certa.

---

## Ordem que proponho

1. **UX-B e UX-C** — dois minutos, e há conteúdo a ser cortado em silêncio.
2. **UX-H** — três linhas, e é confiança nos números.
3. **UX-D** — a largura das páginas. Precisa de uma decisão tua: quais as duas.
4. **UX-A + UX-I** — o selector, feito uma vez para os três perfis.
5. **UX-E e UX-F** — os alvos de toque e as grelhas, com o telemóvel na mão.
6. **UX-G e UX-J** — o polimento.

A **UX-D** é a única que precisa de ti antes de eu poder avançar. As outras posso
fazer com o critério acima, se concordares com ele.
