# Notas de versão

Derivadas do histórico de commits. As entradas dizem o que mudou **para quem usa
o produto**, e onde houve um defeito dizem qual era — um registo que esconde o
que estava mal não serve para ninguém saber se foi afectado.

---

## 2026-09-12

### O cliente repetido avisa-se antes de nascer

Escrever o nome do cliente em vez de o escolher da lista é como a tabela ficou
com o Hospital Ramón y Cajal em duas linhas, a Telefónica em duas e 1,14 M€ do
Catsalut separados por um S maiúsculo. Enquanto se escreve, o campo compara com
os clientes que já existem e diz o que encontrou — o nome idêntico com outra
grafia, um nome cortado por uma importação, ou uma gralha de uma letra. Um toque
aceita a sugestão; no formulário completo aceitar **liga a conta**, que é a
diferença entre não criar um duplicado e escrevê-lo melhor.

Sugere e nunca corrige: há hospitais genuinamente parecidos — quatro Unidades
Locais de Saúde diferentes estão na tabela. E cala-se onde não sabe: `Remagna` é
o princípio de sete clínicas diferentes e não sugere nenhuma, porque isso trocava
um duplicado por um negócio arquivado no sítio errado.

### Vinte clientes duplicados juntados

*Isto altera números reportados por cliente, e para melhor.* 33 negócios e 1
contrato passaram para o nome certo, e o Ramón y Cajal deixa de ter 713 mil numa
linha e 119 mil noutra.

O sobrevivente é a grafia melhor escrita, não a mais frequente: minúsculas antes
de maiúsculas, com acentos antes de sem acentos, sem sufixo societário antes de
com sufixo. Escolher por número de registos deixava ganhar a grafia da
importação — `HOSPITAL RAMON Y CAJAL` em vez de Hospital Ramón y Cajal — o que
resolvia o total e estragava o nome em todos os relatórios a partir daí.

O antes e o depois de cada linha ficaram em `client_dedupe_backup_20260912`.

### A Colômbia passou a existir

*Isto altera números reportados por país e por região.* Dezassete clientes
colombianos estavam gravados como Guatemala. A Colômbia passa de **um** cliente
e 5.073 € para **dezoito** clientes e 148.600 €, e a Guatemala fica com três
negócios — os dois Disgua e o Villa Nueva — em vez de dezanove.

O país existia, portanto, e era isso que o tornava difícil de ver: um mercado com
uma linha lê-se como um mercado pequeno, não como um relatório partido.

Não foi um engano de quem escreveu. Foi o valor por omissão de uma importação, o
mesmo que tinha posto o Popayán, o Hospital Universitario Clínica San Rafael e
os dois Steward no país errado. Um campo que nunca foi preenchido lê-se igual a
um campo preenchido com cuidado.

### O estado da instalação estava escrito no nome do cliente

`Departamento de Radiologia S.A. Clinica SOMA desintalado`. `HOSPITAL NACIONAL
ESPECIALIZADO DE VILLA NUEVA desativado`. `FUNDACION HOSPITAL SAN PEDRO( FHSP no
ISS???)` — uma pergunta por responder, guardada no campo do cliente.

É diferente do produto no nome: um produto tem uma coluna para onde ir. Um
"desinstalado" não tem nenhuma, e limpar o nome sem mais apagava a única
indicação de que aquele cliente já não tem o sistema. Passou para o início da
descrição do negócio, que é texto livre e não se filtra — resolve não perder,
não resolve procurar.

**Continua no nome, de propósito:** o `Carrera` do Instituto de Ortopedia
Infantil Roosevelt. Provavelmente o princípio de uma morada; provavelmente não é
razão para apagar.

### A proposta de um parceiro abre na taxa do acordo dele

Um Full VAR abre a **40%** de margem, que é o que o acordo lhe dá, em vez dos 35%
do piso protegido. A estimativa do preço ao cliente no nosso painel usa o mesmo
número — um número, dois ecrãs.

Os 35% voltam a ser o que sempre foram: o piso que um desconto não deve romper,
e não o ponto de partida. No negócio `test chile`, a estimativa passa de
≈100.883 € para ≈109.290 €.

*Isto fecha a última regra que estava por confirmar.*

### O funil é a porta de entrada, para toda a gente

Abre sempre que a aplicação abre — admin, comercial ou parceiro. Já era o defeito
para os admins, mas só até clicarem noutra vista uma vez: a escolha ia para o
`localStorage` e ficava lá para sempre. Um defeito que sobrevive a um clique não
é um defeito, é a primeira coisa que se viu.

A escolha passa a durar a visita, não a vida. Mudar de vista e ir aos Negócios e
voltar mantém-te onde estavas; abrir a aplicação amanhã leva-te ao funil.

**Os comerciais passam a ter acesso ao funil**, que era o único perfil que não
lhe chegava — precisamente quem vive no pipeline o dia inteiro. Ganham as duas
vistas com um selector, funil à frente.

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
