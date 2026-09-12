import { describe, it, expect } from 'vitest'
import { ownsDeal, isUnassigned, ownedBy } from '../dealOwner'

const elio = { id: 'u1', full_name: 'Elio Santos', sales_owner_name: 'Elio Santos' }
const paulo = { id: 'u2', full_name: 'Paulo Cunha', sales_owner_name: null }

describe('de quem é um negócio', () => {
  it('é de quem está atribuído como comercial', () => {
    expect(ownsDeal(elio, { sales_owner: 'Elio Santos' })).toBe(true)
    expect(ownsDeal(paulo, { sales_owner: 'Elio Santos' })).toBe(false)
  })

  it('casa pelo nome completo quando não há nome de comercial no perfil', () => {
    expect(ownsDeal(paulo, { sales_owner: 'Paulo Cunha' })).toBe(true)
  })

  it('ignora espaços a mais e maiúsculas', () => {
    expect(ownsDeal(elio, { sales_owner: '  elio santos ' })).toBe(true)
    expect(ownsDeal(paulo, { sales_owner: 'PAULO CUNHA' })).toBe(true)
  })

  /**
   * O que esta função deliberadamente não faz. Dos 19 nomes que não casam com
   * perfil nenhum, quinze são "Elio" — provavelmente o Élio Santos. Mas um
   * primeiro nome não identifica ninguém, e numa vista pessoal um palpite
   * errado não mostra menos: mostra a carteira de outra pessoa.
   */
  it('não adivinha a partir de um primeiro nome', () => {
    expect(ownsDeal(elio, { sales_owner: 'Elio' })).toBe(false)
    expect(ownsDeal(paulo, { sales_owner: 'Paulo' })).toBe(false)
  })

  /**
   * A armadilha que já entregou a carteira toda: escrito como um `===` simples,
   * um negócio sem comercial casava com um perfil sem nome de comercial —
   * undefined contra undefined — e todos os negócios por atribuir ficavam de
   * toda a gente.
   */
  it('não casa vazio com vazio', () => {
    const semNada = { id: 'u3', full_name: null, sales_owner_name: null }
    expect(ownsDeal(semNada, { sales_owner: null })).toBe(false)
    expect(ownsDeal(semNada, { sales_owner: '   ' })).toBe(false)
    expect(ownsDeal(semNada, {})).toBe(false)
  })

  /**
   * Quem criou conta, mas em último lugar. Medido a 12-09: quem cria é quem é
   * dono em 10 negócios, e é pessoa diferente em 125 — um negócio preparado por
   * nós para um comercial é dele, não nosso.
   */
  it('aceita quem criou, mas só isso', () => {
    expect(ownsDeal(elio, { created_by: 'u1' })).toBe(true)
    expect(ownsDeal(elio, { created_by: 'u2' })).toBe(false)
    // O comercial atribuído ganha: o negócio é de quem o trabalha.
    expect(ownsDeal(paulo, { created_by: 'u1', sales_owner: 'Paulo Cunha' })).toBe(true)
  })

  it('aguenta o que lhe derem', () => {
    expect(ownsDeal(null, { sales_owner: 'Elio Santos' })).toBe(false)
    expect(ownsDeal(elio, null)).toBe(false)
  })
})

describe('um negócio que não é de ninguém', () => {
  it('é o que não tem comercial nem criador', () => {
    expect(isUnassigned({ sales_owner: null, created_by: null })).toBe(true)
    expect(isUnassigned({ sales_owner: '  ', created_by: null })).toBe(true)
  })

  it('não é o que tem um dos dois', () => {
    expect(isUnassigned({ sales_owner: 'Elio Santos' })).toBe(false)
    expect(isUnassigned({ created_by: 'u1' })).toBe(false)
  })
})

describe('a carteira de uma pessoa', () => {
  const book = [
    { id: 1, sales_owner: 'Elio Santos' },
    { id: 2, sales_owner: 'Paulo Cunha' },
    { id: 3, sales_owner: null, created_by: null },   // importado
    { id: 4, sales_owner: null, created_by: null },   // importado
    { id: 5, sales_owner: 'Elio' },                   // primeiro nome, não casa
  ]

  it('devolve só os dela', () => {
    expect(ownedBy(book, elio).deals.map(d => d.id)).toEqual([1])
  })

  /**
   * O ponto todo desta função. Um funil vazio lê-se como "não tens pipeline";
   * se a razão for que nada tem o teu nome, o ecrã tem de o poder dizer.
   */
  it('diz quantos ficaram de fora, e quantos não são de ninguém', () => {
    const r = ownedBy(book, elio)
    expect(r.total).toBe(5)
    expect(r.hidden).toBe(4)
    expect(r.unassigned).toBe(2)
  })

  it('não rebenta sem carteira nem sem perfil', () => {
    expect(ownedBy(null, elio).deals).toEqual([])
    expect(ownedBy(book, null).deals).toEqual([])
    expect(ownedBy(book, null).hidden).toBe(5)
  })
})
