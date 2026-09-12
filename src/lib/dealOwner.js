// De quem é um negócio, e como se sabe.
//
// Esta pergunta tinha uma resposta enterrada dentro do `canEditDeal` e mais
// nenhuma em lado nenhum. A partir do momento em que uma vista pessoal filtra
// por dono, passa a haver dois sítios a perguntá-la — e duas cópias de uma
// regra desta divergem sempre. Fica aqui, uma vez.
//
// A COMPARAÇÃO É POR NOME, e isso é frágil por construção. `deals.sales_owner`
// é texto: se estiver escrito "Elio" e o perfil disser "Elio Santos", são
// pessoas diferentes para o computador. Medido a 12-09: 118 negócios com um nome
// que casa com um perfil, 19 com um nome que não casa — quase todos primeiros
// nomes soltos.
//
// O que esta função faz para melhorar isso é pouco e deliberado: apara espaços
// e ignora maiúsculas. O que NÃO faz é adivinhar que "Elio" é "Elio Santos" —
// um primeiro nome não identifica ninguém, e numa vista pessoal um palpite
// errado mostra a carteira de outra pessoa.
//
// O `created_by` existe e é um identificador a sério, mas não serve para isto:
// medido no mesmo dia, quem criou é quem é dono em 10 negócios e é pessoa
// diferente em 125. Um negócio preparado por nós para um comercial é dele.
// Conta, mas em último lugar.

const clean = v => (typeof v === 'string' ? v.trim().toLowerCase() : '')

/** Iguais, e nenhum vazio — `undefined === undefined` já entregou a carteira toda. */
const same = (a, b) => {
  const x = clean(a)
  return !!x && x === clean(b)
}

/**
 * Se este negócio é desta pessoa.
 *
 * Pela ordem em que a resposta é de confiança: o nome do comercial atribuído,
 * depois o nome completo do perfil, e só então quem o criou.
 */
export function ownsDeal(profile, deal) {
  if (!profile || !deal) return false
  return same(deal.sales_owner, profile.sales_owner_name)
    || same(deal.sales_owner, profile.full_name)
    || (!!deal.created_by && deal.created_by === profile.id)
}

/**
 * Um negócio que não é de ninguém.
 *
 * Sem comercial atribuído e sem quem o criou. Medido a 12-09: 250 negócios
 * assim, 6 M€, e 249 deles vieram de três importações — 171 numa manhã de
 * Abril em catorze minutos, 57 em Junho, 21 no mesmo instante. Não são carteira
 * de ninguém; são o livro de encomendas e o P&L carregados para reporte.
 *
 * Por isso uma vista pessoal deixa-os de fora sem os esconder de ninguém: as
 * vistas corporativas continuam a contá-los, que é para o que existem.
 */
export function isUnassigned(deal) {
  return !deal?.created_by && !clean(deal?.sales_owner)
}

/**
 * Os negócios de uma pessoa.
 *
 * Devolve também quantos ficaram de fora, porque uma lista vazia tem de poder
 * dizer porquê. Um funil sem nada lê-se como "não tens pipeline"; se a razão é
 * que nenhum negócio tem o teu nome, isso é outra coisa e o ecrã tem de o
 * dizer. BR-062, aplicado a um filtro em vez de a uma leitura falhada.
 */
export function ownedBy(deals, profile) {
  const all = deals || []
  const mine = all.filter(d => ownsDeal(profile, d))
  return {
    deals: mine,
    total: all.length,
    hidden: all.length - mine.length,
    unassigned: all.filter(isUnassigned).length,
  }
}
