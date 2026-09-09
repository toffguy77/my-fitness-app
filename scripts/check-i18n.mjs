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

const TRANSLATED = [
    'apps/web/src/features/auth',
    'apps/web/src/features/onboarding',
    'apps/web/src/features/settings',
    'apps/web/src/app/settings',
    'apps/web/src/features/food-tracker',
    'apps/web/src/app/food-tracker',
    'apps/web/src/features/dashboard',
    'apps/web/src/app/dashboard',
    'apps/web/src/features/chat',
    'apps/web/src/app/chat',
    'apps/web/src/features/notifications',
    'apps/web/src/app/notifications',
    'apps/web/src/features/curator',
    'apps/web/src/app/curator',
    'apps/web/src/features/admin',
    'apps/web/src/app/admin',
]

const DICTIONARY = 'apps/web/src/shared/i18n/dictionaries/ru.ts'

// Cyrillic anywhere in a line is not the rule: comments are written for the
// people maintaining this and stay in whichever language they were written in.
const EXEMPT = /i18n-exempt/

// A whole file can be exempt when every string in it is of the same kind —
// fixtures nobody reads, or a function that already handles languages itself.
// The marker goes in the first lines, with the reason next to it; per-line
// markers would be a dozen copies of one sentence.
const EXEMPT_FILE = /i18n-exempt-file/

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

/**
 * Strips comments so a Russian explanation above the code is not a finding.
 *
 * String-aware on purpose. A regular expression cannot be: `accept="image/*"`
 * contains the two characters that open a block comment, and a naive strip
 * treated everything from there to the next `*​/` as a comment — blanking real
 * code and every untranslated string inside it. This checker reported "i18n OK"
 * for months while two aria-labels sat in the blind spot.
 *
 * So this walks the source once, tracking whether it is inside a string, and
 * only then treats `/*` and `//` as comments. Newlines are preserved so line
 * numbers still point at the right place.
 */
function stripComments(source) {
    let out = ''
    let i = 0
    let quote = null // ' " or ` when inside a string literal

    while (i < source.length) {
        const c = source[i]
        const next = source[i + 1]

        if (quote) {
            if (c === '\\') {
                // An escape takes the next character with it, whatever it is.
                out += c + (next ?? '')
                i += 2
                continue
            }
            if (c === quote) quote = null
            out += c
            i += 1
            continue
        }

        if (c === '"' || c === "'" || c === '`') {
            quote = c
            out += c
            i += 1
            continue
        }

        if (c === '/' && next === '*') {
            const end = source.indexOf('*/', i + 2)
            const stop = end === -1 ? source.length : end + 2
            // Keep the newlines so reported line numbers stay true.
            out += source.slice(i, stop).replace(/[^\n]/g, ' ')
            i = stop
            continue
        }

        if (c === '/' && next === '/') {
            let end = source.indexOf('\n', i)
            if (end === -1) end = source.length
            out += ' '.repeat(end - i)
            i = end
            continue
        }

        out += c
        i += 1
    }

    return out
}

const files = TRANSLATED.flatMap((dir) => walk(dir))

// --- Rule 1: no Cyrillic literal in a translated directory ------------------
for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const original = source.split('\n')
    if (original.slice(0, 20).some((l) => EXEMPT_FILE.test(l))) continue
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
