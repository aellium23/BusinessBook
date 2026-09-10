import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { transformWithEsbuild } from 'vite'

/** Runs the file through the same parser the build uses. */
async function parse(source) {
  await transformWithEsbuild(source, 'HelpGuide.jsx', { loader: 'jsx' })
  return true
}

// The in-app help is one enormous object of single-quoted strings in three
// languages, and the same thing has broken it four times: an unescaped
// apostrophe inside one of them. `the customer's price` ends the string, and
// the rest of the sentence becomes code.
//
// The build catches it — but only once the build is run, which is after the
// commit in every hurried version of this workflow. This fails first.

describe('HelpGuide', () => {
  it('parses, in all three languages', async () => {
    // Importing it would be the thorough check, but it reaches a Supabase
    // client and a localStorage through the auth hook, and this suite runs with
    // no DOM. Parsing the file is the part that matters and needs neither.
    const src = readFileSync('src/components/HelpGuide.jsx', 'utf8')
    await expect(parse(src)).resolves.toBeTruthy()
  })

  it('names the line when a help string closes itself early', () => {
    // The same fault, reported as a line number rather than as a stack trace
    // from esbuild — an escaped apostrophe is fine and common, a bare one is
    // the end of the string.
    const lines = readFileSync('src/components/HelpGuide.jsx', 'utf8').split('\n')
    const bad = []
    lines.forEach((line, i) => {
      const m = line.match(/^\s*[a-zA-Z_]\w*: '(.*)',?\s*$/)
      if (!m) return
      if (/(^|[^\\])'/.test(m[1])) bad.push(`${i + 1}: ${line.trim().slice(0, 70)}…`)
    })
    expect(bad).toEqual([])
  })
})
