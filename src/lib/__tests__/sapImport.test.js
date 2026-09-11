import { describe, it, expect } from 'vitest'
import { normaliseName, parseNumber, parseSapPaste } from '../sapImport'
import { reconcile } from '../reconcile'

describe('reading a number Excel wrote', () => {
  it('reads both conventions, deciding on the separator that comes last', () => {
    expect(parseNumber('34,633.9')).toBe(34633.9)   // exported from an English machine
    expect(parseNumber('34.633,9')).toBe(34633.9)   // and from a Portuguese one
    expect(parseNumber('492,656.7')).toBe(492656.7)
    expect(parseNumber('1.234.567,89')).toBe(1234567.89)
  })

  it('reads a plain number either way', () => {
    expect(parseNumber('5200')).toBe(5200)
    expect(parseNumber('1.5')).toBe(1.5)
    expect(parseNumber('1,5')).toBe(1.5)
  })

  it('reads a negative, including the accountant parentheses', () => {
    expect(parseNumber('-1,699.6')).toBe(-1699.6)
    expect(parseNumber('(1.699,6)')).toBe(-1699.6)
  })

  it('drops the symbols a copy-paste brings along', () => {
    expect(parseNumber('€ 5 200')).toBe(5200)
    expect(parseNumber('96.98 %')).toBe(96.98)
  })

  it('says nothing rather than zero when it is not a number', () => {
    // A zero here would become revenue nobody invoiced.
    expect(parseNumber('n/a')).toBeNull()
    expect(parseNumber('')).toBeNull()
    expect(parseNumber(null)).toBeNull()
  })
})

describe('matching a customer by name', () => {
  it('sees through case, accents and punctuation', () => {
    expect(normaliseName('Unidade Local de Saúde do Oeste, E.'))
      .toBe(normaliseName('UNIDADE LOCAL DE SAUDE DO OESTE E'))
  })

  it('sees through the legal form, which one system writes and another does not', () => {
    expect(normaliseName('Soerad - Soc. Estudos Radiológicos, Lda'))
      .toBe(normaliseName('SOERAD SOC ESTUDOS RADIOLOGICOS'))
    expect(normaliseName('BANCO BPI, SA.')).toBe(normaliseName('Banco BPI'))
    expect(normaliseName('GHT - Gestão Hospitalar ACE')).toBe(normaliseName('GHT Gestao Hospitalar'))
  })

  it('does not merge two different hospitals', () => {
    expect(normaliseName('Unidade Local de Saúde do Oeste'))
      .not.toBe(normaliseName('Unidade Local de Saúde Matosinhos'))
  })
})

describe('parsing the pasted export', () => {
  const PASTE = [
    'CustomerName\tNet Sales\tGross Margin\tGross Margin %',
    'Unidade Local de Saúde do Oeste, E.\t34,633.9\t33,588.9\t96.98 %',
    'Liga Portuguesa Contra o Cancro\t17,142.0\t8,596.8\t50.15 %',
    'REMAGNA - RESSONANCIA MAGNETICA\t2,916.7\t-1,699.6\t-58.27 %',
    'Total\t492,656.7\t119,108.1\t24.18 %',
  ].join('\n')

  it('reads the rows and leaves out the header and the total', () => {
    const { rows, problems } = parseSapPaste(PASTE)
    expect(rows).toHaveLength(3)
    expect(problems).toEqual([])
    expect(rows[0].net).toBe(34633.9)
    expect(rows[0].margin).toBe(33588.9)
  })

  it('derives the percentage rather than trusting the column', () => {
    const { rows } = parseSapPaste(PASTE)
    expect(rows[0].marginPct).toBe(97)      // 33,588.9 / 34,633.9
    expect(rows[2].marginPct).toBe(-58.3)   // a negative margin survives
  })

  it('flags a row whose own percentage disagrees with its two figures', () => {
    const { rows } = parseSapPaste('Cliente X\t1000\t500\t90 %')
    expect(rows[0].marginPct).toBe(50)
    expect(rows[0].pctMismatch).toBe(true)
  })

  it('reports a line it cannot read instead of dropping it', () => {
    // An import that silently skips three lines is worse than one that refuses.
    const { rows, problems } = parseSapPaste('Good\t100\t50\nBroken line with no numbers')
    expect(rows).toHaveLength(1)
    expect(problems).toHaveLength(1)
    expect(problems[0].why).toBe('columns')
  })

  it('reads a semicolon CSV and a comma CSV as well as a paste', () => {
    expect(parseSapPaste('Cliente A;1.000,50;500,25').rows[0].net).toBe(1000.5)
    expect(parseSapPaste('"Cliente, SA",1000.50,500.25').rows[0].net).toBe(1000.5)
  })

  it('totals what it read, so the screen can be checked against the file', () => {
    const { total } = parseSapPaste(PASTE)
    expect(total.net).toBe(54692.6)
    expect(total.margin).toBe(40486.1)
  })
})

describe('reconciling a month', () => {
  const crm = [
    { key: 'hospital a', name: 'Hospital A', net: 10000, margin: 4000 },
    { key: 'clinica b', name: 'Clinica B', net: 5000, margin: 1000 },
    { key: 'only in crm', name: 'Only in CRM', net: 3000, margin: 900 },
  ]
  const sap = [
    { key: 'hospital a', name: 'HOSPITAL A SA', net: 10000, margin: 4000 },
    { key: 'clinica b', name: 'CLINICA B', net: 7000, margin: 1500 },
    { key: 'only in sap', name: 'ONLY IN SAP', net: 20000, margin: 8000 },
  ]

  it('puts every customer in exactly one bucket', () => {
    const r = reconcile(crm, sap)
    expect(r.matched.map(m => m.key)).toEqual(['clinica b', 'hospital a'])
    expect(r.onlySap.map(m => m.key)).toEqual(['only in sap'])
    expect(r.onlyCrm.map(m => m.key)).toEqual(['only in crm'])
  })

  it('signs the difference from the invoicing side, so positive means the CRM is behind', () => {
    const r = reconcile(crm, sap)
    expect(r.matched.find(m => m.key === 'clinica b').delta).toBe(2000)
    expect(r.matched.find(m => m.key === 'hospital a').agrees).toBe(true)
  })

  it('leads with the biggest difference, which is what gets worked on first', () => {
    expect(reconcile(crm, sap).matched[0].key).toBe('clinica b')
  })

  it('splits the gap into where it comes from, and the three add up to it', () => {
    const { total } = reconcile(crm, sap)
    expect(total.sap).toBe(37000)
    expect(total.crm).toBe(18000)
    expect(total.delta).toBe(19000)
    expect(round(total.fromMissing + total.fromExtra + total.fromDifferences)).toBe(total.delta)
    expect(total.fromMissing).toBe(20000)    // invoiced, never recorded
    expect(total.fromExtra).toBe(-3000)      // recorded, not invoiced
    expect(total.fromDifferences).toBe(2000)
  })

  it('uses an alias where the names cannot be matched by shape', () => {
    const r = reconcile(
      [{ key: 'uls oeste', name: 'ULS Oeste', net: 34633.9, margin: 33588.9 }],
      [{ key: 'unidade local de saude do oeste', name: 'Unidade Local de Saúde do Oeste, E.', net: 34633.9, margin: 33588.9 }],
      [{ sap_key: 'unidade local de saude do oeste', crm_key: 'uls oeste' }],
    )
    expect(r.matched).toHaveLength(1)
    expect(r.matched[0].agrees).toBe(true)
    expect(r.onlySap).toEqual([])
  })

  it('adds two SAP lines that map to one customer rather than keeping the last', () => {
    const r = reconcile(
      [{ key: 'x', name: 'X', net: 300, margin: 100 }],
      [{ key: 'x a', name: 'X A', net: 100, margin: 30 },
       { key: 'x b', name: 'X B', net: 200, margin: 70 }],
      [{ sap_key: 'x a', crm_key: 'x' }, { sap_key: 'x b', crm_key: 'x' }],
    )
    expect(r.matched[0].sapNet).toBe(300)
    expect(r.matched[0].agrees).toBe(true)
  })

  it('says the two agree when they do, which is the answer most months', () => {
    const same = [{ key: 'a', name: 'A', net: 100, margin: 40 }]
    const r = reconcile(same, same)
    expect(r.total.delta).toBe(0)
    expect(r.total.agreeing).toBe(1)
    expect(r.total.differing).toBe(0)
  })
})

function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }
