import { describe, it, expect } from 'vitest'
import { normalizeClient, similarClients } from '../clientMatch'

/**
 * Os casos são reais: saíram todos da tabela a 12-09, quando se descobriu que o
 * Hospital Ramón y Cajal existe duas vezes e que um S maiúsculo separa 1,14 M€
 * do Catsalut em duas linhas.
 */
describe('o nome reduzido ao que identifica a entidade', () => {
  it('ignora acentos, maiúsculas e pontuação', () => {
    expect(normalizeClient('Hospital Ramón y Cajal')).toBe('HOSPITALRAMONYCAJAL')
    expect(normalizeClient('HOSPITAL RAMON Y CAJAL')).toBe('HOSPITALRAMONYCAJAL')
    expect(normalizeClient('CatSalut')).toBe(normalizeClient('Catsalut'))
  })

  it('ignora o sufixo societário', () => {
    expect(normalizeClient('Clínica San Roque')).toBe(normalizeClient('CLINICA SAN ROQUE, S.A.'))
    expect(normalizeClient('Unavets Corp')).toBe(normalizeClient('UNAVETS CORP S.L.U.'))
    expect(normalizeClient('Raconsa')).toBe(normalizeClient('RACONSA, S.L.'))
  })

  it('aguenta o vazio', () => {
    expect(normalizeClient(null)).toBe('')
    expect(normalizeClient('   ')).toBe('')
  })
})

describe('avisar antes de criar um duplicado', () => {
  const existentes = [
    'Hospital Ramón y Cajal',
    'Telefónica Soluciones de Informática',
    'Catsalut',
    'Remagna CRP  3D',
    'Remagna Paiva Raposo 3D',
    'Remagna Portalegre',
    'Unidade Local de Saúde da Cova da Beira',
    'Unidade Local de Saúde do Oeste, E.',
    'Clínica San Roque',
  ]

  it('apanha o mesmo nome escrito de outra maneira', () => {
    const r = similarClients('HOSPITAL RAMON Y CAJAL', existentes)
    expect(r[0].name).toBe('Hospital Ramón y Cajal')
    expect(r[0].reason).toBe('same')
  })

  it('apanha o que difere só no sufixo societário', () => {
    expect(similarClients('CLINICA SAN ROQUE, S.A.', existentes)[0].name).toBe('Clínica San Roque')
  })

  it('apanha um S maiúsculo — os 1,14 M€ do Catsalut', () => {
    expect(similarClients('CatSalut', existentes)[0].name).toBe('Catsalut')
  })

  /** A assinatura do SAP: o nome cortado aos 30 ou 35 caracteres. */
  it('apanha um nome truncado', () => {
    const r = similarClients('TELEFÓNICA SOLUCIONES DE INFORMÁTIC', existentes)
    expect(r[0].name).toBe('Telefónica Soluciones de Informática')
    expect(r[0].reason).toBe('truncated')
  })

  it('apanha uma gralha no meio do nome', () => {
    const r = similarClients('Hospital Ramom y Cajal', existentes)
    expect(r[0].name).toBe('Hospital Ramón y Cajal')
    expect(r[0].reason).toBe('similar')
  })

  /**
   * `RACONSA` acaba em SA sem ser uma sociedade anónima. A primeira versão
   * cortava-lhe o nome para RACON, e a partir daí a Raconsa casava com qualquer
   * cliente começado por essas cinco letras.
   */
  it('não confunde o fim de um nome com uma forma jurídica', () => {
    expect(normalizeClient('Raconsa')).toBe('RACONSA')
    expect(normalizeClient('Raconsa')).toBe(normalizeClient('RACONSA, S.L.'))
  })

  /**
   * O erro que a limpeza por SQL cometeu e que o preview apanhou: `Remagna` é o
   * princípio de sete clínicas Remagna diferentes. Sugerir uma delas seria
   * trocar um duplicado por um negócio atribuído ao sítio errado.
   */
  it('não sugere nada quando o nome curto é o princípio de vários', () => {
    expect(similarClients('Remagna', existentes)).toEqual([])
  })

  it('não confunde duas unidades locais de saúde diferentes', () => {
    const r = similarClients('Unidade Local de Saúde de Matosinhos', existentes)
    expect(r).toEqual([])
  })

  it('não diz nada a um nome genuinamente novo', () => {
    expect(similarClients('Hospital de Braga', existentes)).toEqual([])
  })

  it('não se sugere a si próprio', () => {
    expect(similarClients('Catsalut', existentes)).toEqual([])
  })

  it('cala-se com muito pouco escrito, para não gritar a cada tecla', () => {
    expect(similarClients('Hos', existentes)).toEqual([])
    expect(similarClients('', existentes)).toEqual([])
  })

  it('devolve no máximo os que couberem no ecrã', () => {
    expect(similarClients('Hospital Ramón y Cajal!', existentes, { limit: 1 }).length).toBeLessThanOrEqual(1)
  })
})
