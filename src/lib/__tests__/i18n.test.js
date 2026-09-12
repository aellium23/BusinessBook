import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { translations } from '../i18n'

/**
 * Uma tradução em falta mostra-se como código.
 *
 * O `t()` devolve a chave quando não a encontra, por isso `setpw_check_length`
 * aparecia escrito assim mesmo na primeira página que um utilizador novo vê —
 * a lista de requisitos da palavra-passe. Vinte e oito chaves estavam nesse
 * estado a 12-09, espalhadas por três ecrãs, e nenhuma delas dava erro: a
 * aplicação compila, arranca e desenha o nome da variável.
 *
 * Alguém tinha tentado proteger-se com `t('perm_price') || 'Price'`. Isso não
 * funciona nunca: a chave em falta devolve a string `'perm_price'`, que é
 * verdadeira, e o `||` não chega a ser avaliado. Os fallbacks foram removidos
 * porque uma rede que não apanha nada é pior do que rede nenhuma — dá-se por
 * resolvido o que não está.
 *
 * Este teste lê o código como texto de propósito. Importar os ecrãs traria o
 * React, o Supabase e o router atrás, e o que interessa saber é o que lá está
 * escrito.
 */
const SRC = new URL('../../', import.meta.url).pathname

// Os próprios testes ficam de fora: este ficheiro escreve os padrões que
// procura, e encontrar-se a si mesmo não é um achado.
function jsFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : jsFiles(full)
    return /\.(jsx?|tsx?)$/.test(name) && !full.includes('i18n.js') ? [full] : []
  })
}

/** Todas as chaves que o código pede ao dicionário. */
function keysUsed() {
  const found = new Set()
  for (const file of jsFiles(SRC)) {
    const text = readFileSync(file, 'utf8')
    const re = /\bt\??\.?\(\s*(['"])([A-Za-z0-9_]+)\1\s*\)/g
    let m
    while ((m = re.exec(text)) !== null) found.add(m[2])
  }
  return [...found].sort()
}

describe('o dicionário responde a tudo o que o código lhe pergunta', () => {
  const used = keysUsed()

  it('encontra chaves para verificar', () => {
    expect(used.length).toBeGreaterThan(500)
  })

  it('não há chave usada que o inglês não tenha', () => {
    const missing = used.filter(k => !(k in translations.en))
    expect(missing).toEqual([])
  })

  /**
   * O espanhol e o português caem para inglês quando lhes falta uma chave, o
   * que é menos grave do que mostrar o código — mas é uma página em inglês para
   * quem escolheu outra língua, e ninguém a reporta porque parece intencional.
   */
  it.each(['es', 'pt'])('o %s traduz tudo o que o inglês tem', lang => {
    const missing = used.filter(k => k in translations.en && !(k in translations[lang]))
    expect(missing).toEqual([])
  })

  /**
   * O `||` a seguir a um `t()` nunca corre, porque uma chave em falta devolve o
   * próprio nome da chave e isso é verdadeiro. Escrevê-lo esconde o problema em
   * vez de o resolver.
   */
  it('ninguém volta a escrever um fallback que não pode disparar', () => {
    const culpados = []
    for (const file of jsFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      if (/\bt\(\s*['"][A-Za-z0-9_]+['"]\s*\)\s*\|\|\s*['"]/.test(text)) {
        culpados.push(file.replace(SRC, ''))
      }
    }
    expect(culpados).toEqual([])
  })
})
