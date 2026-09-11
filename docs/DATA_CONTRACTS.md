# Contratos de dados — BusinessBook

**Estado:** derivado do schema e das políticas RLS, em 2026-09-11.

Não há API própria neste produto. O cliente fala directamente com o Postgres
através do PostgREST, o que significa que **o contrato é o schema mais as
políticas** — não há camada intermédia onde impor regras. Tudo o que uma
política permite, uma consola de browser consegue fazer.

Essa é a razão pela qual este documento existe: num produto com backend próprio,
o contrato seria um ficheiro OpenAPI. Aqui é isto.

---

## 1. Unidades, que o nome das colunas não diz

Esta secção vem primeiro porque a confusão entre estas três custou um erro de
100× em Setembro.

| Coluna | Unidade | Exemplo |
|---|---|---|
| `deals.gm_pct` | **fracção** | `0.35` = 35% |
| `deals.discount_requested` · `discount_approved` | percentagem | `20.00` = 20% |
| `deal_products.margin_pct` | **markup sobre o custo**, percentagem | `53.8` = 53,8% |
| `deal_products.discount_pct` | percentagem | `10.00` = 10% |
| `deal_channel.partner_margin_pct` | percentagem | `35.00` = 35% |
| `companies.channel_role` | enumerado, null = por definir | `full_var` |
| `pricing_regions.default_channel_role` | enumerado, null = por definir | `full_var` |
| `deal_discount_requests.requested_pct` · `approved_pct` | percentagem | `25.00` = 25% |
| `deals.exchange_rate` | multiplicador para euros | `0.861` USD→EUR |
| `deals.apr`…`mar` | euros, na moeda do negócio | numérico |

**O Supabase devolve numéricos como strings.** Toda a leitura tem de passar por
`Number()`. Somar sem coagir concatena.

---

## 2. Entidades e quem lhes toca

| Tabela | Lê | Escreve |
|---|---|---|
| `deals` | admin · a sua BU · a sua empresa | admin · a sua BU · a sua empresa |
| `deal_products` | igual, via o negócio-pai, **sem as colunas de custo** | igual |
| `deal_products_v` | igual, sem custo nenhum | — *(view, security_invoker)* |
| `deal_products_cost` | admin · manager | — *(view, guarda no `where`)* |
| `deal_channel` | `sees_internal_economics()` | os nossos |
| `deal_discount_requests` | quem pediu · a empresa · os nossos | insert do próprio; resposta por função |
| `deal_quote` | quem vê o negócio | quem edita o negócio |
| `accounts` | `acts_for(company_id)` · os nossos | igual |
| `company_product_authorizations` | `acts_for()` · os nossos | admin |
| `company_members` | o próprio · `sees_governance()` | `sees_governance()` |
| `quotas` | `acts_for()` · os nossos | admin |
| `notifications` | só o destinatário | insert por qualquer activo ⚠ · update/delete só do próprio |
| `attachments` | quem vê o negócio-pai | quem carregou · admin apaga |
| `sap_sales` · `sap_client_aliases` | `sees_internal_economics()` | `sees_governance()` |
| `budget` | os nossos | admin |
| `profiles` | o próprio · admin | admin |

---

## 3. Funções — o que um parceiro não pode escrever directamente

Um parceiro nunca escreve no que move dinheiro nosso. Passa por funções
`SECURITY DEFINER`, que fazem a sua própria autorização:

| Função | Quem chama | O que faz |
|---|---|---|
| `respond_discount_request(id, status, pct, note)` | admin · manager · aprovador da marca | Responde; aplica o alívio ao preço de transferência; notifica |
| `accept_counter_offer(id)` | só quem pediu | Aceita; move o dinheiro; notifica o aprovador |
| `ask_discount_again(id, pct, note)` | só quem pediu | Nova ronda; transporta o valor em risco; notifica |
| `acts_for(company_id)` | qualquer | Se o chamador age por aquela empresa |
| `sees_internal_economics()` | qualquer | Se vê a nossa economia |
| `sees_governance()` | qualquer | Se é admin ou manager |

**`applied_at` impede dupla aplicação.** Responder duas vezes não desconta duas
vezes.

---

## 4. Views, e a armadilha que já mordeu seis vezes

**Uma view criada sem `security_invoker` corre como o seu DONO.** As políticas
das tabelas por baixo são avaliadas como o dono, não como quem chama — a
segurança ao nível da linha deixa de se aplicar, e `grant select to
authenticated` entrega a tabela inteira a quem tiver palavra-passe.

Isso é usado **de propósito** em alguns sítios, e aí a view carrega a sua
própria verificação de perfil na cláusula `where`. Em seis views não carregava:
cinco corrigidas em Setembro, `deal_products_v` a 11-09.

**Regra para views novas:**

- A view filtra linhas? → `security_invoker = true`.
- A view lê uma coluna que o chamador não tem? → sem invoker, **e com uma
  verificação de perfil no `where`**. Sem excepção.

---

## 5. Convenções

**Nunca um número que não se sabe.** Custo desconhecido assinala-se. Margem
desconhecida é um traço. Uma taxa sobre nada é desconhecida, não zero.

**Uma coluna por que se filtra é uma coluna que se selecciona.** Filtrar por
`deal_id` sem o seleccionar devolve linhas com `deal_id: undefined`, e a linha
seguinte escreve nulo numa coluna obrigatória. Já aconteceu.

**A taxa é um instantâneo.** Guardada no negócio, nunca a de hoje.

---

## 6. Migrações

Ficheiros `supabase_migration_AAAAMMDD_nome.sql` na raiz. Convenções:

- Começam por um comentário que explica **o que estava errado**, não o que fazem.
- `drop ... if exists` antes de recriar.
- `DROP FUNCTION IF EXISTS` antes de recriar com assinatura diferente.
- Seguras a repetir.
- Terminam com um `select` de verificação, e o comentário diz o que esperar.

**Atenção:** o SQL Editor do Supabase corre como superutilizador e **ignora as
políticas RLS**. Um `select` de verificação devolve tudo, e isso não prova nada
sobre o que um parceiro vê. `auth.uid()` é `null` ali, portanto máscaras de
coluna baseadas no perfil devolvem sempre o valor mascarado.
