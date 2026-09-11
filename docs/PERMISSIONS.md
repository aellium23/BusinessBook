# Matriz de permissões — BusinessBook

**Estado:** derivado de `src/lib/pageAccess.js`, `src/lib/roles.js` e das
políticas RLS, em 2026-09-11.

Duas fontes decidem o que alguém vê, e têm de concordar:

- **O ecrã** — `pageAllowed()` para páginas, `roles.js` para dados sensíveis.
- **A base de dados** — políticas RLS por tabela, e `acts_for()` para o âmbito
  por empresa.

Quando discordam, **a base de dados é a autoridade**. Um ecrã mais permissivo é
uma falha de segurança; um ecrã mais restritivo é uma funcionalidade escondida
sem explicação, e foi o que aconteceu com as Approvals dos distribuidores.

---

## 1. Páginas por papel

| Página | admin | manager | member | distributor | partner | viewer | aprovador de marca |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| deals | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| clients | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| contacts | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| accounts | ✓ | ✓ | ✓ | — | — | — | — |
| whitespace | ✓ | ✓ | ✓ | — | — | — | — |
| network | ✓ | ✓ | ✓ | — | — | — | — |
| sla | ✓ | ✓ | ✓ | — | — | — | — |
| products | ✓ | ✓ | ✓ | — | — | — | — |
| quotations | ✓ | ✓ | ✓ | ✓ | — | — | — |
| tenders | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| tasks | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| history | ✓ | ✓ | ✓ | ✓ | — | ✓ | — |
| quotas | ✓ | ✓ | ✓ | ✓ | — | — | — |
| forecast | ✓ | ✓ | ✓ | — | — | — | — |
| budget | ✓ | ✓ | — | — | — | — | — |
| verification | ✓ | ✓ | — | — | — | — | — |
| approvals | ✓ | — | — | ✓ | — | — | ✓ |
| audit | ✓ | — | — | — | — | — | — |
| settings | ✓ | — | — | — | — | — | — |
| permissions | ✓ | — | — | — | — | — | — |

**A porta das Approvals é dupla.** Um aprovador abre uma fila de pedidos de
outros; um requerente abre as respostas aos seus. A primeira compra-se com
`approves_brands`, a segunda com a lista de páginas. Testar só a primeira
fechava a porta aos distribuidores — corrigido em `cd79f92`.

**Um aprovador de marca sem papel ordinário** tem essa porta e nenhuma outra.

Um `permission_set` associado ao perfil **substitui** a lista do papel.

---

## 2. Dados sensíveis

| Dado | Quem vê | Onde é imposto |
|---|---|---|
| Custo e margem de linha | admin, manager | View `deal_products_v` **e a tabela base ⚠** |
| Margem do negócio (`gm_pct`) | admin, manager, member | Só no ecrã (`canPrice`) |
| Preço de transferência do parceiro | admin, manager | `sees_internal_economics()` |
| Pedidos de desconto | quem pediu, a empresa do negócio, os nossos | RLS `discount_req read` |
| Objectivos de venda | os nossos, e a empresa a que pertencem | RLS `quotas read` |
| Notificações | só o destinatário | RLS `user_id = auth.uid()` |
| Anexos | quem vê o negócio-pai | RLS via `attachments` |

**⚠ Divergência conhecida.** `roles.js` diz que um `member` vê custo e margem; a
view mascara para quem não é admin ou manager. Resultado: um comercial nosso vê
a margem do negócio e não vê o custo da linha. Pode ser intencional — não está
decidido. Ver `docs/BACKLOG.md`, item SPEC-01.

**⚠ Furo aberto.** A tabela `deal_products` continua directamente legível com as
colunas de custo. A view mascara; a tabela não. Ver SEC-01.

---

## 3. Âmbito por empresa

Um parceiro vê e escreve nas empresas por que age — nem mais, nem menos.

```
company_members(profile_id, company_id)
         ↓
   acts_for(company_id)
         ↓
 deals · deal_products · accounts · quotas
 company_product_authorizations · deal_discount_requests
```

`profiles.company_id` é a **empresa de origem**: onde um negócio novo é
arquivado. Não é o que decide o que se vê.

**Uma empresa nula nunca corresponde a uma empresa nula.** Um perfil sem âmbito
não é um perfil com acesso a tudo. Esta armadilha já mordeu duas vezes.

---

## 4. Quem pode escrever o quê

| Acção | Regra |
|---|---|
| Editar um negócio | admin sempre · parceiro se agir pela empresa dele · os nossos conforme `editOwn` |
| Responder a um desconto | admin, manager, ou aprovador da marca — via `respond_discount_request` |
| Aceitar uma contraproposta | só quem pediu — via `accept_counter_offer` |
| Pedir de novo | só quem pediu — via `ask_discount_again` |
| Importar vendas SAP | `sees_governance()` (admin, manager) |
| Definir objectivos | admin |
| Atribuir empresas a uma pessoa | `sees_governance()` |
| Apagar um anexo | quem o carregou, ou admin |

Um parceiro **nunca escreve directamente** em nada que mova dinheiro nosso. Tudo
isso passa por funções `SECURITY DEFINER`, que fazem a sua própria autorização.

---

## 5. Como testar esta matriz

Uma linha só está validada quando se testou pelos **dois** lados:

1. **Ecrã** — o menu mostra? O botão aparece?
2. **Base de dados** — a mesma acção pela consola do browser é recusada?

O segundo é o que conta. Um ecrã que esconde um botão não é um controlo: é uma
sugestão.

```js
// Como se testa um furo, com a sessão do perfil em causa aberta:
const { data, error } = await supabase.from('<tabela>').select('*')
console.log(data?.length, error?.message)
```
