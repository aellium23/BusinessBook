import * as XLSX from 'xlsx'

// Cell positions matching the Japanese HQ Excel templates
// Sales by Product: cols Q-U = EST1 Q1/Q2/Q3/Q4/Year (0-indexed: 16-20)
const SP_COL = { q1: 16, q2: 17, q3: 18, q4: 19, fy: 20 }
const SP_ROWS = {
  pacs_sw: 5, pacs_se: 6, pacs_3p: 7, pacs_total: 8,
  vna_sw: 9, vna_se: 10, vna_3p: 11, vna_total: 12,
  ris_sw: 13, ris_se: 14, ris_3p: 15, ris_total: 16,
  s3d_sw: 17, s3d_se: 18, s3d_3p: 19, s3d_total: 20,
  dp_sw: 21, dp_se: 22, dp_scan: 23, dp_3p: 24, dp_total: 25,
  oth_sw: 26, oth_se: 27, oth_3p: 28, oth_total: 29,
  product_total: 30,
  maint_total: 31,
  opex_total: 32,
  it_total: 33,
  new_biz: 39, existing: 40, total_nb: 41,
}

// Internal Sales: cols M-O = EST1 1H/2H/Year (0-indexed: 12-14)
const IS_COL = { h1: 12, h2: 13, fy: 14 }
const IS_ROWS = {
  spain: 8, uk: 10, other_europe: 12, mexico: 14,
  other_latam: 16, middle_east: 18, other_regions: 20,
  total: 22,
}

function setCell(ws, row, col, value) {
  const addr = XLSX.utils.encode_cell({ r: row - 1, c: col })
  if (!ws[addr]) ws[addr] = {}
  ws[addr].v = value
  ws[addr].t = 'n'
}

function ensureRange(ws, maxRow, maxCol) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  if (maxRow - 1 > range.e.r) range.e.r = maxRow - 1
  if (maxCol > range.e.c) range.e.c = maxCol
  ws['!ref'] = XLSX.utils.encode_range(range)
}

export function exportSalesByProduct(sales, bu) {
  const wb = XLSX.utils.book_new()
  const ws = {}
  ws['!ref'] = 'A1:U41'

  // Headers
  setCell(ws, 2, 16, 'FY26'); setCell(ws, 2, 17, 'FY26'); setCell(ws, 2, 18, 'FY26'); setCell(ws, 2, 19, 'FY26'); setCell(ws, 2, 20, 'FY26')
  setCell(ws, 3, 16, '1Q'); setCell(ws, 3, 17, '2Q'); setCell(ws, 3, 18, '3Q'); setCell(ws, 3, 19, '4Q'); setCell(ws, 3, 20, 'Year')
  setCell(ws, 4, 16, 'EST1'); setCell(ws, 4, 17, 'EST1'); setCell(ws, 4, 18, 'EST1'); setCell(ws, 4, 19, 'EST1'); setCell(ws, 4, 20, 'EST1')

  // Labels
  const labels = [
    [5,'A. Product','1.PACS','(1)SW'], [6,'','','(2)SE/ PS'], [7,'','','(3)3rd Party SW / HW'], [8,'','PACS Total'],
    [9,'','2.VNA','(1)SW'], [10,'','','(2)SE/ PS'], [11,'','','(3)3rd Party SW / HW'], [12,'','VNA Total'],
    [13,'','3.RIS','(1)SW'], [14,'','','(2)SE/ PS'], [15,'','','(3)3rd Party SW / HW'], [16,'','RIS Total'],
    [17,'','4.Synapse 3D','(1)SW'], [18,'','','(2)SE/ PS'], [19,'','','(3)3rd Party SW / HW'], [20,'','3D Total'],
    [21,'','5.Pathology','(1)SW'], [22,'','','(2)SE/ PS'], [23,'','','(3)Scanner'], [24,'','','(4)Other 3rd Party'], [25,'','DP Total'],
    [26,'','6.Others','(1)SW'], [27,'','','(2)SE/ PS'], [28,'','','(3)3rd Party SW / HW'], [29,'','Others Total'],
    [30,'','Product total'], [31,'B. Maintenance','Maintenance total'], [32,'C. Rental / MES / OPEX','Rental/MES/OPEX total'],
    [33,'IT total'], [39,'New Business'], [40,'Existing Base Revenue'], [41,'Total'],
  ]
  labels.forEach(([r, ...cells]) => {
    cells.forEach((v, i) => { if (v) setCell(ws, r, 1 + i, v) })
  })

  const q = (arr, i) => (arr[i] || 0) / 1000
  const fy = (arr) => arr.reduce((s, v) => s + v, 0) / 1000

  // Product families → total rows (CRM doesn't split SW/SE/3rdParty)
  const families = { PACS: 'pacs', VNA: 'vna', RIS: 'ris', 'Synapse 3D': 's3d', 'Pathology/DP': 'dp', Others: 'oth' }
  Object.entries(families).forEach(([name, prefix]) => {
    const row = sales.products[name]
    if (!row) return
    const totalRow = SP_ROWS[`${prefix}_total`]
    const thirdRow = SP_ROWS[`${prefix}_3p`] || SP_ROWS[`${prefix}_total`]
    ;[totalRow, thirdRow].forEach(r => {
      setCell(ws, r, SP_COL.q1, q(row, 0))
      setCell(ws, r, SP_COL.q2, q(row, 1))
      setCell(ws, r, SP_COL.q3, q(row, 2))
      setCell(ws, r, SP_COL.q4, q(row, 3))
      setCell(ws, r, SP_COL.fy, fy(row))
    })
  })

  // Totals
  const writeRow = (rowKey, arr) => {
    const r = SP_ROWS[rowKey]
    setCell(ws, r, SP_COL.q1, q(arr, 0)); setCell(ws, r, SP_COL.q2, q(arr, 1))
    setCell(ws, r, SP_COL.q3, q(arr, 2)); setCell(ws, r, SP_COL.q4, q(arr, 3))
    setCell(ws, r, SP_COL.fy, fy(arr))
  }
  const prodTotal = sales.products ? Object.values(sales.products).reduce((s, a) => s.map((v, i) => v + (a[i]||0)), [0,0,0,0]) : [0,0,0,0]
  writeRow('product_total', prodTotal)
  writeRow('maint_total', sales.maint)
  writeRow('opex_total', sales.opex)
  writeRow('it_total', sales.total)
  writeRow('new_biz', sales.newBiz)
  writeRow('existing', sales.existing)
  writeRow('total_nb', sales.total)

  ensureRange(ws, 41, 20)
  const sheetName = bu === 'VGT' ? 'FFPT' : 'HCES'
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `MI_${sheetName}_Sales_by_product_FY26EST1.xlsx`)
}

export function exportInternalSales(internal, bu) {
  const wb = XLSX.utils.book_new()
  const ws = {}
  ws['!ref'] = 'A1:O22'

  // Headers
  setCell(ws, 4, 0, 'Internal sales & MP by country')
  setCell(ws, 5, 12, 'FY26'); setCell(ws, 5, 13, 'FY26'); setCell(ws, 5, 14, 'FY26')
  setCell(ws, 6, 12, '1H'); setCell(ws, 6, 13, '2H'); setCell(ws, 6, 14, 'Year')
  setCell(ws, 7, 12, 'EST1'); setCell(ws, 7, 13, 'EST1'); setCell(ws, 7, 14, 'EST1')

  // Region labels
  const regionLabels = { spain: 'Spain', uk: 'UK', other_europe: 'Other Europe', mexico: 'Mexico', other_latam: 'Other Latin America', middle_east: 'Middle East', other_regions: 'Other regions' }
  Object.entries(regionLabels).forEach(([key, label]) => {
    setCell(ws, IS_ROWS[key], 2, label)
  })
  setCell(ws, IS_ROWS.total, 1, 'Internal Sales')

  // Map EST1Builder region names to template keys
  const regionMap = {
    'Spain': 'spain', 'UK': 'uk', 'Other Europe': 'other_europe',
    'Mexico': 'mexico', 'Other Latin America': 'other_latam',
    'Middle East': 'middle_east', 'Other regions': 'other_regions',
  }

  Object.entries(regionMap).forEach(([name, key]) => {
    const row = internal.rows[name]
    if (!row) return
    const r = IS_ROWS[key]
    setCell(ws, r, IS_COL.h1, row[0] / 1000)
    setCell(ws, r, IS_COL.h2, row[1] / 1000)
    setCell(ws, r, IS_COL.fy, (row[0] + row[1]) / 1000)
  })

  // Total
  const totalH1 = Object.values(regionMap).reduce((s, key) => {
    const name = Object.entries(regionMap).find(([, v]) => v === key)?.[0]
    return s + (internal.rows[name]?.[0] || 0)
  }, 0)
  const totalH2 = Object.values(regionMap).reduce((s, key) => {
    const name = Object.entries(regionMap).find(([, v]) => v === key)?.[0]
    return s + (internal.rows[name]?.[1] || 0)
  }, 0)
  setCell(ws, IS_ROWS.total, IS_COL.h1, totalH1 / 1000)
  setCell(ws, IS_ROWS.total, IS_COL.h2, totalH2 / 1000)
  setCell(ws, IS_ROWS.total, IS_COL.fy, (totalH1 + totalH2) / 1000)

  ensureRange(ws, 22, 14)
  const sheetName = bu === 'VGT' ? 'FFPT Internal sales' : 'HCES Internal sales'
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `MI_${bu === 'VGT' ? 'PT' : 'ES'}_Internal_sales_FY26EST1.xlsx`)
}
