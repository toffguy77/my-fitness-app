#!/usr/bin/env node
/**
 * Guards against a class of defect the audit found repeatedly: code that looks
 * live but is not — a registered endpoint returning invented data, a duplicated
 * build config contradicting the docs, an env var declared for a feature that
 * was never built.
 *
 * Each rule is concrete and explains itself, because a check that fires
 * spuriously gets disabled.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname, basename } from 'node:path'

const problems = []

function walk(dir, filter, out = []) {
    if (!existsSync(dir)) return out
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            if (['node_modules', '.next', 'testdata', '.claude', '.git', '.worktrees', 'dist', 'build'].includes(entry)) continue
            walk(full, filter, out)
        } else if (filter(full)) {
            out.push(full)
        }
    }
    return out
}

// --- Rule 1: every NEXT_PUBLIC_* declared is actually read ------------------
const envFiles = ['apps/web/.env.local'].filter(existsSync)
const webSources = walk('apps/web/src', (f) => ['.ts', '.tsx'].includes(extname(f)))
const webText = webSources.map((f) => readFileSync(f, 'utf8')).join('\n')

const declared = new Set()
for (const file of envFiles) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
        const m = line.match(/^(NEXT_PUBLIC_[A-Z0-9_]+)=/)
        if (m) declared.add(m[1])
    }
}
for (const name of declared) {
    if (!webText.includes(name)) {
        problems.push(
            `Unused public env var: ${name}\n` +
                `  Declared in an env file but never read in apps/web/src.\n` +
                `  Declare it together with the code that reads it, or remove it.`,
        )
    }
}

// --- Rule 2: secrets must never carry the NEXT_PUBLIC_ prefix --------------
// NEXT_PUBLIC_ values are inlined into the browser bundle.
for (const name of declared) {
    if (/(KEY|SECRET|TOKEN|PASSWORD)$/.test(name) && !/PUBLIC_KEY$/.test(name)) {
        problems.push(
            `Secret-shaped name with a public prefix: ${name}\n` +
                `  NEXT_PUBLIC_ values ship to the browser. Drop the prefix and read it server-side.`,
        )
    }
}

// --- Rule 3: exactly one Next.js config ------------------------------------
const configs = walk('.', (f) => /^next\.config\.(ts|js|mjs)$/.test(basename(f)))
if (configs.length !== 1) {
    problems.push(
        `Expected exactly one next.config.*, found ${configs.length}: ${configs.join(', ')}\n` +
            `  Duplicated build configs drift apart and contradict CLAUDE.md.`,
    )
}

// --- Rule 4: no unimplemented handlers behind registered routes -------------
const goServices = walk('apps/api/internal/modules', (f) => f.endsWith('.go') && !f.endsWith('_test.go'))
for (const file of goServices) {
    const text = readFileSync(file, 'utf8')
    if (/\/\/\s*TODO:\s*Implement/i.test(text)) {
        problems.push(
            `Unimplemented handler in a shipped module: ${file}\n` +
                `  A registered route returning placeholder data reaches production.\n` +
                `  Implement it, or remove the module and its routes.`,
        )
    }
}

if (problems.length > 0) {
    console.error('Codebase integrity check failed:\n')
    for (const p of problems) console.error(p + '\n')
    process.exit(1)
}

console.log(
    `Codebase integrity OK — ${declared.size} public env vars all used, ` +
        `${configs.length} Next.js config, no unimplemented shipped handlers.`,
)
