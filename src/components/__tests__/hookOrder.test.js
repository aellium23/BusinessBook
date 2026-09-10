import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// A dependency array is evaluated where it is written, not where the callback
// runs. So `useMemo(() => f(x), [x])` written above `const x = ...` throws
// "Cannot access 'x' before initialization" and takes the whole screen down
// with an error boundary — while the build passes and every unit test stays
// green, because nothing rendered the component.
//
// That happened to the quick deal in production: a memo named `authMap` forty
// lines before `authMap` existed. This is the cheap guard for the whole class,
// and it needs no renderer and no new dependency.

const ROOTS = ['src/components', 'src/pages']

function jsxFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name === '__tests__') continue
      jsxFiles(path, out)
    } else if (name.endsWith('.jsx')) {
      out.push(path)
    }
  }
  return out
}

/**
 * One component's body at a time.
 *
 * Scope matters: a name declared in a second component further down the file
 * is not the name a hook in the first one is reading, and treating the file as
 * one scope reports that as a fault. Splitting on top-level function
 * declarations is crude, but it is the same crudeness in both directions and it
 * costs no parser.
 */
function componentBodies(source) {
  const starts = []
  const re = /^(?:export default |export )?function [A-Z]/gm
  let m
  while ((m = re.exec(source))) starts.push(m.index)
  if (!starts.length) return [source]
  return starts.map((from, i) => source.slice(from, starts[i + 1] ?? source.length))
}

/** Every identifier a dependency array names before its own declaration. */
function forwardRefs(wholeFile) {
  return [...new Set(componentBodies(wholeFile).flatMap(forwardRefsInBody))]
}

function forwardRefsInBody(source) {
  // Component-body declarations: two spaces of indentation, const or let,
  // plain or destructured.
  const declaredAt = {}
  const decl = /^ {2}(?:const|let) (?:\[\s*)?([A-Za-z_$][\w$]*)/gm
  let m
  while ((m = decl.exec(source))) {
    if (!(m[1] in declaredAt)) declaredAt[m[1]] = m.index
  }

  const bad = []
  // Any call whose last argument is an array literal. In React that is a
  // dependency array; anywhere else the names will not match a declaration and
  // are ignored, so a loose match costs nothing.
  const deps = /,\s*\[([^\]]*)\]\s*\)/g
  while ((m = deps.exec(source))) {
    const at = m.index
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split('.')[0].split('?')[0]
      if (!name) continue
      if (declaredAt[name] !== undefined && declaredAt[name] > at) {
        bad.push(name)
      }
    }
  }
  return [...new Set(bad)]
}

/**
 * A local const that shadows a component-level name AND is referenced above
 * itself in the same function.
 *
 * `const discounted = [...]` inside create(), where `discounted` is also a
 * predicate defined in the component and called four lines earlier, puts that
 * call in the temporal dead zone. It throws at click time — nowhere near where
 * it was written, under a minified name, and only for the person who clicks.
 *
 * Shadowing on its own is common enough in this codebase to be noise; shadowing
 * a name that was already used in the same function is always a fault.
 */
function shadowHazards(wholeFile) {
  return [...new Set(componentBodies(wholeFile).flatMap(shadowHazardsInBody))]
}

function shadowHazardsInBody(source) {
  const outer = new Set()
  let m
  const outerDecl = /^ {2}(?:const|let) (?:\[\s*)?([A-Za-z_$][\w$]*)/gm
  while ((m = outerDecl.exec(source))) outer.add(m[1])

  // Where each top-level function or arrow in the component body begins.
  const blockStarts = []
  const block = /^ {2}(?:async )?function |^ {2}const [A-Za-z_$][\w$]* = /gm
  while ((m = block.exec(source))) blockStarts.push(m.index)

  const bad = []
  // Exactly one level in: the direct body of a component-level function. A
  // deeper one is inside a callback with its own scope, where shadowing is
  // ordinary and harmless — and where this check would otherwise cry wolf.
  const innerDecl = /^ {4}(?:const|let) (?:\[\s*)?([A-Za-z_$][\w$]*)/gm
  while ((m = innerDecl.exec(source))) {
    const name = m[1]
    if (!outer.has(name)) continue
    const from = [...blockStarts].reverse().find(i => i < m.index) ?? 0
    const before = source.slice(from, m.index)
    if (new RegExp(`\\b${name}\\b`).test(before)) bad.push(name)
  }
  return bad
}

describe('no hook names something that does not exist yet', () => {
  const files = ROOTS.flatMap(r => jsxFiles(r))

  it('finds files to check, so a silent zero cannot pass for a pass', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  for (const file of files) {
    it(`${file} declares everything its dependency arrays name`, () => {
      expect(forwardRefs(readFileSync(file, 'utf8'))).toEqual([])
    })
  }
})

describe('no local shadows a name its own function already used', () => {
  const files = ROOTS.flatMap(r => jsxFiles(r))

  for (const file of files) {
    it(`${file} has no shadow that reaches back`, () => {
      expect(shadowHazards(readFileSync(file, 'utf8'))).toEqual([])
    })
  }
})

describe('the check itself', () => {
  it('catches the bug it was written for', () => {
    const broken = `
  const list = useMemo(() => build(authMap), [authMap])
  const authMap = useMemo(() => map(rows), [rows])
`
    expect(forwardRefs(broken)).toEqual(['authMap'])
  })

  it('catches the shadow that reaches back', () => {
    const broken = `
  const discounted = l => l.pct > 0

  async function create() {
    const some = lines.filter(l => discounted(l))
    const discounted = [...a, ...b]
  }
`
    expect(shadowHazards(broken)).toEqual(['discounted'])
  })

  it('leaves a shadow that never looks back alone', () => {
    const fine = `
  const total = 1

  function draw() {
    const total = 2
    return total
  }
`
    expect(shadowHazards(fine)).toEqual([])
  })

  it('is quiet when the order is right', () => {
    const fine = `
  const authMap = useMemo(() => map(rows), [rows])
  const list = useMemo(() => build(authMap), [authMap])
`
    expect(forwardRefs(fine)).toEqual([])
  })
})
