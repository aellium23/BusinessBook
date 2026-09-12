# BusinessBook — o que é e para quem

**Versão:** 2026-09-12 · **Dono:** Élio Santos, Medical IT Director, Fujifilm Iberia.

Este documento é descritivo do produto **como ele é hoje**, depois de duas
sessões de correcção e uma auditoria de UX. Não descreve um plano; descreve o que
está a correr, e diz explicitamente o que ficou de fora.

---

## 1. O problema

A Fujifilm Iberia vende software médico por duas unidades — **VGT** (Portugal) e
**ECT** (Espanha) — e através de distribuidores fora da Ibéria, sobretudo na
América Latina. O dono do P&L precisa de saber, a qualquer momento:

- **quanto vale o pipeline** e quanto dele é crível
- **quanto já foi faturado** contra o orçamento do ano fiscal (Abril a Março)
- **qual é a margem**, por negócio, por produto e por cliente
- **o que está preso** à espera de um desconto que ninguém pediu

Antes disto, essas respostas viviam em folhas de Excel: uma pricelist, um
orçamento, um mapa de contratos, e o histórico do SAP. Cada uma com uma versão
diferente da verdade, e nenhuma delas capaz de dizer se um número era real ou
apenas ainda não preenchido.

## 2. Quem usa

| Perfil | Quem é | O que faz aqui |
|---|---|---|
| **admin** | O dono do P&L | Tudo. Orçamento, permissões, preços, correcções de dados. |
| **manager** | Direcção comercial de uma BU | Tudo menos permissões e definições. Vê a sua BU. |
| **member** | Comercial nosso | Cria e cota negócios, vê custo e margem, edita os seus. |
| **distributor** | TIMED Chile, TIMED Peru, e outros | Cota do catálogo autorizado à empresa deles, no país deles. **Nunca vê o nosso custo.** |
| **partner** · **viewer** | Leitura, âmbito limitado | Consultam; não preçam. |

Uma pessoa pode agir por **mais do que uma empresa** — o CEO da TIMED Chile é
também dirigente da TIMED Peru — sem ter duas contas. A pertença vive em
`company_members`.

## 3. O que o produto faz

### 3.1 Cotar

O **quick deal** é a maneira de criar um negócio, e também de o reabrir. Escolhe
o cliente, escreve o volume anual de exames, toca nos produtos: o preço sai da
lista regional no escalão que o volume atinge, convertido para euros à taxa que
fica **guardada no negócio**.

Cada linha é preçada em duas metades — o que se paga uma vez e o que se paga
todos os anos do contrato — porque o chão de margem é diferente: 35% na licença,
60% no suporte, e nunca menos de 10.000 € por ano num contrato de suporte, que
consome um engenheiro independentemente do que fatura.

Os **serviços de implementação** são estimados em dias-homem, que é a única coisa
que um comercial consegue estimar, e custam o valor-dia da empresa.

### 3.2 Descontar

Um desconto vai por um de dois caminhos, e é o fornecedor que decide qual:

- **No que nós fazemos**, sai do preço ao cliente, e a distância à lista regional
  decide quem assina: ninguém até 10%, o Country Manager até 20%, o dono do P&L
  até 30%. Acima disso deixa de ser desconto e passa a programa nomeado.
- **No que nós compramos**, sai do nosso custo — e só depois de o fornecedor
  dizer que sim. Até lá não conta para a margem no ecrã.

Um parceiro pede-nos a nós, pela mesma máquina.

### 3.3 Prever e reportar

O funil, os contratos recorrentes, o orçamento por ciclo (BUD, EST1, EST2, ACT) e
a reconciliação com o SAP. O ano fiscal é de Abril a Março.

### 3.4 O canal

Um negócio vendido através de um parceiro tem duas economias. **R1–R4 é o preço
de transferência** — é o que o distribuidor nos paga, e é também o que uma
subsidiária Fujifilm paga. O que o hospital paga é decisão do parceiro, e este
produto **não o sabe** a menos que alguém lho diga.

## 4. Os princípios

Cinco, e são a razão de metade do trabalho de 11 e 12 de Setembro.

**Nunca mostrar um número que não se sabe.** Margem desconhecida é um traço, não
`0%`. Custo desconhecido assinala-se. Uma taxa sobre nada é desconhecida, não
zero. Uma leitura que falhou diz-se, em vez de uma página de zeros.

**Uma estimativa nunca entra numa coluna com nome de facto.** O preço que o
parceiro vai cobrar é estimado no ecrã e fica a nulo na base de dados até alguém
o escrever.

**O ecrã não é um controlo.** Tudo o que uma política permite, uma consola de
browser consegue fazer. As regras que protegem dinheiro vivem na base de dados.

**Uma regra escrita em dois sítios é comparada automaticamente.** As máquinas de
estados existem no browser e no Postgres porque têm de existir; o `npm run test`
falha se as duas cópias divergirem.

**Uma verificação que não pode falhar lê-se como uma que passou.** Os pisos de
margem protegida só são avaliados sobre um preço que nos foi dito, porque uma
margem assumida é igual à assunção.

## 5. O que este produto deliberadamente não é

- **Não é um ERP.** Não fatura, não gere stock, não faz contabilidade. O SAP faz
  isso, e este produto reconcilia-se com ele.
- **Não é multi-tenant.** É uma instância da Fujifilm Iberia. O `app_settings`
  existe mas não separa inquilinos.
- **Não substitui o Salesforce da HCUS nem o processo da Medsky.** Regista que um
  pedido de desconto tem de ser aberto lá, e lembra.
- **Não conhece o preço ao cliente final de um negócio de canal**, a menos que
  alguém o escreva. É do parceiro.

## 6. Restrições

- **React 18 + Vite 5 + Tailwind 3 + Supabase.** Sem backend próprio: o cliente
  fala com o Postgres via PostgREST, o que significa que **o contrato é o schema
  mais as políticas**.
- **Mobile-first.** Duas larguras de página, alvos de toque de 44px, bottom-sheet
  nos modais. Quem usa isto anda num hospital com um telemóvel na mão.
- **Três línguas** — inglês, espanhol e português europeu — com 1.499 chaves em
  cada. Cerca de 325 strings ainda por extrair do código.
- **Sem migration runner.** Cada SQL é corrido à mão no editor do Supabase, e por
  isso cada ficheiro é seguro a repetir e acaba com uma verificação.

## 7. Como se sabe que está bom

- **686 testes** e o linter, que corre primeiro porque é o único que apanha um
  nome usado antes de existir.
- **A base de dados verifica-se a si própria**: cada migração acaba com um
  `select` cujo resultado esperado está escrito no comentário acima dele.
- **Os documentos em `docs/`** dizem de onde vem a prova de cada regra: ✅
  confirmado pelo dono do P&L, 📐 facto do código, ⚠ inferido e por confirmar.

## 8. O que está por fazer

Em `docs/BACKLOG.md`, com estado. À data: **21 regras por confirmar**
(`BUSINESS_RULES.md` §8), **325 strings** por traduzir, e a decisão sobre se um
utilizador deve ver só a sua carteira ou a da empresa inteira — que hoje é a
empresa inteira, para toda a gente.
