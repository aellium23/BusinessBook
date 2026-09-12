# Histórias de utilizador e critérios de aceitação

**Versão:** 2026-09-12.

Cada história diz **quem**, **o quê** e **porquê**. Cada critério é uma frase que
se pode verificar — no ecrã ou num teste — e onde já existe um teste, ele está
citado.

Um critério que não se pode verificar não é um critério: é uma opinião com
formatação. Onde não consegui escrever um verificável, digo-o.

**Estado:** ✅ feito e verificável · 🟡 feito, verificado só à mão · ⬜ por fazer.

---

## E1 · Cotar um negócio

### H1.1 — Cotar em segundos

> Como **comercial**, quero criar um negócio escolhendo cliente, volume e
> produtos, **para** ter um preço defensável sem abrir a folha de preços.

| | Critério | Estado |
|---|---|---|
| 1 | O preço de cada linha sai da lista regional no escalão que o volume atinge | ✅ `pricing.test.js` |
| 2 | Um preço em dólares é convertido para euros e a taxa é mostrada ao lado da região | ✅ `fx.test.js` |
| 3 | A taxa fica **guardada no negócio**; uma alteração cambial amanhã não reavalia o que foi cotado hoje | ✅ `dealValue.test.js` |
| 4 | Sem taxa configurada para uma moeda, o ecrã diz-o em vez de imprimir um valor em dólares com um símbolo de euro | 🟡 |
| 5 | Cada produto é preçado pelo seu próprio volume — exames para o Dose, radiologistas para o VR | ✅ `volumeUnits.test.js` |

### H1.2 — Não quotar abaixo do chão

> Como **dono do P&L**, quero que uma linha abaixo do chão de margem seja
> assinalada, **para** não descobrir a margem no fecho do mês.

| | Critério | Estado |
|---|---|---|
| 1 | Licença abaixo de 35% de margem aparece a vermelho | ✅ `margins.test.js` |
| 2 | Suporte abaixo de 60% (62,5% acima de 4k de custo) aparece a vermelho | ✅ `margins.test.js` |
| 3 | Um contrato de suporte nunca é cotado abaixo de 10.000 €/ano | ✅ `margins.test.js` |
| 4 | Margem é sobre o preço de venda, nunca markup sobre o custo — 35% de margem é 53,8% de markup | ✅ `marginUnits.test.js` |

### H1.3 — Custo desconhecido não é custo zero

> Como **comercial**, quero saber que uma linha não tem custo registado, **para**
> não apresentar uma margem que não existe.

| | Critério | Estado |
|---|---|---|
| 1 | Uma linha sem custo é assinalada e fica **fora** da soma do custo | ✅ `marginUnits.test.js` |
| 2 | Com uma linha por custear, a margem do negócio é um **traço**, com a contagem das que faltam | ✅ `marginUnits.test.js` |
| 3 | Gravar escreve **nulo** e nunca zero quando o custo é desconhecido | ✅ `writeGuards.test.js` |
| 4 | Uma linha com preço e sem nome de produto **não pode ser gravada** | 🟡 |

---

## E2 · Descontar

### H2.1 — Pedir um desconto com uma razão

> Como **comercial**, quero pedir um desconto com uma justificação, **para** que
> quem aprova leia a razão e não só a percentagem.

| | Critério | Estado |
|---|---|---|
| 1 | Um desconto sem justificação escrita é recusado, não guardado | 🟡 |
| 2 | Num produto nosso, a distância à lista decide quem assina: 10% ninguém, 20% o Country Manager, 30% o dono do P&L | ✅ `discountLadder.test.js` |
| 3 | Acima de 30% deixa de ser desconto e é um programa nomeado | ✅ `dealDiscounts.test.js` |
| 4 | Num produto comprado, o desconto sai do nosso custo e **não conta para a margem no ecrã** até o fornecedor responder | ✅ `discountRouting.test.js` |

### H2.2 — Responder a um pedido

> Como **aprovador de marca**, quero decidir num ecrã que me mostre o que está
> em jogo, **para** não ter de abrir o negócio para perceber o pedido.

| | Critério | Estado |
|---|---|---|
| 1 | Aprovar por menos do que foi pedido converte-se automaticamente em contraproposta | ✅ `discountRequests.test.js` |
| 2 | Uma contraproposta espera pela aceitação de quem pediu; só então o dinheiro se move | ✅ `approvalImpact.test.js` |
| 3 | Cada ronda é uma linha nova, e o histórico fica | ✅ `discountRequests.test.js` |
| 4 | Responder duas vezes ao mesmo pedido não desconta duas vezes | ✅ `applied_at`, verificado na base de dados |
| 5 | Onde falte metade da economia, o cartão **não** reporta uma margem contra um preço que não tem | 🟡 |

---

## E3 · O canal

### H3.1 — Cotar como parceiro

> Como **distribuidor**, quero cotar do meu catálogo ao meu preço, **para**
> responder a um hospital sem esperar pela Fujifilm.

| | Critério | Estado |
|---|---|---|
| 1 | Vejo apenas os produtos autorizados à minha empresa **e ao país do negócio** | ✅ `partnerCatalogue.test.js` |
| 2 | Um produto sem preço para a minha empresa é assinalado, não custeado a zero | ✅ `partnerCatalogue.test.js` |
| 3 | **Nunca vejo o custo nem a margem da Fujifilm**, nem no ecrã nem pela API | ✅ verificado em `information_schema.column_privileges` |
| 4 | A minha proposta abre na **taxa do meu acordo** (40% para um Full VAR) e o preço é meu para mudar | ✅ `partnerMargin.test.js` |
| 5 | Sem autorização nenhuma, sou informado disso em vez de ver um catálogo vazio | 🟡 |

### H3.2 — Ver a economia do canal

> Como **dono do P&L**, quero ver o que ganhamos num negócio de canal, **para**
> decidir um desconto sabendo o que ele me custa.

| | Critério | Estado |
|---|---|---|
| 1 | A nossa receita é o preço de transferência, sem segunda dedução | ✅ `partnerMargin.test.js` |
| 2 | Um desconto sobre a lista de transferência sai **inteiro** da nossa receita | ✅ `partnerMargin.test.js` |
| 3 | O preço ao cliente é **estimado à taxa do papel** e impresso a cinzento com `≈`, e nunca gravado | ✅ `partnerMargin.test.js` |
| 4 | Escrito o preço real, a margem do parceiro passa a ser **medida**, e os pisos 35/20/15 passam a ser verificados | ✅ `partnerMargin.test.js` |
| 5 | Enquanto for estimativa, nenhum piso dispara — uma assunção não pode ser violada | ✅ `partnerMargin.test.js` |

### H3.3 — Agir por duas empresas

> Como **CEO de um distribuidor com operação em dois países**, quero uma conta
> só, **para** não gerir duas palavras-passe.

| | Critério | Estado |
|---|---|---|
| 1 | Posso pertencer a várias empresas e trocar entre elas | ✅ `useCompanyScope` |
| 2 | Um negócio do Peru é valorizado pelas autorizações do Peru, mesmo com o filtro no Chile | ✅ `partnerCatalogue.test.js` |
| 3 | Vejo só o que é meu e o CEO vê a empresa toda | ⬜ **decidido a 12-09, por fazer** — vai para RLS. Falta decidir como se marca o CEO |

---

## E4 · Confiar nos números

### H4.1 — Um número que não se sabe não é mostrado

> Como **qualquer utilizador**, quero distinguir "é zero" de "não sabemos",
> **para** não reportar um número inventado.

| | Critério | Estado |
|---|---|---|
| 1 | Margem desconhecida é um traço, nunca `0%` | ✅ `marginUnits.test.js` |
| 2 | Uma conversão sobre uma fase vazia é desconhecida, não `0%` | ✅ `stageFunnel.test.js` |
| 3 | Uma leitura que falhou põe uma linha âmbar com o nome do que falta | ✅ `loadFailures.test.js` |
| 4 | A linha sai sozinha quando a leitura resultar | ✅ `loadFailures.test.js` |
| 5 | Um erro do Supabase é apanhado **na resposta** e não numa rejeição, porque uma query falhada resolve com `{ data: null, error }` | ✅ `loadFailures.test.js` |

### H4.2 — Um negócio vale o mesmo em todo o lado

> Como **dono do P&L**, quero que um negócio valha o mesmo no painel, na lista e
> no funil, **para** não ter de escolher em qual acreditar.

| | Critério | Estado |
|---|---|---|
| 1 | Uma regra só: soma dos meses, ou `value_total` onde não há meses, vezes a taxa guardada | ✅ `dealValue.test.js` |
| 2 | Num período, as colunas mensais são a única fonte — sem recurso ao total | ✅ `salesByClient.test.js` |
| 3 | Espelhos intercompany nunca contam | ✅ `salesByClient.test.js` |
| 4 | Margem agregada é ponderada, nunca a média das percentagens | ✅ `salesByClient.test.js` |

---

## E5 · Governo dos dados

### H5.1 — Um negócio só se move onde a máquina permite

> Como **dono do P&L**, quero que um negócio não possa saltar fases, **para** que
> o funil e a reconciliação com o SAP signifiquem alguma coisa.

| | Critério | Estado |
|---|---|---|
| 1 | As transições permitidas estão na base de dados e um trigger recusa o resto | ✅ verificado: 14 pares, 2 triggers |
| 2 | Uma chamada directa à API não move um Lead para Faturado | ✅ trigger |
| 3 | O admin é isento, para correcções e imports; o manager não | ✅ `is_admin_profile()` |
| 4 | As duas cópias da regra — browser e Postgres — são comparadas a cada `npm run test` | ✅ `writeGuards.test.js` |
| 5 | O mesmo para os contratos: 17 transições, um trigger | ✅ verificado: 17 e 1 |
| 6 | Nenhum estado é um beco sem saída para o perfil que o vê | ✅ `writeGuards.test.js` |

### H5.2 — Quem não vê custo não lhe toca

> Como **dono do P&L**, quero que o nosso custo seja inacessível a quem não tem
> de o ver, **na API e não só no ecrã**.

| | Critério | Estado |
|---|---|---|
| 1 | `cost_price` e `margin_pct` não são legíveis por um distribuidor, nem com a consola do browser | ✅ verificado em `information_schema` |
| 2 | Quem não os pode ler também não os pode escrever | ✅ trigger |
| 3 | Gravar um negócio **actualiza** as linhas e apaga só o que saiu — uma gravação de parceiro não destrói o nosso custo | ✅ `reconcileLines.test.js` |
| 4 | Admin, manager e os nossos comerciais vêem o custo; distribuidores, parceiros e *viewers* não | ✅ `sees_internal_economics()` nos três sítios |

---

## E6 · Mobile e acessibilidade

### H6.1 — Usar num telemóvel, num hospital

> Como **comercial em visita**, quero fazer isto no telemóvel, **para** não ter
> de voltar ao carro.

| | Critério | Estado |
|---|---|---|
| 1 | Tudo o que se toca tem pelo menos 44px | ✅ medido: 0 botões abaixo |
| 2 | Nenhuma largura fixa acima de 360px | ✅ medido: 0 |
| 3 | Grelhas de 4+ colunas empilham para 2 abaixo de `sm` | ✅ medido |
| 4 | Conteúdo mais largo do que o ecrã rola; nunca é cortado em silêncio | 🟡 dois casos fechados; a regra está no `DESIGN_SYSTEM.md` |
| 5 | Os modais são bottom-sheet com `dvh` e safe area, e o rodapé não é comido pela barra do browser | 🟡 |
| 6 | **Verificado num telemóvel a sério** | ⬜ **por fazer** — está certo por medição, não por observação |

### H6.2 — Ler na minha língua

> Como **utilizador espanhol ou português**, quero a aplicação na minha língua.

| | Critério | Estado |
|---|---|---|
| 1 | As três línguas têm as mesmas chaves, sem lacunas | ✅ medido: 1.499 em cada |
| 2 | O HelpGuide está nas três | ✅ |
| 3 | Nenhuma string em inglês no código | ⬜ **por fazer** — restam cerca de 325 |

---

## O que não consegui escrever como critério

Três coisas que importam e que não sei verificar sem uma pessoa:

1. **"O quick deal demora segundos."** É o propósito do ecrã e não tenho uma
   medida. Precisaria de cronometrar alguém a cotar um negócio real.
2. **"A margem é defensável."** Verificável é o chão; se o preço é o certo para
   ganhar aquele negócio, não.
3. **"O funil diz-me o que fazer a seguir."** Mostra o que está em cada fase. Se
   isso responde à pergunta que fazes ao abrir a aplicação de manhã, só tu sabes.
