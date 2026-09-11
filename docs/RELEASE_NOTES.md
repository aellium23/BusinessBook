# Notas de versão

Derivadas do histórico de commits. As entradas dizem o que mudou **para quem usa
o produto**, e onde houve um defeito dizem qual era — um registo que esconde o
que estava mal não serve para ninguém saber se foi afectado.

---

## 2026-09-11

### Funil de vendas Instax

O pipeline como cinco fotografias instantâneas, sobre a arte da própria casa.
Cada moldura carrega o seu valor, quantos negócios tem, quanto vale ponderada e
a conversão da fase anterior numa fita. Tocar numa abre os negócios dela.

Os totais consolidados numa tira de negativo de 35mm: pipeline aberto, forecast
ponderado, faturado e perdido, cada fotograma clicável. **É a vista com que o
painel abre.**

No telemóvel o mesmo rolo lê-se para baixo.

A conversão conta-se em negócios e não em dinheiro, para que um negócio grande
não embeleze um mês. Uma fase cuja anterior está vazia não mostra taxa nenhuma —
`0%` lê-se como um funil a falhar quando significa um funil vazio.

### Uma pessoa, vários distribuidores

Quem age por mais do que uma empresa tem um selector na barra de topo. Abre com
todas somadas e estreita quando se escolhe uma; todas as páginas o seguem.

Um negócio novo é arquivado na empresa de origem. Um negócio é sempre valorizado
pelo catálogo **da empresa dele** — abrir um do Peru com o filtro no Chile
valoriza-o como Peru.

### Notificações

O sino passou da página de Tarefas para a barra de topo. Clicar numa vai para o
sítio de que ela trata: a resposta a um desconto abre o cartão do negócio.

**Estava mal:** as notificações chegavam correctamente e ninguém as via. A conta
da TIMED tinha cinco por ler, a mais antiga de 2 de Junho. E clicar numa só a
marcava como lida.

### Descontos

Contrapor de volta passa a avisar quem fez a contraproposta. O estado do
desconto aparece no cartão nos quatro estados, não em dois.

**Estava mal:** responder a uma contraproposta falhava com um erro sobre uma
restrição da base de dados. A consulta filtrava por `deal_id` e não o
seleccionava, e a ronda seguinte era escrita sem negócio.

### Distribuidores

O painel diz o que está à espera de quem: contraproposta é a jogada deles,
pedido pendente é a nossa. Documentos anexáveis a partir do quick deal.

**Estava mal:** as Approvals estavam fechadas aos distribuidores, apesar de a
configuração lhes dar a página — podiam pedir desconto e não ler a resposta. E o
ecrã recusava-lhes negócios que a base de dados permitia editar.

### Números que estavam errados

- **Margem bruta gravada cem vezes maior** pelo quick deal. Corrigido no código;
  nenhum negócio ficou afectado.
- **Quatro formas diferentes de valorizar o mesmo negócio** entre dashboards. Um
  negócio em dólares com calendarização valia números diferentes conforme o
  ecrã, todos rotulados em euros. Passou a haver uma só.
- **Pipeline nos funis de produto e de comercial** passou da oportunidade
  inteira para a fatia do ano, alinhando com a regra e com os restantes ecrãs.
  *Isto altera números reportados.*
- O filtro de mês nos Deals não voltava à primeira página.
- O filtro de produto nos SLAs existia sem controlo no ecrã.
- O Budget mostrava uma página de zeros quando a carga falhava.

### Segurança

- Anexos: o bucket entregava todos os ficheiros a qualquer conta autenticada.
- Objectivos de venda: legíveis por todos, incluindo os individuais dos nossos.
- Pedidos de desconto: um parceiro lia os de toda a casa.
- Notificações: qualquer um podia marcar ou apagar as de outro.
- Linhas de negócio: a view entregava todas as linhas de todos os negócios.

**Continua aberto:** o custo por linha é legível na tabela base, e as transições
de fase não são impostas na base de dados. Ver `docs/BACKLOG.md`.

---

## 2026-09-10 e antes

Verificação SAP contra CRM por mês e por cliente · vendas por cliente com
período e ordenação · quick deal para parceiros com catálogo autorizado ·
contrapropostas que movem o dinheiro · margem protegida do parceiro · critérios
de desconto do quote builder · linter instalado.

O histórico completo está em `git log`, e as mensagens de commit explicam o que
estava errado antes de explicarem o que mudou.
