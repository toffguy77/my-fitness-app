#!/usr/bin/env node
/**
 * Two rules about text the user reads.
 *
 * The first is the point of the whole exercise: in a directory that has been
 * translated, a Russian sentence written inline is a string that a second
 * language can never reach. It is invisible — everything looks right until
 * somebody switches language and half the screen does not follow.
 *
 * The second exists because `t('a.b.c')` is a string, and TypeScript will not
 * tell you that `a.b.c` is not in the dictionary. The function warns at
 * runtime and shows the key; that is a decent last resort and a poor first
 * one. This turns a typo into a build failure instead.
 *
 * `TRANSLATED` grows one directory at a time, as each section's strings are
 * extracted. Adding a directory here is what makes the rule real for it.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname, relative } from 'node:path'

const TRANSLATED = ['apps/web/src/features/auth', 'apps/web/src/features/onboarding']

const DICTIONARY = 'apps/web/src/shared/i18n/dictionaries/ru.ts'

// Cyrillic anywhere in a line is not the rule: comments are written for the
// people maintaining this and stay in whichever language they were written in.
const EXEMPT = /i18n-exempt/

const problems = []

function walk(dir, out = []) {
    if (!existsSync(dir)) return out
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            if (['node_modules', '.next', '__tests__', '__mocks__'].includes(entry)) continue
            walk(full, out)
        } else if (['.ts', '.tsx'].includes(extname(full)) && !full.includes('.test.')) {
            out.push(full)
        }
    }
    return out
}

/** Strips comments so a Russian explanation above the code is not a finding. */
function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p)
}

const files = TRANSLATED.flatMap((dir) => walk(dir))

// --- Rule 1: no Cyrillic literal in a translated directory ------------------
for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const original = source.split('\n')
    const lines = stripComments(source).split('\n')
    lines.forEach((line, i) => {
        if (!/[А-Яа-яЁё]/.test(line)) return
        // The exemption is looked for in the original text — stripping comments
        // would take the marker away with them.
        if (original.slice(Math.max(0, i - 3), i + 1).some((l) => EXEMPT.test(l))) return
        problems.push(
            `Literal Russian string in a translated section:\n` +
                `  ${relative(process.cwd(), file)}:${i + 1}\n` +
                `  ${line.trim()}\n` +
                `  Move it into ${DICTIONARY} and read it with t('...').\n` +
                `  If it is a brand name or otherwise the same in every language,\n` +
                `  mark the line with an "i18n-exempt" comment saying why.`,
        )
    })
}

// --- Rule 2: every key a component asks for exists --------------------------
const dictionarySource = readFileSync(DICTIONARY, 'utf8')

/**
 * The dictionary is a plain object literal, so its shape can be read without
 * evaluating it — but only by a scanner that knows a `}` inside a string (the
 * `{name}` placeholders) is not the end of a group.
 */
function keyPaths(source) {
    const paths = new Set()
    const stack = []
    let pending = null

    for (let i = 0; i < source.length; i++) {
        const c = source[i]

        if (c === "'" || c === '"' || c === '`') {
            // A string value closes whatever property name was pending.
            if (pending) {
                paths.add([...stack, pending].filter(Boolean).join('.'))
                pending = null
            }
            i++
            while (i < source.length && source[i] !== c) {
                if (source[i] === '\\') i++
                i++
            }
            continue
        }

        if (c === '/' && source[i + 1] === '/') {
            while (i < source.length && source[i] !== '\n') i++
            continue
        }
        if (c === '/' && source[i + 1] === '*') {
            i = source.indexOf('*/', i) + 1
            continue
        }

        if (c === '{') {
            stack.push(pending ?? '')
            if (pending) paths.add(stack.filter(Boolean).join('.'))
            pending = null
            continue
        }
        if (c === '}') {
            stack.pop()
            continue
        }

        const name = /^([A-Za-z_$][\w$]*)\s*:/.exec(source.slice(i))
        if (name) {
            pending = name[1]
            i += name[0].length - 1
        }
    }

    return paths
}

const known = keyPaths(dictionarySource.slice(dictionarySource.indexOf('export const ru')))

const allWebFiles = walk('apps/web/src')
for (const file of allWebFiles) {
    const source = readFileSync(file, 'utf8')
    for (const m of source.matchAll(/\bt\(\s*'([\w.]+)'/g)) {
        if (!known.has(m[1])) {
            problems.push(
                `Unknown translation key: ${m[1]}\n` +
                    `  ${relative(process.cwd(), file)}\n` +
                    `  Add it to ${DICTIONARY}, or correct the key.`,
            )
        }
    }
    // `t(`a.b.${x}`)` — the prefix has to name a real subtree.
    for (const m of source.matchAll(/\bt\(\s*`([\w.]+)\.\$\{/g)) {
        if (!known.has(m[1])) {
            problems.push(
                `Unknown translation key prefix: ${m[1]}.*\n` +
                    `  ${relative(process.cwd(), file)}\n` +
                    `  No such group in ${DICTIONARY}.`,
            )
        }
    }
}

if (problems.length > 0) {
    console.error(`\n${problems.length} i18n problem(s):\n`)
    for (const p of problems) console.error(`${p}\n`)
    process.exit(1)
}

console.log(`i18n OK — ${files.length} files in ${TRANSLATED.length} translated sections, ${known.size} keys.`)
