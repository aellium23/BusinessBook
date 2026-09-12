// "Este cliente já existe?" — perguntado a tempo de importar.
//
// A tabela tem o Hospital Ramón y Cajal duas vezes, a Telefónica duas vezes e o
// Catsalut duas vezes, e num dos casos o que separa 1,14 M€ em duas linhas é um
// S maiúsculo. Nenhuma dessas foi criada por desleixo: alguém escreveu o nome em
// vez de o escolher da lista, e a aplicação aceitou sem dizer nada.
//
// Limpar depois é trabalho manual e arriscado — foi preciso um preview para
// descobrir que a minha própria regra de limpeza queria fundir sete Remagnas
// diferentes. Perguntar antes custa um segundo a quem está a escrever.
//
// A normalização é a mesma do SQL de limpeza, de propósito: se as duas
// discordarem, uma cria o que a outra tenta juntar.

const ACCENTS = { 'Á':'A','À':'A','Â':'A','Ã':'A','Ä':'A','É':'E','È':'E','Ê':'E','Ë':'E',
  'Í':'I','Ì':'I','Î':'I','Ï':'I','Ó':'O','Ò':'O','Ô':'O','Õ':'O','Ö':'O',
  'Ú':'U','Ù':'U','Û':'U','Ü':'U','Ç':'C','Ñ':'N' }

/**
 * Sufixos societários que não distinguem uma empresa de si própria.
 *
 * O separador antes do sufixo é OBRIGATÓRIO, e não é um detalhe: sem ele o `SA`
 * final de `RACONSA` era lido como a forma jurídica e o nome ficava em `RACON`.
 * A partir daí a `Raconsa` casava com qualquer cliente começado por RACON.
 */
const LEGAL = /[\s,]+\(?(S\.?A\.?S?\.?|S\.?L\.?U?\.?|LDA\.?|LTD\.?|INC\.?|B\.?V\.?|GMBH|SAC)\)?\s*$/

/**
 * O nome reduzido ao que identifica a entidade.
 *
 * Sem acentos, sem maiúsculas, sem pontuação, sem sufixo legal. `Clínica San
 * Roque` e `CLINICA SAN ROQUE, S.A.` chegam ambos a `CLINICASANROQUE`.
 */
export function normalizeClient(name) {
  const raw = String(name ?? '').trim().toUpperCase()
  if (!raw) return ''
  const noAccents = raw.replace(/[ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]/g, c => ACCENTS[c] || c)
  return noAccents.replace(LEGAL, '').replace(/[^A-Z0-9]/g, '')
}

/** Distância de edição, limitada — não interessa saber que são muito diferentes. */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (cur[j] < best) best = cur[j]
    }
    if (best > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

/**
 * O que este nome pode já ser, entre os que existem.
 *
 * Três razões, e cada uma diz-se de maneira diferente a quem está a escrever:
 *
 *   `same`      idêntico depois de normalizar. Só muda acentos, maiúsculas ou
 *               o `, S.A.` — é o mesmo cliente, com toda a certeza.
 *   `truncated` um é o princípio do outro, e a parte que falta é curta. É a
 *               assinatura do SAP, que corta os nomes aos 30 ou 35 caracteres.
 *   `similar`   quase igual, a menos de uma letra ou duas. Uma gralha.
 *
 * O que NÃO é sugerido: um nome que seja o princípio de outro mas muito mais
 * curto. `Remagna` é o princípio de sete clínicas Remagna diferentes, e sugerir
 * uma delas seria trocar um duplicado por um erro. O limiar — dez caracteres e
 * três quartos do comprimento — veio de ver a regra falhar exactamente aí.
 */
export function similarClients(typed, existing, { limit = 3 } = {}) {
  const k = normalizeClient(typed)
  if (k.length < 4) return []

  const out = []
  for (const name of existing || []) {
    if (!name || name === typed) continue
    const e = normalizeClient(name)
    if (!e) continue

    if (e === k) { out.push({ name, reason: 'same', score: 1 }); continue }

    const [shortK, longK] = k.length <= e.length ? [k, e] : [e, k]
    if (longK.startsWith(shortK) && shortK.length >= 10 && shortK.length / longK.length >= 0.75) {
      out.push({ name, reason: 'truncated', score: 0.95 })
      continue
    }

    // Uma gralha: até dois caracteres de diferença, e nunca mais de 15% do nome.
    const max = Math.min(2, Math.floor(longK.length * 0.15))
    if (max >= 1) {
      const d = editDistance(k, e, max)
      if (d <= max) { out.push({ name, reason: 'similar', score: 0.9 - d * 0.05 }); continue }
    }
  }

  return out
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
}
