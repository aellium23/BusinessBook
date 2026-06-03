import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { HelpCircle, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'

// ── Help content per page — trilingual (en, es, pt) ────────────────────────
const HELP = {
  '/': {
    en: {
      title: 'Dashboard',
      description: 'Your central command center with five views showing pipeline health, revenue, and analysis by product, sales rep, and client.',
      features: [
        'Five views via the top tabs: Summary, Classic, Products, Reps, Clients.',
        'Summary: gauges comparing actuals vs budget with a colour legend (green/amber/red) and Actuals / Budget labels beneath each gauge. Forecast is marked with a blue diamond.',
        'All currency values are prefixed with the euro symbol (e.g. €500K, €1.2M).',
        'Classic: monthly charts + funnel analytics restructured into KPI Cards, Sales Funnel with conversion rates between stages, Attention Required alerts, and Analysis.',
        'Sales Funnel shows stage-to-stage conversion percentages (e.g. Lead to Pipeline: 65%).',
        'Products: sales funnel by product / category / brand.',
        'Reps: funnel per sales rep with weighted forecast.',
        'Clients: top clients ranked by region.',
        'In Products/Reps/Clients, click any row to jump to its filtered deal cards.',
      ],
      steps: [
        '1. Select the BU filter (VGT / ECT / All) to scope all views.',
        '2. Summary — gauges of actuals vs budget (adjusts for elapsed months). The colour legend above explains green/amber/red thresholds.',
        '3. Classic — detailed monthly bar charts and funnel analytics with conversion rates between stages.',
        '4. Products — pipeline/backlog/invoiced per product; toggle by product/category/brand.',
        '5. Reps — pipeline/backlog/invoiced + weighted forecast per commercial.',
        '6. Clients — top clients per region; use the region tabs to switch.',
        '7. Click any product, rep, or client row to open its deals.',
      ],
      shortcuts: [
        'Click a funnel row → opens Deals pre-filtered for that item.',
      ],
      mistakes: [
        'Forgetting to select a BU filter — you may be looking at consolidated data instead of your unit.',
        'Comparing full-year budget against YTD actuals — the Summary view adjusts for elapsed months automatically.',
      ],
      seeAlso: [
        { label: 'Deals — manage the pipeline that feeds these metrics', path: '/deals' },
        { label: 'Budget — set and adjust the targets shown here', path: '/budget' },
        { label: 'Quotas — individual sales targets', path: '/quotas' },
      ],
      admin: 'As an admin you see all business units. The Products/Reps/Clients views help analyse mix, team performance, and account concentration.',
      member: 'As a sales rep you get a personal dashboard showing your target, pipeline, and deals. Overlay credits from team-mate product rules are included automatically.',
      viewer: 'You have read-only access. Contact your admin to request edit permissions.',
      distributor: 'You see your company\'s pipeline and targets.',
    },
    es: {
      title: 'Panel',
      description: 'Tu centro de mando con cinco vistas: salud del pipeline, ingresos y analisis por producto, comercial y cliente.',
      features: [
        'Cinco vistas en las pestanas: Resumen, Clasico, Productos, Comerciales, Clientes.',
        'Resumen: gauges reales vs presupuesto con leyenda de color (verde/ambar/rojo) y etiquetas Reales / Presupuesto debajo de cada gauge. El forecast se marca con un diamante azul.',
        'Todos los valores monetarios llevan el simbolo del euro (ej. €500K, €1.2M).',
        'Clasico: graficos mensuales + embudo reestructurado en Metricas Clave, Embudo de Ventas con tasas de conversion entre etapas, Atencion Requerida y Analisis.',
        'El Embudo de Ventas muestra porcentajes de conversion etapa a etapa (ej. Lead a Pipeline: 65%).',
        'Productos: embudo de ventas por producto / categoria / marca.',
        'Comerciales: embudo por comercial con forecast ponderado.',
        'Clientes: top clientes por region.',
        'En Productos/Comerciales/Clientes, haz clic en una fila para ver sus deals filtrados.',
      ],
      steps: [
        '1. Selecciona el filtro de BU (VGT / ECT / Todas) para delimitar las vistas.',
        '2. Resumen — gauges de reales vs presupuesto (ajusta por meses transcurridos). La leyenda de color explica los umbrales verde/ambar/rojo.',
        '3. Clasico — graficos mensuales detallados y analisis del embudo con tasas de conversion entre etapas.',
        '4. Productos — pipeline/backlog/facturado por producto; alterna por producto/categoria/marca.',
        '5. Comerciales — pipeline/backlog/facturado + forecast ponderado por comercial.',
        '6. Clientes — top clientes por region; usa las pestanas de region.',
        '7. Haz clic en cualquier fila de producto, comercial o cliente para abrir sus deals.',
      ],
      shortcuts: [
        'Clic en una fila del embudo → abre Oportunidades pre-filtradas.',
      ],
      mistakes: [
        'Olvidar seleccionar un filtro de BU — puedes estar viendo datos consolidados en vez de tu unidad.',
        'Comparar presupuesto anual contra reales YTD — la vista Resumen ajusta automaticamente por meses transcurridos.',
      ],
      seeAlso: [
        { label: 'Oportunidades — gestiona el pipeline que alimenta estas metricas', path: '/deals' },
        { label: 'Presupuesto — define y ajusta los objetivos mostrados aqui', path: '/budget' },
        { label: 'Objetivos — objetivos de ventas individuales', path: '/quotas' },
      ],
      admin: 'Como admin ves todas las unidades. Las vistas Productos/Comerciales/Clientes ayudan a analizar mix, rendimiento del equipo y concentracion de cuentas.',
      member: 'Como comercial tienes un dashboard personal con tu objetivo, pipeline y deals. Los creditos de overlay de reglas de producto de companeros se incluyen automaticamente.',
      viewer: 'Tienes acceso de solo lectura. Contacta a tu admin para solicitar permisos de edicion.',
      distributor: 'Ves el pipeline y los objetivos de tu empresa.',
    },
    pt: {
      title: 'Painel',
      description: 'O teu centro de comando com cinco vistas: saude do pipeline, receita e analise por produto, comercial e cliente.',
      features: [
        'Cinco vistas nas abas: Resumo, Classico, Produtos, Comerciais, Clientes.',
        'Resumo: gauges reais vs orcamento com legenda de cor (verde/ambar/vermelho) e etiquetas Reais / Orcamento abaixo de cada gauge. O forecast e marcado com um losango azul.',
        'Todos os valores monetarios apresentam o simbolo do euro (ex. €500K, €1.2M).',
        'Classico: graficos mensais + funil reestruturado em Metricas Chave, Funil de Vendas com taxas de conversao entre fases, Atencao Necessaria e Analise.',
        'O Funil de Vendas mostra percentagens de conversao fase a fase (ex. Lead para Pipeline: 65%).',
        'Produtos: funil de vendas por produto / categoria / marca.',
        'Comerciais: funil por comercial com forecast ponderado.',
        'Clientes: top clientes por regiao.',
        'Em Produtos/Comerciais/Clientes, clica numa linha para ver os deals filtrados.',
      ],
      steps: [
        '1. Seleciona o filtro de BU (VGT / ECT / Todas) para delimitar as vistas.',
        '2. Resumo — gauges de reais vs orcamento (ajusta pelos meses decorridos). A legenda de cor explica os limiares verde/ambar/vermelho.',
        '3. Classico — graficos mensais detalhados e analise do funil com taxas de conversao entre fases.',
        '4. Produtos — pipeline/backlog/faturado por produto; alterna por produto/categoria/marca.',
        '5. Comerciais — pipeline/backlog/faturado + forecast ponderado por comercial.',
        '6. Clientes — top clientes por regiao; usa as abas de regiao para alternar.',
        '7. Clica em qualquer linha de produto, comercial ou cliente para abrir os deals.',
      ],
      shortcuts: [
        'Clica numa linha do funil → abre Negocios pre-filtrados para esse item.',
      ],
      mistakes: [
        'Esquecer de selecionar um filtro de BU — podes estar a ver dados consolidados em vez da tua unidade.',
        'Comparar orcamento anual contra reais YTD — a vista Resumo ajusta automaticamente pelos meses decorridos.',
      ],
      seeAlso: [
        { label: 'Negocios — gere o pipeline que alimenta estas metricas', path: '/deals' },
        { label: 'Orcamento — define e ajusta os objetivos mostrados aqui', path: '/budget' },
        { label: 'Objetivos — objetivos de vendas individuais', path: '/quotas' },
      ],
      admin: 'Como admin ves todas as unidades. As vistas Produtos/Comerciais/Clientes ajudam a analisar mix, desempenho da equipa e concentracao de contas.',
      member: 'Como comercial tens um dashboard pessoal com o teu objetivo, pipeline e deals. Creditos de overlay de regras de produto de colegas sao incluidos automaticamente.',
      viewer: 'Tens acesso apenas de leitura. Contacta o teu admin para solicitar permissoes de edicao.',
      distributor: 'Ves o pipeline e os objetivos da tua empresa.',
    },
  },

  '/deals': {
    en: {
      title: 'Deals',
      description: 'Manage your sales pipeline from lead to invoice. View deals as a list, Kanban board, or on a map.',
      features: [
        'Use the view switcher (List / Kanban / Map) to change how deals are displayed.',
        'Drag deals between columns in Kanban view to update their stage.',
        'Click "+ Deal" to create a new deal with the quick form.',
        'Use filters and search to narrow down by stage, BU, owner, date range, and the new Brand, Product, and Category filters for per-product funnel analysis.',
        'Expand a deal row to see monthly revenue breakdown and line items.',
        'Each deal value uses monthly recognition when set, otherwise the value_total field.',
        'Business model: pick one of five — Financed Project (bank-financed, we collect upfront and defer revenue across years via a revenue schedule), OPEX / Pay per Study (quarterly invoicing on real production with an annual estimate), Subscription (annual fee, annual renewal, invoice monthly/quarterly/annually), CAPEX (client owns the licenses; recognise the sale with 1/2/3 years warranty, then a maintenance SLA), and One-shot (no recurring business, e.g. hardware).',
        'Contract Period: every business model carries a contract start and end date — this drives warranty, renewals and the revenue schedule.',
        'Financed Project deals get a year-by-year revenue schedule (e.g. €936,200 in FY1, then €237,700 in FY2–FY5) — use "Split evenly" or enter each year manually.',
        'CAPEX warranty/SLA coverage (updates & upgrades included, support-hours bank) is captured on the linked Contract (SLA).',
        'Deal cards show a brand badge (e.g. Medsky) for non-Fujifilm products.',
        'Request discounts: distributors can request a discount (% + justification) that routes to the right brand-based approver, with multiple negotiation rounds (counter-offers). An approved discount is applied to the deal value.',
        'A discount-approvals banner at the top shows pending / approved / rejected requests with filter chips, for admins, managers, and distributors.',
        'Project TCO: on a saved deal, add third-party (other vendor) costs to see the global project margin alongside Fujifilm products.',
      ],
      steps: [
        '1. Click "+ Deal" (top right) to open the quick-create form.',
        '2. Fill in BU, client, product, value, and stage, then Save.',
        '3. Click a deal row to open the full edit form with all fields.',
        '4. To filter, use the dropdowns: stage, BU, owner, region, period, plus Brand, Product, and Category.',
        '5. In Kanban view, drag a card to change its stage instantly.',
        '6. To request a discount, open a deal, enter the percentage and justification, and submit — it routes to the brand approver and supports counter-offers.',
        '7. Track requests via the discount-approvals banner and its pending/approved/rejected filter chips.',
        '8. On a saved deal, add third-party vendor costs under Project TCO to see the global project margin.',
        '9. To export, use the browser print (Ctrl+P) on the list view.',
      ],
      shortcuts: [
        'Ctrl+N — Open new deal form (when on Deals page).',
        'Esc — Close the deal form or dismiss filters.',
      ],
      mistakes: [
        'Not setting the correct BU — deals will appear under the wrong pipeline.',
        'Leaving value at 0 — this skips the deal from forecasts and dashboards.',
        'Forgetting to set the recognition months (contract start/end) — monthly charts will show zero.',
        'Choosing Financed Project but leaving the revenue schedule empty — the deferral across years will be missing.',
        'Selecting a business model without setting the contract start/end dates.',
        'Changing stage to Invoiced without filling the invoice date.',
        'Submitting a discount request without a justification — the approver needs context to decide or counter-offer.',
      ],
      seeAlso: [
        { label: 'Contracts & SLAs — deals can generate SLA records', path: '/sla' },
        { label: 'Products — line items reference the product catalog', path: '/products' },
        { label: 'Tasks — create follow-up tasks linked to deals', path: '/tasks' },
        { label: 'Tenders — link deals to public tenders', path: '/tenders' },
        { label: 'White-space — find gaps in client-product coverage', path: '/whitespace' },
      ],
      admin: 'You can edit or delete any deal regardless of ownership. Bulk actions are available in list view.',
      viewer: 'You can view deal details but cannot create or modify deals.',
      distributor: 'You see only deals linked to your company. Your deal form is simplified (Stage, Client, Products, Discount). Select products from your authorized catalog, and request discounts that route to the brand approver. The approvals banner shows the status of your requests.',
    },
    es: {
      title: 'Oportunidades',
      description: 'Gestiona tu pipeline de ventas desde el lead hasta la factura. Visualiza deals como lista, Kanban o en mapa.',
      features: [
        'Usa el selector de vista (Lista / Kanban / Mapa) para cambiar la visualizacion.',
        'Arrastra deals entre columnas en la vista Kanban para actualizar su etapa.',
        'Haz clic en "+ Deal" para crear una nueva oportunidad con el formulario rapido.',
        'Usa filtros y busqueda para filtrar por etapa, BU, responsable, rango de fechas y los nuevos filtros de Marca, Producto y Categoria para analisis de embudo por producto.',
        'Expande una fila de deal para ver el desglose mensual de ingresos.',
        'El valor de cada deal usa el reconocimiento mensual si esta definido; si no, el campo value_total.',
        'Modelo de negocio: elige uno de cinco — Proyecto Financiado (financiado por banca, cobramos por adelantado y diferimos los ingresos a lo largo de los años mediante un calendario de ingresos), OPEX / Pago por Estudio (facturacion trimestral segun produccion real con una estimacion anual), Suscripcion (cuota anual, renovacion anual, facturacion mensual/trimestral/anual), CAPEX (el cliente posee las licencias; reconoce la venta con 1/2/3 años de garantia y luego un SLA de mantenimiento), y Venta unica (sin negocio recurrente, p. ej. hardware).',
        'Periodo de contrato: todos los modelos llevan una fecha de inicio y fin de contrato — esto rige la garantia, las renovaciones y el calendario de ingresos.',
        'Los Proyectos Financiados tienen un calendario de ingresos año a año (p. ej. 936.200 € en FY1, luego 237.700 € en FY2–FY5) — usa "Repartir equitativamente" o introduce cada año manualmente.',
        'La cobertura de garantia/SLA de CAPEX (actualizaciones y upgrades incluidos, bolsa de horas de soporte) se registra en el Contrato (SLA) vinculado.',
        'Las tarjetas de deal muestran una insignia de marca (p. ej. Medsky) para productos que no son Fujifilm.',
        'Solicita descuentos: los distribuidores pueden pedir un descuento (% + justificacion) que se enruta al aprobador correcto segun la marca, con varias rondas de negociacion (contraofertas). Un descuento aprobado se aplica al valor del deal.',
        'Un banner de aprobaciones de descuento en la parte superior muestra solicitudes pendientes / aprobadas / rechazadas con chips de filtro, para admins, managers y distribuidores.',
        'TCO del proyecto: en un deal guardado, anade costes de terceros (otros proveedores) para ver el margen global del proyecto junto a los productos Fujifilm.',
      ],
      steps: [
        '1. Haz clic en "+ Deal" (arriba a la derecha) para abrir el formulario rapido.',
        '2. Rellena BU, cliente, producto, valor y etapa, luego Guardar.',
        '3. Haz clic en una fila de deal para abrir el formulario completo.',
        '4. Para filtrar, usa los desplegables: etapa, BU, responsable, region, periodo, ademas de Marca, Producto y Categoria.',
        '5. En vista Kanban, arrastra una tarjeta para cambiar su etapa al instante.',
        '6. Para pedir un descuento, abre un deal, introduce el porcentaje y la justificacion y envia — se enruta al aprobador de la marca y admite contraofertas.',
        '7. Sigue las solicitudes con el banner de aprobaciones y sus chips pendiente/aprobado/rechazado.',
        '8. En un deal guardado, anade costes de proveedores externos en TCO del proyecto para ver el margen global.',
        '9. Para exportar, usa la impresion del navegador (Ctrl+P) en la vista lista.',
      ],
      shortcuts: [
        'Ctrl+N — Abrir formulario de nuevo deal (en la pagina de Oportunidades).',
        'Esc — Cerrar el formulario o descartar filtros.',
      ],
      mistakes: [
        'No seleccionar la BU correcta — los deals aparecerán en el pipeline incorrecto.',
        'Dejar el valor en 0 — el deal se omitira de previsiones y paneles.',
        'Olvidar configurar los meses de reconocimiento (inicio/fin de contrato).',
        'Elegir Proyecto Financiado pero dejar el calendario de ingresos vacio — faltara el diferimiento entre años.',
        'Seleccionar un modelo de negocio sin definir las fechas de inicio/fin de contrato.',
        'Cambiar la etapa a Facturado sin rellenar la fecha de factura.',
        'Enviar una solicitud de descuento sin justificacion — el aprobador necesita contexto para decidir o contraofertar.',
      ],
      seeAlso: [
        { label: 'Contratos y SLAs — los deals pueden generar registros SLA', path: '/sla' },
        { label: 'Productos — las lineas referencian el catalogo de productos', path: '/products' },
        { label: 'Tareas — crea tareas de seguimiento vinculadas a deals', path: '/tasks' },
        { label: 'Licitaciones — vincula deals a concursos publicos', path: '/tenders' },
      ],
      admin: 'Puedes editar o eliminar cualquier deal independientemente del propietario.',
      viewer: 'Puedes ver los detalles del deal pero no crear ni modificar.',
      distributor: 'Solo ves los deals vinculados a tu empresa. Tu formulario de deal es simplificado (Etapa, Cliente, Productos, Descuento). Selecciona productos de tu catalogo autorizado y solicita descuentos que se enrutan al aprobador de la marca. El banner de aprobaciones muestra el estado de tus solicitudes.',
    },
    pt: {
      title: 'Negocios',
      description: 'Gere o teu pipeline de vendas do lead a fatura. Visualiza deals como lista, Kanban ou no mapa.',
      features: [
        'Usa o seletor de vista (Lista / Kanban / Mapa) para mudar a visualizacao.',
        'Arrasta deals entre colunas na vista Kanban para atualizar a fase.',
        'Clica em "+ Deal" para criar um novo negocio com o formulario rapido.',
        'Usa filtros e pesquisa para filtrar por fase, BU, responsavel, intervalo de datas e os novos filtros de Marca, Produto e Categoria para analise de funil por produto.',
        'Expande uma linha de deal para ver o detalhe mensal de receita.',
        'O valor de cada deal usa o reconhecimento mensal quando definido; caso contrario, o campo value_total.',
        'Modelo de negocio: escolhe um de cinco — Projeto Financiado (financiado pela banca, recebemos a cabeca e diferimos a receita ao longo dos anos atraves de um calendario de receita), OPEX / Pagamento por Estudo (faturacao trimestral conforme producao real com uma estimativa anual), Subscricao (mensalidade anual, renovacao anual, faturacao mensal/trimestral/anual), CAPEX (o cliente e dono das licencas; reconhece a venda com 1/2/3 anos de garantia e depois um SLA de manutencao), e Venda unica (sem negocio recorrente, p. ex. hardware).',
        'Periodo de contrato: todos os modelos tem uma data de inicio e fim de contrato — isto rege a garantia, as renovacoes e o calendario de receita.',
        'Os Projetos Financiados tem um calendario de receita ano a ano (p. ex. 936.200 € no FY1, depois 237.700 € nos FY2–FY5) — usa "Dividir igualmente" ou introduz cada ano manualmente.',
        'A cobertura de garantia/SLA do CAPEX (updates e upgrades incluidos, banco de horas de suporte) e registada no Contrato (SLA) associado.',
        'Os cartoes de deal mostram um distintivo de marca (p. ex. Medsky) para produtos que nao sao Fujifilm.',
        'Pede descontos: os distribuidores podem pedir um desconto (% + justificacao) que e encaminhado para o aprovador correto com base na marca, com varias rondas de negociacao (contrapropostas). Um desconto aprovado e aplicado ao valor do deal.',
        'Um banner de aprovacoes de desconto no topo mostra pedidos pendentes / aprovados / rejeitados com chips de filtro, para admins, gestores e distribuidores.',
        'TCO do projeto: num deal guardado, adiciona custos de terceiros (outros fornecedores) para ver a margem global do projeto a par dos produtos Fujifilm.',
      ],
      steps: [
        '1. Clica em "+ Deal" (canto superior direito) para abrir o formulario rapido.',
        '2. Preenche BU, cliente, produto, valor e fase, depois Guardar.',
        '3. Clica numa linha de deal para abrir o formulario completo.',
        '4. Para filtrar, usa os menus: fase, BU, responsavel, regiao, periodo, alem de Marca, Produto e Categoria.',
        '5. Na vista Kanban, arrasta um cartao para mudar a fase instantaneamente.',
        '6. Para pedir um desconto, abre um deal, introduz a percentagem e a justificacao e submete — e encaminhado para o aprovador da marca e suporta contrapropostas.',
        '7. Acompanha os pedidos atraves do banner de aprovacoes e dos seus chips pendente/aprovado/rejeitado.',
        '8. Num deal guardado, adiciona custos de fornecedores externos no TCO do projeto para ver a margem global.',
        '9. Para exportar, usa a impressao do navegador (Ctrl+P) na vista lista.',
      ],
      shortcuts: [
        'Ctrl+N — Abrir formulario de novo deal (na pagina de Negocios).',
        'Esc — Fechar o formulario ou descartar filtros.',
      ],
      mistakes: [
        'Nao selecionar a BU correta — os deals aparecerao no pipeline errado.',
        'Deixar o valor em 0 — o deal sera omitido de previsoes e paineis.',
        'Esquecer de configurar os meses de reconhecimento (inicio/fim de contrato).',
        'Escolher Projeto Financiado mas deixar o calendario de receita vazio — faltara o diferimento entre anos.',
        'Selecionar um modelo de negocio sem definir as datas de inicio/fim de contrato.',
        'Mudar a fase para Faturado sem preencher a data de fatura.',
        'Submeter um pedido de desconto sem justificacao — o aprovador precisa de contexto para decidir ou fazer contraproposta.',
      ],
      seeAlso: [
        { label: 'Contratos e SLAs — os deals podem gerar registos SLA', path: '/sla' },
        { label: 'Produtos — as linhas referenciam o catalogo de produtos', path: '/products' },
        { label: 'Tarefas — cria tarefas de seguimento associadas a deals', path: '/tasks' },
        { label: 'Concursos — associa deals a concursos publicos', path: '/tenders' },
      ],
      admin: 'Podes editar ou eliminar qualquer deal independentemente do proprietario.',
      viewer: 'Podes ver os detalhes do deal mas nao criar nem modificar.',
      distributor: 'Ves apenas os deals ligados a tua empresa. O teu formulario de deal e simplificado (Fase, Cliente, Produtos, Desconto). Seleciona produtos do teu catalogo autorizado e pede descontos que sao encaminhados para o aprovador da marca. O banner de aprovacoes mostra o estado dos teus pedidos.',
    },
  },

  '/clients': {
    en: {
      title: 'Clients',
      description: 'Your client directory. Each client can have multiple contacts, accounts, and associated deals.',
      features: [
        'Search clients by name, country, or segment.',
        'Click a client row to see full details including linked contacts and deal history.',
        'Use the "+" button to add a new client record.',
        'Filter by region, country, type (Public/Private), or BU.',
        'Expand a client card to view all associated deals inline.',
      ],
      steps: [
        '1. Click "New Client" to open the creation form.',
        '2. Enter the hospital/site name, select region and country.',
        '3. Choose the client type: Public or Private.',
        '4. Optionally link a distributor if sales go through a partner.',
        '5. Save — the client is now available for linking in Deals and SLAs.',
      ],
      shortcuts: [],
      mistakes: [
        'Creating duplicate client records — always search first to avoid duplicates.',
        'Not setting the region/country — this breaks geographic filtering and the map view.',
        'Confusing Clients with Accounts — Clients are individual sites; Accounts are organizational groups.',
      ],
      seeAlso: [
        { label: 'Accounts — group clients into organizational hierarchies', path: '/accounts' },
        { label: 'Contacts — add individual people at this client', path: '/contacts' },
        { label: 'Deals — see all deals linked to this client', path: '/deals' },
        { label: 'SLAs — view active contracts for this client', path: '/sla' },
      ],
      admin: 'You can merge duplicate clients and manage client segments.',
      viewer: 'You can browse clients but cannot add or edit records.',
      distributor: 'Your customer accounts.',
    },
    es: {
      title: 'Clientes',
      description: 'Tu directorio de clientes. Cada cliente puede tener multiples contactos, cuentas y oportunidades asociadas.',
      features: [
        'Busca clientes por nombre, pais o segmento.',
        'Haz clic en una fila de cliente para ver todos los detalles.',
        'Usa el boton "+" para anadir un nuevo cliente.',
        'Filtra por region, pais, tipo (Publico/Privado) o BU.',
        'Expande una tarjeta de cliente para ver los deals asociados.',
      ],
      steps: [
        '1. Haz clic en "Nuevo Cliente" para abrir el formulario.',
        '2. Introduce el nombre del hospital/centro, selecciona region y pais.',
        '3. Elige el tipo de cliente: Publico o Privado.',
        '4. Opcionalmente vincula un distribuidor si las ventas van por un partner.',
        '5. Guardar — el cliente estara disponible para vincular en Oportunidades y SLAs.',
      ],
      shortcuts: [],
      mistakes: [
        'Crear clientes duplicados — busca siempre antes para evitar duplicados.',
        'No configurar region/pais — esto rompe el filtrado geografico.',
        'Confundir Clientes con Cuentas — Clientes son centros individuales; Cuentas son grupos organizacionales.',
      ],
      seeAlso: [
        { label: 'Cuentas — agrupa clientes en jerarquias organizacionales', path: '/accounts' },
        { label: 'Contactos — anade personas individuales en este cliente', path: '/contacts' },
        { label: 'Oportunidades — ve todos los deals vinculados', path: '/deals' },
      ],
      admin: 'Puedes fusionar clientes duplicados y gestionar segmentos.',
      viewer: 'Puedes navegar clientes pero no anadir ni editar registros.',
      distributor: 'Las cuentas de tus clientes.',
    },
    pt: {
      title: 'Clientes',
      description: 'O teu diretorio de clientes. Cada cliente pode ter multiplos contactos, contas e negocios associados.',
      features: [
        'Pesquisa clientes por nome, pais ou segmento.',
        'Clica numa linha de cliente para ver todos os detalhes.',
        'Usa o botao "+" para adicionar um novo cliente.',
        'Filtra por regiao, pais, tipo (Publico/Privado) ou BU.',
        'Expande um cartao de cliente para ver os deals associados.',
      ],
      steps: [
        '1. Clica em "Novo Cliente" para abrir o formulario.',
        '2. Introduz o nome do hospital/centro, seleciona regiao e pais.',
        '3. Escolhe o tipo de cliente: Publico ou Privado.',
        '4. Opcionalmente liga um distribuidor se as vendas passam por um parceiro.',
        '5. Guardar — o cliente fica disponivel para ligar em Negocios e SLAs.',
      ],
      shortcuts: [],
      mistakes: [
        'Criar clientes duplicados — pesquisa sempre antes para evitar duplicados.',
        'Nao configurar regiao/pais — isto quebra o filtro geografico.',
        'Confundir Clientes com Contas — Clientes sao centros individuais; Contas sao grupos organizacionais.',
      ],
      seeAlso: [
        { label: 'Contas — agrupa clientes em hierarquias organizacionais', path: '/accounts' },
        { label: 'Contactos — adiciona pessoas individuais neste cliente', path: '/contacts' },
        { label: 'Negocios — ve todos os deals associados', path: '/deals' },
      ],
      admin: 'Podes fundir clientes duplicados e gerir segmentos.',
      viewer: 'Podes navegar clientes mas nao adicionar nem editar registos.',
      distributor: 'As contas dos teus clientes.',
    },
  },

  '/contacts': {
    en: {
      title: 'Contacts',
      description: 'Individual contacts linked to client organizations. Track key stakeholders and decision-makers.',
      features: [
        'Each contact is linked to a client — select the client first when creating a contact.',
        'Add phone, email, and role information for each contact.',
        'Use contacts when assigning deal stakeholders.',
        'Filter contacts by client, role, or search by name/email.',
      ],
      steps: [
        '1. Navigate to a client card or use the Contacts page.',
        '2. Click "+ Contact" to add a new person.',
        '3. Select the parent client from the dropdown.',
        '4. Fill in name, email, phone, and job title/role.',
        '5. Save — the contact appears in the client detail view and is available for deal assignment.',
      ],
      shortcuts: [],
      mistakes: [
        'Creating contacts without linking to a client — orphaned contacts cannot be found easily.',
        'Not filling in the role/title — makes it hard to identify decision-makers.',
      ],
      seeAlso: [
        { label: 'Clients — the parent records for contacts', path: '/clients' },
        { label: 'Deals — assign contacts as stakeholders on deals', path: '/deals' },
      ],
      admin: 'You can manage all contacts across the organization.',
      viewer: 'You can view contact details in read-only mode.',
      distributor: 'Your contacts at customer sites.',
    },
    es: {
      title: 'Contactos',
      description: 'Contactos individuales vinculados a organizaciones cliente. Rastrea stakeholders y decisores clave.',
      features: [
        'Cada contacto esta vinculado a un cliente — selecciona el cliente primero al crear un contacto.',
        'Anade telefono, email e informacion de rol para cada contacto.',
        'Usa contactos al asignar stakeholders en los deals.',
        'Filtra contactos por cliente, rol o busca por nombre/email.',
      ],
      steps: [
        '1. Navega a una tarjeta de cliente o usa la pagina de Contactos.',
        '2. Haz clic en "+ Contacto" para anadir una nueva persona.',
        '3. Selecciona el cliente padre del desplegable.',
        '4. Rellena nombre, email, telefono y cargo/rol.',
        '5. Guardar — el contacto aparece en la vista del cliente.',
      ],
      shortcuts: [],
      mistakes: [
        'Crear contactos sin vincular a un cliente — los contactos huerfanos no se encuentran facilmente.',
        'No rellenar el rol/cargo — dificulta identificar a los decisores.',
      ],
      seeAlso: [
        { label: 'Clientes — los registros padre de los contactos', path: '/clients' },
        { label: 'Oportunidades — asigna contactos como stakeholders', path: '/deals' },
      ],
      admin: 'Puedes gestionar todos los contactos de la organizacion.',
      viewer: 'Puedes ver los detalles de contacto en modo lectura.',
      distributor: 'Tus contactos en los centros de los clientes.',
    },
    pt: {
      title: 'Contactos',
      description: 'Contactos individuais ligados a organizacoes cliente. Acompanha stakeholders e decisores chave.',
      features: [
        'Cada contacto esta ligado a um cliente — seleciona o cliente primeiro ao criar um contacto.',
        'Adiciona telefone, email e informacao de cargo para cada contacto.',
        'Usa contactos ao atribuir stakeholders nos deals.',
        'Filtra contactos por cliente, cargo ou pesquisa por nome/email.',
      ],
      steps: [
        '1. Navega a um cartao de cliente ou usa a pagina de Contactos.',
        '2. Clica em "+ Contacto" para adicionar uma nova pessoa.',
        '3. Seleciona o cliente pai do menu.',
        '4. Preenche nome, email, telefone e cargo/funcao.',
        '5. Guardar — o contacto aparece na vista do cliente.',
      ],
      shortcuts: [],
      mistakes: [
        'Criar contactos sem ligar a um cliente — contactos orfaos nao se encontram facilmente.',
        'Nao preencher o cargo/funcao — dificulta identificar os decisores.',
      ],
      seeAlso: [
        { label: 'Clientes — os registos pai dos contactos', path: '/clients' },
        { label: 'Negocios — atribui contactos como stakeholders', path: '/deals' },
      ],
      admin: 'Podes gerir todos os contactos da organizacao.',
      viewer: 'Podes ver os detalhes de contacto em modo leitura.',
      distributor: 'Os teus contactos nos centros dos clientes.',
    },
  },

  '/accounts': {
    en: {
      title: 'Accounts',
      description: 'Account records representing organizational hierarchies — hospital groups, regional entities, and billing structures.',
      features: [
        'Accounts are organized in a tree structure (parent-child hierarchy).',
        'Each account shows roll-up totals for deals, pipeline, and invoiced revenue.',
        'Link accounts to clients and deals for structured invoicing.',
        'Expand/Collapse all nodes to explore the organizational tree.',
      ],
      steps: [
        '1. Click "New account" to create a top-level or child account.',
        '2. Enter the name, select BU, and optionally pick a parent account.',
        '3. Set region and country for geographic reporting.',
        '4. Save — the account appears in the tree.',
        '5. To restructure, edit an account and change its parent.',
      ],
      shortcuts: [],
      mistakes: [
        'Creating circular parent relationships — the form prevents this, but plan your hierarchy first.',
        'Confusing Accounts with Clients — Accounts are organizational groups; Clients are individual sites.',
        'Deleting a parent account — children become top-level nodes.',
      ],
      seeAlso: [
        { label: 'Clients — individual sites within account groups', path: '/clients' },
        { label: 'Deals — link deals to accounts for structured reporting', path: '/deals' },
      ],
      admin: 'Full create, edit, and delete access to all accounts.',
    },
    es: {
      title: 'Cuentas',
      description: 'Registros de cuenta representando jerarquias organizacionales — grupos hospitalarios, entidades regionales y estructuras de facturacion.',
      features: [
        'Las cuentas se organizan en estructura de arbol (jerarquia padre-hijo).',
        'Cada cuenta muestra totales acumulados de deals, pipeline e ingresos facturados.',
        'Vincula cuentas a clientes y deals para facturacion estructurada.',
        'Expande/Contrae todos los nodos para explorar el arbol organizacional.',
      ],
      steps: [
        '1. Haz clic en "Nueva cuenta" para crear una cuenta de nivel superior o hija.',
        '2. Introduce el nombre, selecciona BU y opcionalmente elige una cuenta padre.',
        '3. Configura region y pais para informes geograficos.',
        '4. Guardar — la cuenta aparece en el arbol.',
        '5. Para reestructurar, edita una cuenta y cambia su padre.',
      ],
      shortcuts: [],
      mistakes: [
        'Crear relaciones padre circulares — el formulario lo previene, pero planifica tu jerarquia.',
        'Confundir Cuentas con Clientes — Cuentas son grupos organizacionales; Clientes son centros individuales.',
      ],
      seeAlso: [
        { label: 'Clientes — centros individuales dentro de grupos de cuentas', path: '/clients' },
        { label: 'Oportunidades — vincula deals a cuentas para reportes', path: '/deals' },
      ],
      admin: 'Acceso completo de creacion, edicion y eliminacion de todas las cuentas.',
    },
    pt: {
      title: 'Contas',
      description: 'Registos de conta representando hierarquias organizacionais — grupos hospitalares, entidades regionais e estruturas de faturacao.',
      features: [
        'As contas organizam-se em estrutura de arvore (hierarquia pai-filho).',
        'Cada conta mostra totais acumulados de deals, pipeline e receita faturada.',
        'Liga contas a clientes e deals para faturacao estruturada.',
        'Expande/Recolhe todos os nos para explorar a arvore organizacional.',
      ],
      steps: [
        '1. Clica em "Nova conta" para criar uma conta de nivel superior ou filha.',
        '2. Introduz o nome, seleciona BU e opcionalmente escolhe uma conta pai.',
        '3. Configura regiao e pais para relatorios geograficos.',
        '4. Guardar — a conta aparece na arvore.',
        '5. Para reestruturar, edita uma conta e muda o seu pai.',
      ],
      shortcuts: [],
      mistakes: [
        'Criar relacoes pai circulares — o formulario previne isto, mas planifica a tua hierarquia.',
        'Confundir Contas com Clientes — Contas sao grupos organizacionais; Clientes sao centros individuais.',
      ],
      seeAlso: [
        { label: 'Clientes — centros individuais dentro de grupos de contas', path: '/clients' },
        { label: 'Negocios — liga deals a contas para relatorios', path: '/deals' },
      ],
      admin: 'Acesso completo de criacao, edicao e eliminacao de todas as contas.',
    },
  },

  '/tasks': {
    en: {
      title: 'Tasks',
      description: 'Track action items, follow-ups, and deadlines. Tasks can be linked to deals or tenders, or kept as personal to-dos.',
      features: [
        'Create tasks with due dates, priorities, and assignees.',
        'Overdue tasks appear with a red badge in the navigation.',
        'Filter by status (open / done / overdue) or assigned user.',
        'Link tasks to specific deals or tenders for context.',
        'View "My tasks", "Assigned to me", and "Assigned by me" tabs.',
      ],
      steps: [
        '1. Click "+ Add task" to open the task form.',
        '2. Enter a title and optional notes.',
        '3. Set a deadline and priority (low / medium / high).',
        '4. Optionally assign to a team member — leave empty for a personal task.',
        '5. Link to a deal or tender if the task is related to one.',
        '6. Save — the task appears in your list, sorted by deadline.',
      ],
      shortcuts: [],
      mistakes: [
        'Not setting a deadline — the task will not trigger overdue alerts.',
        'Assigning to yourself vs. leaving personal — both work, but "Assigned to me" uses the assignee field.',
        'Forgetting to mark tasks as done — overdue counts accumulate in the nav badge.',
      ],
      seeAlso: [
        { label: 'Deals — link tasks to deals for follow-up', path: '/deals' },
        { label: 'Tenders — link tasks to tender deadlines', path: '/tenders' },
      ],
      admin: 'You can reassign tasks between any team members.',
      distributor: 'View and manage tasks assigned to you.',
    },
    es: {
      title: 'Tareas',
      description: 'Rastrea acciones, seguimientos y plazos. Las tareas pueden vincularse a deals o licitaciones, o mantenerse como pendientes personales.',
      features: [
        'Crea tareas con fechas limite, prioridades y asignados.',
        'Las tareas vencidas aparecen con insignia roja en la navegacion.',
        'Filtra por estado (abiertas / completadas / vencidas) o usuario asignado.',
        'Vincula tareas a deals o licitaciones especificas para contexto.',
      ],
      steps: [
        '1. Haz clic en "+ Anadir tarea" para abrir el formulario.',
        '2. Introduce un titulo y notas opcionales.',
        '3. Establece fecha limite y prioridad.',
        '4. Opcionalmente asigna a un miembro del equipo.',
        '5. Vincula a un deal o licitacion si la tarea esta relacionada.',
        '6. Guardar — la tarea aparece en tu lista.',
      ],
      shortcuts: [],
      mistakes: [
        'No establecer fecha limite — la tarea no activara alertas de vencimiento.',
        'Olvidar marcar tareas como completadas — los conteos de vencidas se acumulan.',
      ],
      seeAlso: [
        { label: 'Oportunidades — vincula tareas a deals para seguimiento', path: '/deals' },
        { label: 'Licitaciones — vincula tareas a plazos de licitaciones', path: '/tenders' },
      ],
      admin: 'Puedes reasignar tareas entre cualquier miembro del equipo.',
      distributor: 'Visualiza y gestiona las tareas asignadas a ti.',
    },
    pt: {
      title: 'Tarefas',
      description: 'Acompanha acoes, seguimentos e prazos. As tarefas podem ligar-se a deals ou concursos, ou manter-se como pendentes pessoais.',
      features: [
        'Cria tarefas com prazos, prioridades e atribuidos.',
        'As tarefas vencidas aparecem com insignia vermelha na navegacao.',
        'Filtra por estado (abertas / concluidas / vencidas) ou utilizador atribuido.',
        'Liga tarefas a deals ou concursos especificos para contexto.',
      ],
      steps: [
        '1. Clica em "+ Adicionar tarefa" para abrir o formulario.',
        '2. Introduz um titulo e notas opcionais.',
        '3. Define prazo e prioridade.',
        '4. Opcionalmente atribui a um membro da equipa.',
        '5. Liga a um deal ou concurso se a tarefa esta relacionada.',
        '6. Guardar — a tarefa aparece na tua lista.',
      ],
      shortcuts: [],
      mistakes: [
        'Nao definir prazo — a tarefa nao ativara alertas de vencimento.',
        'Esquecer de marcar tarefas como concluidas — os contadores de vencidas acumulam-se.',
      ],
      seeAlso: [
        { label: 'Negocios — liga tarefas a deals para seguimento', path: '/deals' },
        { label: 'Concursos — liga tarefas a prazos de concursos', path: '/tenders' },
      ],
      admin: 'Podes reatribuir tarefas entre qualquer membro da equipa.',
      distributor: 'Visualiza e gere as tarefas atribuidas a ti.',
    },
  },

  '/tenders': {
    en: {
      title: 'Tenders',
      description: 'Manage tender submissions and RFP responses. Track deadlines, submission status, and link tenders to deals.',
      features: [
        'Create tender records with requirements, deadlines, and linked deals.',
        'Track tender status from draft through submission to award.',
        'Attach documents and proposals to tender records.',
        'Filter by status, BU, or urgency. Overdue tenders are highlighted.',
        'Each tender can be linked to an existing deal or create a new one.',
      ],
      steps: [
        '1. Click "New tender" to open the form.',
        '2. Enter the title, reference number, and BU.',
        '3. Link or create a deal — this connects the tender to your pipeline.',
        '4. Set the submission deadline and decision date.',
        '5. Add collaborators who work on this tender.',
        '6. Save and update the status as the tender progresses (Open > Submitted > Won/Lost).',
      ],
      shortcuts: [],
      mistakes: [
        'Not linking a deal — the tender will not affect pipeline or revenue calculations.',
        'Missing the submission deadline — set calendar reminders outside the app for critical dates.',
        'Forgetting to update status after decision — keeps the dashboard accurate.',
      ],
      seeAlso: [
        { label: 'Deals — the pipeline entries linked to tenders', path: '/deals' },
        { label: 'Tasks — create tasks for tender preparation milestones', path: '/tasks' },
      ],
      admin: 'You can view and manage all tenders across business units.',
      distributor: 'Collaborate on tenders with your Fujifilm contact.',
    },
    es: {
      title: 'Licitaciones',
      description: 'Gestiona presentaciones de licitaciones y respuestas RFP. Rastrea plazos, estado y vincula con deals.',
      features: [
        'Crea registros de licitacion con requisitos, plazos y deals vinculados.',
        'Rastrea el estado desde borrador hasta presentacion y adjudicacion.',
        'Adjunta documentos y propuestas a los registros de licitacion.',
        'Filtra por estado, BU o urgencia.',
      ],
      steps: [
        '1. Haz clic en "Nueva licitacion" para abrir el formulario.',
        '2. Introduce titulo, referencia y BU.',
        '3. Vincula o crea un deal.',
        '4. Establece fecha de presentacion y fecha de resolucion.',
        '5. Anade colaboradores.',
        '6. Guarda y actualiza el estado segun progrese.',
      ],
      shortcuts: [],
      mistakes: [
        'No vincular un deal — la licitacion no afectara el pipeline.',
        'Perder la fecha de presentacion — configura recordatorios para fechas criticas.',
      ],
      seeAlso: [
        { label: 'Oportunidades — las entradas de pipeline vinculadas a licitaciones', path: '/deals' },
        { label: 'Tareas — crea tareas para hitos de preparacion', path: '/tasks' },
      ],
      admin: 'Puedes ver y gestionar todas las licitaciones de todas las unidades.',
      distributor: 'Colabora en licitaciones con tu contacto de Fujifilm.',
    },
    pt: {
      title: 'Concursos',
      description: 'Gere submissoes de concursos e respostas RFP. Acompanha prazos, estado e liga com deals.',
      features: [
        'Cria registos de concurso com requisitos, prazos e deals associados.',
        'Acompanha o estado desde rascunho ate submissao e adjudicacao.',
        'Anexa documentos e propostas aos registos de concurso.',
        'Filtra por estado, BU ou urgencia.',
      ],
      steps: [
        '1. Clica em "Novo concurso" para abrir o formulario.',
        '2. Introduz titulo, referencia e BU.',
        '3. Liga ou cria um deal.',
        '4. Define prazo de entrega e data de decisao.',
        '5. Adiciona colaboradores.',
        '6. Guarda e atualiza o estado conforme progride.',
      ],
      shortcuts: [],
      mistakes: [
        'Nao ligar um deal — o concurso nao afetara o pipeline.',
        'Perder o prazo de entrega — configura lembretes para datas criticas.',
      ],
      seeAlso: [
        { label: 'Negocios — as entradas de pipeline associadas a concursos', path: '/deals' },
        { label: 'Tarefas — cria tarefas para marcos de preparacao', path: '/tasks' },
      ],
      admin: 'Podes ver e gerir todos os concursos de todas as unidades.',
      distributor: 'Colabora em concursos com o teu contacto da Fujifilm.',
    },
  },

  '/sla': {
    en: {
      title: 'Contracts & SLAs',
      description: 'Manage service-level agreements, maintenance contracts, and recurring revenue streams with clients.',
      features: [
        'Define SLA terms including response times and uptime guarantees.',
        'Track contract renewal dates and recurring revenue.',
        'Set up alerts for contracts approaching expiration (30/60/90 day windows).',
        'View revenue recognition per fiscal year with automatic projections.',
        'Switch between List and Kanban views to manage contract lifecycle.',
        'Add product line items to SLAs from the product catalog.',
        'Contract coverage: record whether updates & upgrades are included and the support-hours bank (or leave empty for no hours limit) — these appear as badges on the contract card.',
      ],
      steps: [
        '1. Click "New SLA" to open the form.',
        '2. Select BU, status, and enter the client name.',
        '3. Choose the SLA owner and SLA type.',
        '4. Enter annual value and set start/end dates.',
        '5. Configure billing model (fixed or variable) and frequency.',
        '6. Save — revenue is automatically projected across fiscal years.',
        '7. Use the Renewal section on active SLAs to renew with a price increase.',
      ],
      shortcuts: [],
      mistakes: [
        'Not setting start/end dates — revenue projections will be empty.',
        'Forgetting to update status after contract renewal — keeps pipeline metrics accurate.',
        'Creating SLAs without linking to a client — they will not roll up to client analytics.',
        'Not adding product line items — total value may be manually entered instead of computed.',
      ],
      seeAlso: [
        { label: 'Deals — deals can be converted to SLA contracts', path: '/deals' },
        { label: 'Products — line items reference the product catalog', path: '/products' },
        { label: 'Clients — the parent records for SLA contracts', path: '/clients' },
      ],
      admin: 'You can create and modify SLA templates for the organization.',
    },
    es: {
      title: 'Contratos y SLAs',
      description: 'Gestiona acuerdos de nivel de servicio, contratos de mantenimiento y flujos de ingresos recurrentes.',
      features: [
        'Define terminos de SLA incluyendo tiempos de respuesta y garantias.',
        'Rastrea fechas de renovacion y ingresos recurrentes.',
        'Configura alertas para contratos proximos a vencer.',
        'Visualiza reconocimiento de ingresos por ano fiscal.',
        'Alterna entre vistas Lista y Kanban.',
        'Cobertura del contrato: registra si se incluyen actualizaciones y upgrades y la bolsa de horas de soporte (o dejala vacia si no hay limite de horas) — aparecen como insignias en la tarjeta del contrato.',
      ],
      steps: [
        '1. Haz clic en "Nuevo SLA" para abrir el formulario.',
        '2. Selecciona BU, estado e introduce el nombre del cliente.',
        '3. Elige responsable SLA y tipo.',
        '4. Introduce valor anual y fechas de inicio/fin.',
        '5. Configura modelo de facturacion y frecuencia.',
        '6. Guardar — los ingresos se proyectan automaticamente.',
        '7. Usa la seccion de Renovacion en SLAs activos para renovar con aumento.',
      ],
      shortcuts: [],
      mistakes: [
        'No configurar fechas de inicio/fin — las proyecciones de ingresos estaran vacias.',
        'Olvidar actualizar el estado tras la renovacion.',
        'Crear SLAs sin vincular a un cliente.',
      ],
      seeAlso: [
        { label: 'Oportunidades — los deals pueden convertirse en contratos SLA', path: '/deals' },
        { label: 'Productos — las lineas referencian el catalogo', path: '/products' },
        { label: 'Clientes — los registros padre de los contratos SLA', path: '/clients' },
      ],
      admin: 'Puedes crear y modificar plantillas SLA para la organizacion.',
    },
    pt: {
      title: 'Contratos e SLAs',
      description: 'Gere acordos de nivel de servico, contratos de manutencao e fluxos de receita recorrente.',
      features: [
        'Define termos de SLA incluindo tempos de resposta e garantias.',
        'Acompanha datas de renovacao e receita recorrente.',
        'Configura alertas para contratos proximos de expirar.',
        'Visualiza reconhecimento de receita por ano fiscal.',
        'Alterna entre vistas Lista e Kanban.',
        'Cobertura do contrato: regista se updates e upgrades estao incluidos e o banco de horas de suporte (ou deixa vazio se nao houver limite de horas) — aparecem como distintivos no cartao do contrato.',
      ],
      steps: [
        '1. Clica em "Novo SLA" para abrir o formulario.',
        '2. Seleciona BU, estado e introduz o nome do cliente.',
        '3. Escolhe responsavel SLA e tipo.',
        '4. Introduz valor anual e datas de inicio/fim.',
        '5. Configura modelo de faturacao e frequencia.',
        '6. Guardar — a receita e projetada automaticamente.',
        '7. Usa a seccao de Renovacao em SLAs ativos para renovar com aumento.',
      ],
      shortcuts: [],
      mistakes: [
        'Nao configurar datas de inicio/fim — as projecoes de receita ficarao vazias.',
        'Esquecer de atualizar o estado apos renovacao.',
        'Criar SLAs sem ligar a um cliente.',
      ],
      seeAlso: [
        { label: 'Negocios — os deals podem converter-se em contratos SLA', path: '/deals' },
        { label: 'Produtos — as linhas referenciam o catalogo', path: '/products' },
        { label: 'Clientes — os registos pai dos contratos SLA', path: '/clients' },
      ],
      admin: 'Podes criar e modificar templates SLA para a organizacao.',
    },
  },

  '/products': {
    en: {
      title: 'Products',
      description: 'Your product catalog. Products can be added as line items to deals and SLA contracts.',
      features: [
        'Manage product names, SKU codes, and pricing (license fee + annual fee).',
        'Set a Brand / Vendor (Fujifilm, Medsky, etc.) per product — the brand routes discount approvals to that brand\'s approver.',
        'Products are grouped by category with collapsible sections.',
        'Configure allowed pricing models (multi-select): License+Annual (CAPEX), Subscription, Pay-per-study, SaaS. For pay-per-study/subscription the "Price per Unit/Study" field is used (e.g. EUR 0.53 per study); Annual Fee only applies to CAPEX.',
        'Configure allowed license types (multi-select): per equipment, per volume (studies), per package, per CCU, flat. E.g. CWM Dose is volume-licensed; Connectivity and CWM-ES are per-equipment.',
        'Compose products from components for bundled offerings.',
        'Toggle active/inactive status and distributor visibility.',
      ],
      steps: [
        '1. Click "New Product" to open the product form.',
        '2. Enter category, SKU, and product name.',
        '3. Select the Brand / Vendor (Fujifilm, Medsky, ...) — this determines who approves discounts.',
        '4. Set license fee and annual fee for CAPEX, or "Price per Unit/Study" for pay-per-study/subscription (list prices in EUR).',
        '5. Select allowed pricing models (License+Annual, Subscription, Pay per Study, SaaS) and license types (per equipment, per volume, per package, per CCU, flat).',
        '6. Choose business unit and toggle Active/Distributor Visible flags.',
        '7. Save — the product is available for deal line items.',
        '8. For bundles, use the Components tab to add sub-products.',
      ],
      shortcuts: [],
      mistakes: [
        'Not setting a category — products will appear ungrouped.',
        'Leaving annual fee at 0 — SLA line items will show zero value.',
        'Setting an Annual Fee for a pay-per-study product — Annual Fee only applies to CAPEX; use Price per Unit/Study instead.',
        'Choosing the wrong Brand / Vendor — discount requests will route to the wrong approver.',
        'Deactivating a product still referenced in active deals — deals keep the old product but new deals cannot select it.',
      ],
      seeAlso: [
        { label: 'Deals — products are added as line items to deals', path: '/deals' },
        { label: 'SLAs — products can be added to contract line items', path: '/sla' },
        { label: 'White-space — identifies missing client-product combinations', path: '/whitespace' },
      ],
      admin: 'You can add, edit, or archive products in the catalog.',
    },
    es: {
      title: 'Productos',
      description: 'Tu catalogo de productos. Los productos se anaden como lineas en deals y contratos SLA.',
      features: [
        'Gestiona nombres, codigos SKU y precios (cuota de licencia + cuota anual) de los productos.',
        'Asigna una Marca / Proveedor (Fujifilm, Medsky, etc.) por producto — la marca enruta las aprobaciones de descuento al aprobador de esa marca.',
        'Productos agrupados por categoria con secciones colapsables.',
        'Configura modelos de precio permitidos (multiseleccion): Licencia+Anual (CAPEX), Suscripcion, Pago por estudio, SaaS. Para pago por estudio/suscripcion se usa el campo "Precio por Unidad/Estudio" (p. ej. EUR 0.53 por estudio); la Cuota Anual solo aplica a CAPEX.',
        'Configura tipos de licencia permitidos (multiseleccion): por equipo, por volumen (estudios), por paquete, por CCU, plano. P. ej. CWM Dose se licencia por volumen; Connectivity y CWM-ES son por equipo.',
        'Compone productos a partir de componentes para ofertas en bundle.',
        'Activa/desactiva el estado y la visibilidad para distribuidores.',
      ],
      steps: [
        '1. Haz clic en "Nuevo Producto" para abrir el formulario.',
        '2. Introduce categoria, SKU y nombre.',
        '3. Selecciona la Marca / Proveedor (Fujifilm, Medsky, ...) — esto determina quien aprueba los descuentos.',
        '4. Establece cuota de licencia y cuota anual para CAPEX, o "Precio por Unidad/Estudio" para pago por estudio/suscripcion (precios de lista en EUR).',
        '5. Selecciona modelos de precio permitidos (Licencia+Anual, Suscripcion, Pago por estudio, SaaS) y tipos de licencia (por equipo, por volumen, por paquete, por CCU, plano).',
        '6. Elige unidad de negocio y activa las flags Activo/Visible para distribuidor.',
        '7. Guardar — el producto esta disponible para lineas en deals.',
        '8. Para bundles, usa la pestana Componentes para anadir subproductos.',
      ],
      shortcuts: [],
      mistakes: [
        'No establecer una categoria — los productos apareceran sin agrupar.',
        'Dejar la cuota anual en 0 — las lineas SLA mostraran valor cero.',
        'Establecer una Cuota Anual para un producto de pago por estudio — la Cuota Anual solo aplica a CAPEX; usa Precio por Unidad/Estudio.',
        'Elegir la Marca / Proveedor incorrecta — las solicitudes de descuento se enrutaran al aprobador equivocado.',
      ],
      seeAlso: [
        { label: 'Oportunidades — los productos se anaden como lineas en deals', path: '/deals' },
        { label: 'SLAs — los productos pueden anadirse a lineas de contrato', path: '/sla' },
      ],
      admin: 'Puedes anadir, editar o archivar productos en el catalogo.',
    },
    pt: {
      title: 'Produtos',
      description: 'O teu catalogo de produtos. Os produtos sao adicionados como linhas em deals e contratos SLA.',
      features: [
        'Gere nomes, codigos SKU e precos (taxa de licenca + taxa anual) dos produtos.',
        'Atribui uma Marca / Fornecedor (Fujifilm, Medsky, etc.) por produto — a marca encaminha as aprovacoes de desconto para o aprovador dessa marca.',
        'Produtos agrupados por categoria com seccoes recolhiveis.',
        'Configura modelos de preco permitidos (multiplas escolhas): Licenca+Anual (CAPEX), Subscricao, Pagamento por estudo, SaaS. Para pagamento por estudo/subscricao usa-se o campo "Preco por Unidade/Estudo" (p. ex. EUR 0.53 por estudo); a Taxa Anual so se aplica a CAPEX.',
        'Configura tipos de licenca permitidos (multiplas escolhas): por equipamento, por volume (estudos), por pacote, por CCU, plano. P. ex. CWM Dose e licenciado por volume; Connectivity e CWM-ES sao por equipamento.',
        'Compoe produtos a partir de componentes para ofertas em bundle.',
        'Liga/desliga o estado e a visibilidade para distribuidores.',
      ],
      steps: [
        '1. Clica em "Novo Produto" para abrir o formulario.',
        '2. Introduz categoria, SKU e nome.',
        '3. Seleciona a Marca / Fornecedor (Fujifilm, Medsky, ...) — isto determina quem aprova os descontos.',
        '4. Define taxa de licenca e taxa anual para CAPEX, ou "Preco por Unidade/Estudo" para pagamento por estudo/subscricao (precos de tabela em EUR).',
        '5. Seleciona modelos de preco permitidos (Licenca+Anual, Subscricao, Pagamento por estudo, SaaS) e tipos de licenca (por equipamento, por volume, por pacote, por CCU, plano).',
        '6. Escolhe unidade de negocio e ativa as flags Ativo/Visivel para distribuidor.',
        '7. Guardar — o produto fica disponivel para linhas em deals.',
        '8. Para bundles, usa o separador Componentes para adicionar subprodutos.',
      ],
      shortcuts: [],
      mistakes: [
        'Nao definir uma categoria — os produtos aparecerao sem agrupamento.',
        'Deixar a taxa anual em 0 — as linhas SLA mostrarao valor zero.',
        'Definir uma Taxa Anual para um produto de pagamento por estudo — a Taxa Anual so se aplica a CAPEX; usa Preco por Unidade/Estudo.',
        'Escolher a Marca / Fornecedor incorreta — os pedidos de desconto serao encaminhados para o aprovador errado.',
      ],
      seeAlso: [
        { label: 'Negocios — os produtos sao adicionados como linhas em deals', path: '/deals' },
        { label: 'SLAs — os produtos podem ser adicionados a linhas de contrato', path: '/sla' },
      ],
      admin: 'Podes adicionar, editar ou arquivar produtos no catalogo.',
    },
  },

  '/budget': {
    en: {
      title: 'Budget',
      description: 'Financial planning with Profit & Loss views and Forecast (FCT) tracking across budget cycles.',
      features: [
        'Compare actual revenue against budget targets (BUD, EST1, EST2, ACT).',
        'View P&L breakdowns by business unit (VGT, ECT, Iberia).',
        'FCT tab shows rolling forecasts based on pipeline data.',
        'Period filters: Full Year, Q1-Q4, H1, H2.',
        'Comparison mode: ACT vs BUD, ACT vs EST1, etc.',
      ],
      steps: [
        '1. Choose Edit or Compare mode, then pick the BU (VGT / ECT / Iberia) at the top.',
        '2. In Edit mode, click one of the three cycle cards (BUD, EST1, EST2) to select the cycle to edit.',
        '3. Enter values for input rows (NS Internal, NS External, COGS, etc.).',
        '4. Derived rows (Net Sales, Gross Margin, OP1, OP2) compute automatically.',
        '5. Click "Save changes" to persist your edits.',
        '6. Use Compare mode to see variance between two cycles (ACT vs BUD, etc.).',
      ],
      shortcuts: [
        'Tab — Move between cells in the budget grid.',
      ],
      mistakes: [
        'Editing the wrong cycle — check the active cycle badge before entering data.',
        'Not saving after editing — changes are lost when navigating away.',
        'Entering values in thousands when the grid expects actual values (or vice versa).',
      ],
      seeAlso: [
        { label: 'Dashboard — gauges compare actuals against these budget targets', path: '/' },
        { label: 'Quotas — individual sales targets derived from budget', path: '/quotas' },
        { label: 'History — view last year actual results', path: '/history' },
      ],
      admin: 'You can set and adjust budget targets for all business units.',
    },
    es: {
      title: 'Presupuesto',
      description: 'Planificacion financiera con vistas de P&L y seguimiento de prevision (FCT) por ciclos.',
      features: [
        'Compara ingresos reales contra objetivos de presupuesto.',
        'Vista de P&L por unidad de negocio.',
        'Pestana FCT con previsiones rolling.',
        'Filtros de periodo: Ano Completo, Q1-Q4, H1, H2.',
      ],
      steps: [
        '1. Selecciona la pestana de BU (VGT / ECT / Iberia).',
        '2. Elige el ciclo de presupuesto.',
        '3. Selecciona el periodo.',
        '4. Introduce valores para las filas de entrada.',
        '5. Las filas derivadas se calculan automaticamente.',
        '6. Haz clic en "Guardar cambios".',
      ],
      shortcuts: ['Tab — Mover entre celdas en la rejilla.'],
      mistakes: [
        'Editar el ciclo incorrecto — verifica la insignia de ciclo activo.',
        'No guardar despues de editar.',
      ],
      seeAlso: [
        { label: 'Panel — los gauges comparan reales contra estos objetivos', path: '/' },
        { label: 'Objetivos — objetivos individuales derivados del presupuesto', path: '/quotas' },
      ],
      admin: 'Puedes establecer y ajustar objetivos para todas las unidades.',
    },
    pt: {
      title: 'Orcamento',
      description: 'Planeamento financeiro com vistas de P&L e acompanhamento de previsao (FCT) por ciclos.',
      features: [
        'Compara receita real contra objetivos de orcamento.',
        'Vista de P&L por unidade de negocio.',
        'Aba FCT com previsoes rolling.',
        'Filtros de periodo: Ano Completo, Q1-Q4, H1, H2.',
      ],
      steps: [
        '1. Seleciona a aba de BU (VGT / ECT / Iberia).',
        '2. Escolhe o ciclo de orcamento.',
        '3. Seleciona o periodo.',
        '4. Introduz valores para as linhas de entrada.',
        '5. As linhas derivadas calculam-se automaticamente.',
        '6. Clica em "Guardar alteracoes".',
      ],
      shortcuts: ['Tab — Mover entre celulas na grelha.'],
      mistakes: [
        'Editar o ciclo errado — verifica a insignia de ciclo ativo.',
        'Nao guardar apos editar.',
      ],
      seeAlso: [
        { label: 'Painel — os gauges comparam reais contra estes objetivos', path: '/' },
        { label: 'Objetivos — objetivos individuais derivados do orcamento', path: '/quotas' },
      ],
      admin: 'Podes definir e ajustar objetivos para todas as unidades.',
    },
  },

  '/network': {
    en: {
      title: 'Network',
      description: 'Manage your distribution network including distributors, hubs, and their associated territories.',
      features: [
        'View and manage distributor relationships.',
        'Track hub locations and their associated territories.',
        'Link network entities to deals and clients.',
        'See performance metrics per distributor: pipeline, invoiced, target attainment.',
      ],
      steps: [
        '1. View the list of distributors and hubs.',
        '2. Click a distributor to see their dashboard: deals, clients, and target.',
        '3. Use the admin panel to add new distributors or hubs.',
        '4. Link distributors to client records and deals for chain tracking.',
      ],
      shortcuts: [],
      mistakes: [
        'Not linking distributors to deals — distribution margin calculations will be missing.',
        'Creating duplicate distributor records for the same partner.',
      ],
      seeAlso: [
        { label: 'Deals — distribution chain and margin per level', path: '/deals' },
        { label: 'Clients — link clients to their distributor', path: '/clients' },
      ],
      admin: 'You can configure network hierarchy and assign territories.',
    },
    es: {
      title: 'Red',
      description: 'Gestiona tu red de distribucion incluyendo distribuidores, hubs y sus territorios.',
      features: [
        'Ve y gestiona relaciones con distribuidores.',
        'Rastrea ubicaciones de hubs y sus territorios asociados.',
        'Vincula entidades de red a deals y clientes.',
      ],
      steps: [
        '1. Ve la lista de distribuidores y hubs.',
        '2. Haz clic en un distribuidor para ver su panel.',
        '3. Usa el panel admin para anadir nuevos distribuidores.',
        '4. Vincula distribuidores a clientes y deals.',
      ],
      shortcuts: [],
      mistakes: [
        'No vincular distribuidores a deals — faltaran calculos de margen.',
        'Crear registros duplicados de distribuidores.',
      ],
      seeAlso: [
        { label: 'Oportunidades — cadena de distribucion y margen por nivel', path: '/deals' },
        { label: 'Clientes — vincula clientes a su distribuidor', path: '/clients' },
      ],
      admin: 'Puedes configurar la jerarquia de red y asignar territorios.',
    },
    pt: {
      title: 'Rede',
      description: 'Gere a tua rede de distribuicao incluindo distribuidores, hubs e seus territorios.',
      features: [
        'Ve e gere relacoes com distribuidores.',
        'Acompanha localizacoes de hubs e seus territorios associados.',
        'Liga entidades de rede a deals e clientes.',
      ],
      steps: [
        '1. Ve a lista de distribuidores e hubs.',
        '2. Clica num distribuidor para ver o seu painel.',
        '3. Usa o painel admin para adicionar novos distribuidores.',
        '4. Liga distribuidores a clientes e deals.',
      ],
      shortcuts: [],
      mistakes: [
        'Nao ligar distribuidores a deals — faltarao calculos de margem.',
        'Criar registos duplicados de distribuidores.',
      ],
      seeAlso: [
        { label: 'Negocios — cadeia de distribuicao e margem por nivel', path: '/deals' },
        { label: 'Clientes — liga clientes ao seu distribuidor', path: '/clients' },
      ],
      admin: 'Podes configurar a hierarquia de rede e atribuir territorios.',
    },
  },

  '/quotas': {
    en: {
      title: 'Quotas',
      description: 'Sales quota tracking and target management for individuals and teams across the fiscal year.',
      features: [
        'View quota attainment percentages and progress bars.',
        'Compare performance across team members or periods.',
        'See actuals (invoiced) vs forecast (backlog + invoiced) vs target.',
        'Team rollup shows consolidated performance.',
      ],
      steps: [
        '1. View the quota table showing each sales owner.',
        '2. Compare Actuals vs Forecast vs Target columns.',
        '3. Click a row to see monthly breakdown.',
        '4. Admins can edit targets by clicking the edit button.',
      ],
      shortcuts: [],
      mistakes: [
        'Comparing individual targets without checking team rollup — individual goals may not sum to team target.',
      ],
      seeAlso: [
        { label: 'Budget — team-level targets that feed quota assignments', path: '/budget' },
        { label: 'Dashboard — quota attainment gauges', path: '/' },
        { label: 'Deals — the deals that drive actuals and forecast', path: '/deals' },
      ],
      admin: 'You can set and adjust quotas for all team members across both BUs.',
      member: 'As a sales rep you see only your own target for your BU. Managers see the whole team.',
      distributor: 'Your FY26 sales target and progress.',
    },
    es: {
      title: 'Objetivos de Ventas',
      description: 'Seguimiento de cuotas y gestion de objetivos para individuos y equipos.',
      features: [
        'Ve porcentajes de consecucion y barras de progreso.',
        'Compara rendimiento entre miembros del equipo.',
        'Ve reales vs prevision vs objetivo.',
      ],
      steps: [
        '1. Ve la tabla de cuotas mostrando cada responsable.',
        '2. Compara columnas de Reales vs Prevision vs Objetivo.',
        '3. Haz clic en una fila para ver desglose mensual.',
        '4. Los admins pueden editar objetivos.',
      ],
      shortcuts: [],
      mistakes: ['Comparar objetivos individuales sin verificar el total del equipo.'],
      seeAlso: [
        { label: 'Presupuesto — objetivos de equipo que alimentan las cuotas', path: '/budget' },
        { label: 'Panel — gauges de consecucion', path: '/' },
      ],
      admin: 'Puedes establecer y ajustar cuotas para todos los miembros de ambas unidades.',
      member: 'Como comercial solo ves tu propio objetivo de tu unidad. Los managers ven todo el equipo.',
      distributor: 'Tu objetivo de ventas FY26 y tu progreso.',
    },
    pt: {
      title: 'Objetivos de Vendas',
      description: 'Acompanhamento de quotas e gestao de objetivos para individuos e equipas.',
      features: [
        'Ve percentagens de consecucao e barras de progresso.',
        'Compara desempenho entre membros da equipa.',
        'Ve reais vs previsao vs objetivo.',
      ],
      steps: [
        '1. Ve a tabela de quotas mostrando cada responsavel.',
        '2. Compara colunas de Reais vs Previsao vs Objetivo.',
        '3. Clica numa linha para ver detalhe mensal.',
        '4. Os admins podem editar objetivos.',
      ],
      shortcuts: [],
      mistakes: ['Comparar objetivos individuais sem verificar o total da equipa.'],
      seeAlso: [
        { label: 'Orcamento — objetivos de equipa que alimentam as quotas', path: '/budget' },
        { label: 'Painel — gauges de consecucao', path: '/' },
      ],
      admin: 'Podes definir e ajustar quotas para todos os membros de ambas as unidades.',
      member: 'Como comercial ves apenas o teu proprio objetivo da tua unidade. Os managers veem toda a equipa.',
      distributor: 'O teu objetivo de vendas FY26 e o teu progresso.',
    },
  },

  '/whitespace': {
    en: {
      title: 'WhiteSpace',
      description: 'Identify untapped opportunities by analyzing gaps in your client-product coverage matrix.',
      features: [
        'The matrix shows clients vs. products — gaps highlight upsell opportunities.',
        'Click a cell to see existing deals or create a new one for that combination.',
        'Color-coded cells: green = active deal, yellow = pipeline, empty = whitespace opportunity.',
      ],
      steps: [
        '1. Review the matrix — rows are clients, columns are products.',
        '2. Look for empty cells — these are potential upsell opportunities.',
        '3. Click an empty cell to create a new deal for that client-product pair.',
        '4. Click a filled cell to view or edit the existing deal.',
      ],
      shortcuts: [],
      mistakes: [
        'Ignoring cells that show pipeline deals — they may need follow-up to close.',
        'Not filtering by BU first — the matrix may be too large to read.',
      ],
      seeAlso: [
        { label: 'Deals — create deals directly from whitespace gaps', path: '/deals' },
        { label: 'Products — the product catalog shown as columns', path: '/products' },
        { label: 'Clients — the client list shown as rows', path: '/clients' },
      ],
      admin: 'You can see whitespace data across all business units.',
    },
    es: {
      title: 'Oportunidades',
      description: 'Identifica oportunidades sin explotar analizando gaps en la cobertura cliente-producto.',
      features: [
        'La matriz muestra clientes vs productos — los huecos destacan oportunidades de upsell.',
        'Haz clic en una celda para ver deals existentes o crear uno nuevo.',
      ],
      steps: [
        '1. Revisa la matriz — filas son clientes, columnas son productos.',
        '2. Busca celdas vacias — son oportunidades potenciales.',
        '3. Haz clic en una celda vacia para crear un nuevo deal.',
        '4. Haz clic en una celda llena para ver o editar el deal existente.',
      ],
      shortcuts: [],
      mistakes: ['No filtrar por BU primero — la matriz puede ser demasiado grande.'],
      seeAlso: [
        { label: 'Oportunidades — crea deals directamente desde los gaps', path: '/deals' },
        { label: 'Productos — el catalogo mostrado como columnas', path: '/products' },
      ],
      admin: 'Puedes ver datos de whitespace de todas las unidades.',
    },
    pt: {
      title: 'Oportunidades',
      description: 'Identifica oportunidades nao exploradas analisando gaps na cobertura cliente-produto.',
      features: [
        'A matriz mostra clientes vs produtos — os vazios destacam oportunidades de upsell.',
        'Clica numa celula para ver deals existentes ou criar um novo.',
      ],
      steps: [
        '1. Revisa a matriz — linhas sao clientes, colunas sao produtos.',
        '2. Procura celulas vazias — sao oportunidades potenciais.',
        '3. Clica numa celula vazia para criar um novo deal.',
        '4. Clica numa celula preenchida para ver ou editar o deal existente.',
      ],
      shortcuts: [],
      mistakes: ['Nao filtrar por BU primeiro — a matriz pode ser demasiado grande.'],
      seeAlso: [
        { label: 'Negocios — cria deals diretamente dos gaps', path: '/deals' },
        { label: 'Produtos — o catalogo mostrado como colunas', path: '/products' },
      ],
      admin: 'Podes ver dados de whitespace de todas as unidades.',
    },
  },

  '/history': {
    en: {
      title: 'History',
      description: 'Browse historical deal data and track actual results from previous fiscal years.',
      features: [
        'View past deal stages, amounts, and outcomes.',
        'Filter history by date range, client, or deal owner.',
        'Monthly Net Sales and Gross Margin charts for FY25.',
        'Compare VGT vs ECT performance historically.',
      ],
      steps: [
        '1. Review the KPI summary cards at the top.',
        '2. Scroll down to see monthly charts.',
        '3. Use the detail table for month-by-month breakdown.',
      ],
      shortcuts: [],
      mistakes: [
        'Comparing FY25 actuals with FY26 forecasts without accounting for seasonality.',
      ],
      seeAlso: [
        { label: 'Budget — current year targets vs last year actuals', path: '/budget' },
        { label: 'Dashboard — current year performance', path: '/' },
      ],
      admin: 'You can toggle between VGT, ECT, and Iberia (consolidated).',
      member: 'You see only your own BU\'s historical results.',
      distributor: 'Your historical sales data.',
    },
    es: {
      title: 'Historial',
      description: 'Consulta datos historicos de deals y resultados reales de anos fiscales anteriores.',
      features: [
        'Ve etapas, importes y resultados pasados.',
        'Filtra historial por rango de fechas, cliente o responsable.',
        'Graficos mensuales de Ventas Netas y Margen Bruto.',
      ],
      steps: [
        '1. Revisa los resumes KPI en la parte superior.',
        '2. Desplazate para ver graficos mensuales.',
        '3. Usa la tabla de detalle para desglose mes a mes.',
      ],
      shortcuts: [],
      mistakes: ['Comparar reales FY25 con previsiones FY26 sin considerar estacionalidad.'],
      seeAlso: [
        { label: 'Presupuesto — objetivos actuales vs reales del ano pasado', path: '/budget' },
        { label: 'Panel — rendimiento del ano actual', path: '/' },
      ],
      admin: 'Puedes alternar entre VGT, ECT e Iberia (consolidado).',
      member: 'Solo ves los resultados historicos de tu propia unidad.',
      distributor: 'Tus datos historicos de ventas.',
    },
    pt: {
      title: 'Historico',
      description: 'Consulta dados historicos de deals e resultados reais de anos fiscais anteriores.',
      features: [
        'Ve fases, montantes e resultados passados.',
        'Filtra historico por intervalo de datas, cliente ou responsavel.',
        'Graficos mensais de Vendas Liquidas e Margem Bruta.',
      ],
      steps: [
        '1. Revisa os resumos KPI no topo.',
        '2. Desce para ver graficos mensais.',
        '3. Usa a tabela de detalhe para detalhe mes a mes.',
      ],
      shortcuts: [],
      mistakes: ['Comparar reais FY25 com previsoes FY26 sem considerar sazonalidade.'],
      seeAlso: [
        { label: 'Orcamento — objetivos atuais vs reais do ano passado', path: '/budget' },
        { label: 'Painel — desempenho do ano atual', path: '/' },
      ],
      admin: 'Podes alternar entre VGT, ECT e Iberia (consolidado).',
      member: 'Ves apenas os resultados historicos da tua propria unidade.',
      distributor: 'Os teus dados historicos de vendas.',
    },
  },

  '/settings': {
    en: {
      title: 'Settings',
      description: 'Configure application preferences, business units, stages, currency, and system-wide parameters.',
      features: [
        'Manage deal stages, forecast categories, and currency settings.',
        'Configure business unit structure and team assignments.',
        'Adjust system-wide defaults and display options.',
        'Exchange rate configuration for multi-currency deals.',
      ],
      steps: [
        '1. Navigate through the settings sections.',
        '2. Modify values as needed.',
        '3. Save — changes take effect immediately for all users.',
      ],
      shortcuts: [],
      mistakes: [
        'Changing deal stages without updating existing deals — they may become orphaned.',
        'Modifying exchange rates — changes apply to future deals only, not retroactively.',
      ],
      seeAlso: [
        { label: 'Permissions — control who can access which pages', path: '/permissions' },
        { label: 'Users — manage user accounts and roles', path: '/users' },
      ],
      admin: 'Full access to all settings. Changes affect all users in the organization.',
    },
    es: {
      title: 'Configuracion',
      description: 'Configura preferencias, unidades de negocio, etapas, moneda y parametros del sistema.',
      features: [
        'Gestiona etapas de deals, categorias de prevision y moneda.',
        'Configura estructura de unidades de negocio.',
        'Ajusta valores por defecto del sistema.',
      ],
      steps: [
        '1. Navega por las secciones de configuracion.',
        '2. Modifica los valores necesarios.',
        '3. Guardar — los cambios se aplican inmediatamente.',
      ],
      shortcuts: [],
      mistakes: [
        'Cambiar etapas de deals sin actualizar deals existentes.',
        'Modificar tasas de cambio — los cambios aplican solo a deals futuros.',
      ],
      seeAlso: [
        { label: 'Permisos — controla quien accede a que paginas', path: '/permissions' },
      ],
      admin: 'Acceso completo a toda la configuracion. Los cambios afectan a todos los usuarios.',
    },
    pt: {
      title: 'Definicoes',
      description: 'Configura preferencias, unidades de negocio, fases, moeda e parametros do sistema.',
      features: [
        'Gere fases de deals, categorias de previsao e moeda.',
        'Configura estrutura de unidades de negocio.',
        'Ajusta valores por defeito do sistema.',
      ],
      steps: [
        '1. Navega pelas seccoes de configuracao.',
        '2. Modifica os valores necessarios.',
        '3. Guardar — as alteracoes aplicam-se imediatamente.',
      ],
      shortcuts: [],
      mistakes: [
        'Mudar fases de deals sem atualizar deals existentes.',
        'Modificar taxas de cambio — as alteracoes aplicam-se apenas a deals futuros.',
      ],
      seeAlso: [
        { label: 'Permissoes — controla quem acede a que paginas', path: '/permissions' },
      ],
      admin: 'Acesso completo a todas as definicoes. As alteracoes afetam todos os utilizadores.',
    },
  },

  '/permissions': {
    en: {
      title: 'Permissions',
      description: 'Manage user roles and permission sets that control access throughout the application.',
      features: [
        'Create custom permission sets with granular page-level access.',
        'Assign permission sets to users to override default role permissions.',
        'Control edit, delete, and visibility scopes per permission set.',
        'Manage user invitations and account activation.',
        'Edit a user\'s full name and role directly in their card — reuse an account without re-inviting.',
        'Set a user\'s Business Unit (VGT / ECT) directly when inviting or editing — no need to create an internal company first.',
        'Assign a user as the Discount Approver for specific brands (e.g. Medsky); they then see only the Approvals page for their brands.',
        'Configure per-company, per-country product authorizations with an optional price override (leave empty to use the catalog price).',
        'Set annual Sales Targets per distributor / company, shown in the Companies tab.',
      ],
      steps: [
        '1. View existing permission sets in the "Permission Sets" tab.',
        '2. Click "New set" to create a custom permission template.',
        '3. Name the set, select accessible pages, and configure actions (edit/delete).',
        '4. Switch to the "Users" tab to assign permission sets and set the Business Unit (VGT/ECT).',
        '5. Use "Add user" to invite new users via email.',
        '6. To make a user a brand approver, assign them as Discount Approver for the relevant brands.',
        '7. In the Companies tab, set product authorizations per country (with optional price override) and annual sales targets.',
      ],
      shortcuts: [],
      mistakes: [
        'Removing page access without warning users — they will see a restricted message.',
        'Not assigning a permission set — user falls back to their role defaults.',
        'Editing your own permissions — you cannot modify your own profile from this page.',
        'Forgetting to set the Business Unit — the user may not see the right pipeline.',
        'Not assigning a brand approver — discount requests for that brand will have no one to route to.',
        'Setting a price override when you meant to use the catalog price — leave it empty to inherit the catalog price.',
      ],
      seeAlso: [
        { label: 'Settings — system-wide configuration', path: '/settings' },
        { label: 'Audit Log — track permission changes', path: '/audit' },
      ],
      admin: 'You are managing permissions for all users. Be careful with changes — they take effect immediately. You also manage BU assignments, brand discount approvers, company product authorizations, and sales targets.',
    },
    es: {
      title: 'Permisos',
      description: 'Gestiona roles de usuario y conjuntos de permisos que controlan el acceso en la aplicacion.',
      features: [
        'Crea conjuntos de permisos personalizados con acceso granular por pagina.',
        'Asigna conjuntos a usuarios para anular los permisos por defecto.',
        'Controla edicion, eliminacion y visibilidad por conjunto.',
        'Edita el nombre y el rol del usuario directamente en su tarjeta — reutiliza una cuenta sin reinvitar.',
        'Establece la Unidad de Negocio (VGT / ECT) del usuario directamente al invitar o editar — sin necesidad de crear primero una empresa interna.',
        'Asigna a un usuario como Aprobador de Descuentos de marcas concretas (p. ej. Medsky); entonces solo ve la pagina de Aprobaciones de sus marcas.',
        'Configura autorizaciones de producto por empresa y por pais, con sobreescritura de precio opcional (dejalo vacio para usar el precio del catalogo).',
        'Establece Objetivos de Ventas anuales por distribuidor / empresa, mostrados en la pestana Empresas.',
      ],
      steps: [
        '1. Ve los conjuntos existentes en la pestana "Conjuntos".',
        '2. Haz clic en "Nuevo conjunto" para crear una plantilla.',
        '3. Nombra el conjunto, selecciona paginas y configura acciones.',
        '4. Cambia a la pestana "Usuarios" para asignar conjuntos y establecer la Unidad de Negocio (VGT/ECT).',
        '5. Usa "Anadir usuario" para invitar via email.',
        '6. Para hacer a un usuario aprobador de marca, asignalo como Aprobador de Descuentos de las marcas correspondientes.',
        '7. En la pestana Empresas, configura autorizaciones de producto por pais (con sobreescritura de precio opcional) y objetivos de ventas anuales.',
      ],
      shortcuts: [],
      mistakes: [
        'Quitar acceso a paginas sin avisar a los usuarios.',
        'No asignar un conjunto de permisos — el usuario usa los valores por defecto del rol.',
        'Olvidar establecer la Unidad de Negocio — el usuario puede no ver el pipeline correcto.',
        'No asignar un aprobador de marca — las solicitudes de descuento de esa marca no tendran a quien enrutarse.',
        'Establecer una sobreescritura de precio cuando querias usar el precio del catalogo — dejalo vacio para heredar el precio del catalogo.',
      ],
      seeAlso: [
        { label: 'Configuracion — configuracion del sistema', path: '/settings' },
        { label: 'Auditoria — rastrea cambios de permisos', path: '/audit' },
      ],
      admin: 'Gestionas permisos para todos los usuarios. Los cambios aplican inmediatamente. Tambien gestionas asignaciones de BU, aprobadores de descuento por marca, autorizaciones de producto por empresa y objetivos de ventas.',
    },
    pt: {
      title: 'Permissoes',
      description: 'Gere papeis de utilizador e conjuntos de permissoes que controlam o acesso na aplicacao.',
      features: [
        'Cria conjuntos de permissoes personalizados com acesso granular por pagina.',
        'Atribui conjuntos a utilizadores para substituir permissoes por defeito.',
        'Controla edicao, eliminacao e visibilidade por conjunto.',
        'Edita o nome e o cargo (role) do utilizador diretamente no cartao — reutiliza uma conta sem reconvidar.',
        'Define a Unidade de Negocio (VGT / ECT) do utilizador diretamente ao convidar ou editar — sem necessidade de criar primeiro uma empresa interna.',
        'Atribui um utilizador como Aprovador de Descontos de marcas especificas (p. ex. Medsky); passa entao a ver apenas a pagina de Aprovacoes das suas marcas.',
        'Configura autorizacoes de produto por empresa e por pais, com substituicao de preco opcional (deixa vazio para usar o preco do catalogo).',
        'Define Objetivos de Vendas anuais por distribuidor / empresa, mostrados no separador Empresas.',
      ],
      steps: [
        '1. Ve os conjuntos existentes na aba "Conjuntos".',
        '2. Clica em "Novo conjunto" para criar um template.',
        '3. Nomeia o conjunto, seleciona paginas e configura acoes.',
        '4. Muda para a aba "Utilizadores" para atribuir conjuntos e definir a Unidade de Negocio (VGT/ECT).',
        '5. Usa "Adicionar utilizador" para convidar via email.',
        '6. Para tornar um utilizador aprovador de marca, atribui-o como Aprovador de Descontos das marcas correspondentes.',
        '7. No separador Empresas, configura autorizacoes de produto por pais (com substituicao de preco opcional) e objetivos de vendas anuais.',
      ],
      shortcuts: [],
      mistakes: [
        'Remover acesso a paginas sem avisar os utilizadores.',
        'Nao atribuir um conjunto de permissoes — o utilizador usa os valores por defeito do perfil.',
        'Esquecer de definir a Unidade de Negocio — o utilizador pode nao ver o pipeline correto.',
        'Nao atribuir um aprovador de marca — os pedidos de desconto dessa marca nao terao para quem ser encaminhados.',
        'Definir uma substituicao de preco quando pretendias usar o preco do catalogo — deixa vazio para herdar o preco do catalogo.',
      ],
      seeAlso: [
        { label: 'Definicoes — configuracao do sistema', path: '/settings' },
        { label: 'Auditoria — acompanha alteracoes de permissoes', path: '/audit' },
      ],
      admin: 'Geres permissoes para todos os utilizadores. As alteracoes aplicam-se imediatamente. Tambem geres atribuicoes de BU, aprovadores de desconto por marca, autorizacoes de produto por empresa e objetivos de vendas.',
    },
  },

  '/audit': {
    en: {
      title: 'Audit Log',
      description: 'Track all changes made across the system for compliance and accountability.',
      features: [
        'View who changed what and when, with before/after values.',
        'Filter by user, entity type, or date range.',
        'Search the audit trail by keyword.',
      ],
      steps: [
        '1. Browse the chronological list of changes.',
        '2. Use filters to narrow by user, entity, or date.',
        '3. Expand an entry to see before/after field values.',
      ],
      shortcuts: [],
      mistakes: [
        'Searching too broadly — use entity type filters to narrow results.',
      ],
      seeAlso: [
        { label: 'Permissions — audit who changed permission configurations', path: '/permissions' },
        { label: 'Deals — the most frequently audited entity', path: '/deals' },
      ],
      admin: 'You have full access to the audit trail. Use this to investigate data discrepancies.',
    },
    es: {
      title: 'Auditoria',
      description: 'Rastrea todos los cambios realizados en el sistema para cumplimiento y responsabilidad.',
      features: [
        'Ve quien cambio que y cuando, con valores antes/despues.',
        'Filtra por usuario, tipo de entidad o rango de fechas.',
      ],
      steps: [
        '1. Navega la lista cronologica de cambios.',
        '2. Usa filtros para acotar por usuario, entidad o fecha.',
        '3. Expande una entrada para ver valores antes/despues.',
      ],
      shortcuts: [],
      mistakes: ['Buscar demasiado amplio — usa filtros de tipo de entidad.'],
      seeAlso: [
        { label: 'Permisos — audita cambios en la configuracion de permisos', path: '/permissions' },
      ],
      admin: 'Tienes acceso completo al rastro de auditoria.',
    },
    pt: {
      title: 'Auditoria',
      description: 'Acompanha todas as alteracoes feitas no sistema para conformidade e responsabilidade.',
      features: [
        'Ve quem mudou o que e quando, com valores antes/depois.',
        'Filtra por utilizador, tipo de entidade ou intervalo de datas.',
      ],
      steps: [
        '1. Navega a lista cronologica de alteracoes.',
        '2. Usa filtros para acotar por utilizador, entidade ou data.',
        '3. Expande uma entrada para ver valores antes/depois.',
      ],
      shortcuts: [],
      mistakes: ['Pesquisar demasiado amplo — usa filtros de tipo de entidade.'],
      seeAlso: [
        { label: 'Permissoes — audita alteracoes na configuracao de permissoes', path: '/permissions' },
      ],
      admin: 'Tens acesso completo ao rasto de auditoria.',
    },
  },
  '/approvals': {
    en: {
      title: 'Discount Approvals',
      description: 'Review and respond to discount requests for the product brands you are responsible for approving.',
      features: [
        'You only see requests for brands assigned to you (e.g. Medsky).',
        'Tabs: Open (pending + counter), Approved, Rejected, All.',
        'Each request shows the client, requested %, and the distributor\'s justification.',
      ],
      steps: [
        '1. Open a pending request and click "Respond".',
        '2. Choose Approve, Counter-offer (propose a different %), or Reject.',
        '3. Optionally add a note, then Submit.',
        '4. The distributor is notified automatically; an approved discount is applied to the deal value.',
      ],
      shortcuts: [],
      mistakes: [
        'Forgetting to add a justification note on a counter-offer — it helps the distributor decide.',
      ],
      seeAlso: [
        { label: 'Deals — see the full deal behind a request', path: '/deals' },
      ],
      admin: 'Admins and managers can approve any brand. Dedicated approvers only see their assigned brands.',
    },
    es: {
      title: 'Aprobacion de Descuentos',
      description: 'Revisa y responde a solicitudes de descuento de las marcas que tienes asignadas para aprobar.',
      features: [
        'Solo ves solicitudes de las marcas asignadas a ti (ej. Medsky).',
        'Pestanas: Abiertas (pendientes + contraoferta), Aprobadas, Rechazadas, Todas.',
        'Cada solicitud muestra el cliente, % solicitado y la justificacion del distribuidor.',
      ],
      steps: [
        '1. Abre una solicitud pendiente y haz clic en "Responder".',
        '2. Elige Aprobar, Contraoferta (propon otro %) o Rechazar.',
        '3. Anade una nota opcional y envia.',
        '4. El distribuidor recibe notificacion; un descuento aprobado se aplica al valor del deal.',
      ],
      shortcuts: [],
      mistakes: [
        'Olvidar anadir una nota de justificacion en una contraoferta — ayuda al distribuidor a decidir.',
      ],
      seeAlso: [
        { label: 'Oportunidades — ver el deal completo detras de una solicitud', path: '/deals' },
      ],
      admin: 'Admins y managers pueden aprobar cualquier marca. Los aprobadores dedicados solo ven sus marcas asignadas.',
    },
    pt: {
      title: 'Aprovacao de Descontos',
      description: 'Reve e responde a pedidos de desconto das marcas pelas quais es responsavel por aprovar.',
      features: [
        'So ves pedidos das marcas que te foram atribuidas (ex. Medsky).',
        'Abas: Abertos (pendentes + contraproposta), Aprovados, Rejeitados, Todos.',
        'Cada pedido mostra o cliente, % pedida e a justificacao do distribuidor.',
      ],
      steps: [
        '1. Abre um pedido pendente e clica em "Responder".',
        '2. Escolhe Aprovar, Contraproposta (propoe outra %) ou Rejeitar.',
        '3. Adiciona uma nota opcional e submete.',
        '4. O distribuidor e notificado automaticamente; um desconto aprovado e aplicado ao valor do deal.',
      ],
      shortcuts: [],
      mistakes: [
        'Esquecer de adicionar uma nota de justificacao numa contraproposta — ajuda o distribuidor a decidir.',
      ],
      seeAlso: [
        { label: 'Negocios — ver o deal completo por tras de um pedido', path: '/deals' },
      ],
      admin: 'Admins e managers podem aprovar qualquer marca. Aprovadores dedicados so veem as suas marcas atribuidas.',
    },
  },
}

const DEFAULT_HELP = {
  en: {
    title: 'Help',
    description: 'Welcome to BusinessBook CRM. Use the navigation menu to access different modules.',
    features: ['Click the help button on any page for context-specific guidance.'],
    steps: [],
    shortcuts: [],
    mistakes: [],
    seeAlso: [],
  },
  es: {
    title: 'Ayuda',
    description: 'Bienvenido a BusinessBook CRM. Usa el menu de navegacion para acceder a los diferentes modulos.',
    features: ['Haz clic en el boton de ayuda en cualquier pagina para orientacion contextual.'],
    steps: [],
    shortcuts: [],
    mistakes: [],
    seeAlso: [],
  },
  pt: {
    title: 'Ajuda',
    description: 'Bem-vindo ao BusinessBook CRM. Usa o menu de navegacao para aceder aos diferentes modulos.',
    features: ['Clica no botao de ajuda em qualquer pagina para orientacao contextual.'],
    steps: [],
    shortcuts: [],
    mistakes: [],
    seeAlso: [],
  },
}

// Section headers per language
const SECTION_LABELS = {
  en: { features: 'Key Features', steps: 'Step-by-Step', shortcuts: 'Keyboard Shortcuts', mistakes: 'Common Mistakes', seeAlso: 'Related Pages', adminTip: 'Admin Tip', distributorTip: 'Distributor Tip', note: 'Note' },
  es: { features: 'Funcionalidades', steps: 'Paso a Paso', shortcuts: 'Atajos de Teclado', mistakes: 'Errores Comunes', seeAlso: 'Paginas Relacionadas', adminTip: 'Consejo Admin', distributorTip: 'Consejo Distribuidor', note: 'Nota' },
  pt: { features: 'Funcionalidades', steps: 'Passo a Passo', shortcuts: 'Atalhos de Teclado', mistakes: 'Erros Comuns', seeAlso: 'Paginas Relacionadas', adminTip: 'Dica Admin', distributorTip: 'Dica Distribuidor', note: 'Nota' },
}

// ── Component ────────────────────────────────────────────────────────────────
export default function HelpGuide() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { profile, role: authRole } = useAuth()
  const { lang } = useTranslation()

  // Close panel on page change
  useEffect(() => { setOpen(false) }, [pathname])

  const helpEntry = HELP[pathname] || DEFAULT_HELP
  const page = helpEntry[lang] || helpEntry['en'] || DEFAULT_HELP['en']
  const labels = SECTION_LABELS[lang] || SECTION_LABELS['en']
  const effectiveRole = profile?.role || authRole
  const roleTip = effectiveRole === 'admin' ? page.admin : effectiveRole === 'distributor' ? page.distributor : effectiveRole === 'viewer' ? page.viewer : null

  return (
    <>
      {/* Floating help button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Open help"
        className="fixed bottom-20 sm:bottom-6 right-4 z-50 w-11 h-11 rounded-full bg-navy text-white shadow-lg flex items-center justify-center hover:bg-navy/90 transition-colors focus:outline-none focus:ring-2 focus:ring-navy/50"
      >
        <HelpCircle size={22} />
      </button>

      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/20 z-[60]" onClick={() => setOpen(false)} />
      )}

      {/* Slide-over panel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 max-w-[90vw] bg-white shadow-2xl z-[70] transform transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{page.title}</h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 60px)' }}>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">{page.description}</p>

          {/* Key Features */}
          {page.features?.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{labels.features}</h3>
              <ul className="space-y-2 mb-4">
                {page.features.map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700 leading-snug">
                    <span className="text-navy mt-0.5 shrink-0">&#8226;</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Step-by-Step */}
          {page.steps?.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{labels.steps}</h3>
              <ol className="space-y-1.5 mb-4">
                {page.steps.map((s, i) => (
                  <li key={i} className="text-sm text-gray-700 leading-snug pl-1">{s}</li>
                ))}
              </ol>
            </>
          )}

          {/* Keyboard Shortcuts */}
          {page.shortcuts?.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{labels.shortcuts}</h3>
              <ul className="space-y-1 mb-4">
                {page.shortcuts.map((s, i) => (
                  <li key={i} className="text-sm text-gray-600 leading-snug font-mono bg-gray-50 px-2 py-1 rounded">{s}</li>
                ))}
              </ul>
            </>
          )}

          {/* Common Mistakes */}
          {page.mistakes?.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-2">{labels.mistakes}</h3>
              <ul className="space-y-2 mb-4">
                {page.mistakes.map((m, i) => (
                  <li key={i} className="flex gap-2 text-sm text-amber-700 leading-snug bg-amber-50 px-3 py-2 rounded-lg">
                    <span className="shrink-0 mt-0.5">&#9888;</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Related Pages */}
          {page.seeAlso?.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{labels.seeAlso}</h3>
              <ul className="space-y-1 mb-4">
                {page.seeAlso.map((link, i) => (
                  <li key={i}>
                    <a href={link.path} className="text-sm text-blue-600 hover:text-blue-800 hover:underline leading-snug block py-0.5">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Role Tip */}
          {roleTip && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mt-2">
              <h3 className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-1">
                {effectiveRole === 'admin' ? labels.adminTip : effectiveRole === 'distributor' ? labels.distributorTip : labels.note}
              </h3>
              <p className="text-sm text-blue-700 leading-snug">{roleTip}</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
