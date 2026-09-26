#!/usr/bin/env node
/**
 * Fails when the frontend calls an API path the backend does not register.
 *
 * This exists because the password-change feature shipped broken: the handler
 * was implemented, never registered in the router, and the frontend called
 * `/api/auth/change-password` while every route lives under `/api/v1`. Unit
 * tests could not catch it — they mock the API client — and e2e tests were not
 * running in CI.
 *
 * The backend's route table is the golden file the router test maintains.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const GOLDEN = 'apps/api/internal/router/testdata/routes.golden'
const WEB_SRC = 'apps/web/src'

/** Route patterns the backend serves, as a set of regexes matching concrete paths. */
function backendMatchers() {
    return readFileSync(GOLDEN, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            const path = line.slice(line.indexOf(' ') + 1)
            // `:param` matches any single non-empty segment.
            const source = path.replace(/:[A-Za-z]+/g, '[^/]+').replace(/\//g, '\\/')
            // `line` целиком — ключ реестра ниже: метод и путь вместе, ровно как
            // в routes.golden, чтобы запись нельзя было сделать приблизительной.
            return { line: line.trim(), path, re: new RegExp(`^${source}$`) }
        })
}

function sourceFiles(dir) {
    const out = []
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            if (entry === '__tests__' || entry === 'node_modules') continue
            out.push(...sourceFiles(full))
        } else if (['.ts', '.tsx'].includes(extname(entry)) && !entry.includes('.test.')) {
            out.push(full)
        }
    }
    return out
}

/**
 * Finds `const NAME = '/api/...'` (and `const NAME = process.env.X || '...'`,
 * whose real value in a normal setup is the fallback literal) declared in a
 * single file, so template literals built as `${NAME}/rest` can be resolved
 * to a real path before matching. This is deliberately file-local and
 * single-level — no project-wide TypeScript parsing.
 */
function localConstants(text) {
    const consts = new Map()
    const re = /^[ \t]*const\s+(\w+)\s*=\s*(?:process\.env\.\w+\s*\|\|\s*)?['"`]([^'"`]*)['"`]/gm
    for (const m of text.matchAll(re)) consts.set(m[1], m[2])
    return consts
}

/**
 * Replaces a template literal's leading `${NAME}` with NAME's resolved value
 * when NAME is a local constant, so calls like `` `${BASE}/leads` `` (a
 * widespread pattern in this codebase) are visible to the scan below instead
 * of silently skipped because the literal does not start with `/api/`.
 */
function resolveLocalBases(text) {
    const consts = localConstants(text)
    if (consts.size === 0) return text
    return text.replace(/`\$\{(\w+)\}/g, (whole, name) => (consts.has(name) ? '`' + consts.get(name) : whole))
}

/**
 * Rewrites string concatenation into the same `${}` placeholder an interpolation
 * leaves behind: `'/dashboard/tasks/' + taskId + '/complete'` becomes
 * `'/dashboard/tasks/${}/complete'`.
 *
 * Without this the scan sees only `/dashboard/tasks/` and concludes nothing
 * calls `POST /api/v1/dashboard/tasks/:id/complete`. Going forwards that is a
 * missed check; going backwards it is a false accusation, which is worse — a
 * check that names routes as uncalled when they are called is a check people
 * learn to override.
 */
function collapseConcatenations(text) {
    let out = text
    // Between two literals: consume both quotes so the pieces merge into one.
    const between = /(['"])\s*\+\s*[A-Za-z_$][^'"+]*?\+\s*\1/g
    for (let pass = 0; pass < 8; pass++) {
        const next = out.replace(between, '${}')
        if (next === out) break
        out = next
    }
    // Trailing: `getApiUrl('/a/' + id)` — the literal ended, so close it again.
    return out.replace(/(['"])\s*\+\s*[A-Za-z_$][^'"+),;]*/g, '${}$1')
}

/**
 * Collapses every `${…}` interpolation to a bare `${}`, matching braces so a
 * nested template literal inside one disappears with it.
 *
 * Without this, a backtick inside an interpolation ends the literal as far as
 * the scan below is concerned, and the path is lost. That is not academic:
 * `${BASE}/support/conversations${query}${status ? `${sep}status=${status}` : ''}`
 * went unchecked while its three siblings in the same file were checked —
 * the one call able to drift unnoticed was the one nobody could see.
 *
 * The shape `/${…}/` survives as `/${}/`, so the path-parameter rule below
 * still recognises it.
 */
function collapseInterpolations(text) {
    let out = ''
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== '$' || text[i + 1] !== '{') {
            out += text[i]
            continue
        }
        // Walk to the matching brace, counting nesting. A nested template
        // literal contributes its own braces, and they balance the same way.
        let depth = 0
        let j = i + 1
        for (; j < text.length; j++) {
            if (text[j] === '{') depth++
            else if (text[j] === '}') {
                depth--
                if (depth === 0) break
            }
        }
        // An unbalanced `${` is not ours to interpret — leave it be.
        if (j >= text.length) {
            out += text.slice(i)
            break
        }
        out += '${}'
        i = j
    }
    return out
}

/**
 * The version prefix `getApiUrl` prepends: `getApiUrl('/food-tracker/entries')`
 * is a call to `/api/v1/food-tracker/entries`.
 *
 * Read from `apps/web/src/config/api.ts` rather than hard-coded, so a change to
 * the prefix does not quietly stop the scan from recognising these calls.
 */
function versionPrefix() {
    const config = join(WEB_SRC, 'config', 'api.ts')
    if (!existsSync(config)) return '/api/v1'
    const m = readFileSync(config, 'utf8').match(/version:\s*['"`]([^'"`]+)['"`]/)
    return m ? m[1] : '/api/v1'
}

/**
 * Collects `/api/...` literals, turning `${expr}` interpolations into a
 * placeholder segment so they line up with the backend's `:param` patterns.
 *
 * Two shapes are resolved first, because a path this scan cannot see is a false
 * negative going one way and a false accusation going the other:
 *
 *   - `` `${BASE}/leads` `` — a module-local base constant (resolveLocalBases);
 *   - `getApiUrl('/food-tracker/entries')` — a helper that prepends the version
 *     prefix, so the literal at the call site does not start with `/api/`.
 *     Forty call sites across ten files are written this way.
 */
function frontendCalls(files) {
    const found = new Map()
    const prefix = versionPrefix()
    for (const file of files) {
        const text = collapseInterpolations(
            collapseConcatenations(resolveLocalBases(readFileSync(file, 'utf8')))
        )
        const literals = [
            ...[...text.matchAll(/['"`](\/api\/[^'"`\s]*)['"`]/g)].map((m) => m[1]),
            ...[...text.matchAll(/getApiUrl\(\s*['"`]([^'"`\s]*)['"`]/g)].map(
                (m) => prefix + m[1]
            ),
        ]
        for (const raw of literals) {
            const normalized = raw
                // The query string goes first: `clients/${id}?days=${n}` ends its
                // path at the `?`, and a parameter last in the path is followed
                // by it rather than by a slash. Substituting placeholders before
                // cutting the query lost that `${id}` — the route looked
                // uncalled while `curatorApi.getClientDetail` was calling it.
                .replace(/\?.*$/, '')
                // A `${...}` delimited by a slash or the end of the path is a
                // path parameter.
                .replace(/\/\$\{[^}]*\}(?=\/|$)/g, '/X')
                // Anything else interpolated is a suffix built at the call site;
                // it is not part of the route pattern.
                .replace(/\$\{[^}]*\}/g, '')
                .replace(/\/$/, '')
            if (!normalized.startsWith('/api/')) continue
            if (!found.has(normalized)) found.set(normalized, file)
        }
    }
    return found
}

/**
 * Реестр маршрутов, которых фронтенд законно не зовёт.
 *
 * Отдельным файлом, а не константой здесь: так его правку видно в diff'е сама
 * по себе, и так его может подменить тест, запускающий этот скрипт против
 * подставного репозитория.
 */
const REGISTRY = 'scripts/uncalled-routes.json'

function registry() {
    if (!existsSync(REGISTRY)) return []

    let parsed
    try {
        parsed = JSON.parse(readFileSync(REGISTRY, 'utf8'))
    } catch (cause) {
        console.error(`${REGISTRY} is not valid JSON: ${cause.message}`)
        process.exit(1)
    }
    if (!Array.isArray(parsed)) {
        console.error(`${REGISTRY} must be an array of { route, reason } entries.`)
        process.exit(1)
    }

    // Причина обязательна, потому что через полгода вопрос будет не «есть ли
    // здесь исключение», а «почему оно здесь». Запись без причины — галочка, а
    // реестр из галочек не стоит того, чтобы его читали.
    const broken = parsed.filter(
        (entry) =>
            !entry ||
            typeof entry.route !== 'string' ||
            entry.route.trim() === '' ||
            typeof entry.reason !== 'string' ||
            entry.reason.trim() === ''
    )
    if (broken.length > 0) {
        console.error(`Every entry in ${REGISTRY} needs a route and a reason:\n`)
        for (const entry of broken) console.error(`  ${JSON.stringify(entry)}`)
        console.error('\nA reason is the point of the registry: without it the entry says nothing.')
        process.exit(1)
    }

    // Признанный дефект — отдельный вид записи, и он обязан указывать, где
    // работа записана. Иначе «пока не дотянуто» становится причиной, а реестр —
    // местом, куда складывают недоделанное; тогда он не сторожит ничего.
    // Указатель должен вести в файл, который можно открыть и прочитать: пустой
    // каталог существует и не говорит ничего — ровно та же гниль, только
    // проходящая проверку.
    const readable = (path) =>
        typeof path === 'string' && existsSync(path) && statSync(path).isFile()
    const dangling = parsed.filter((entry) => 'defect' in entry && !readable(entry.defect))
    if (dangling.length > 0) {
        console.error(`These ${REGISTRY} entries point at work that does not exist:\n`)
        for (const entry of dangling) console.error(`  ${entry.route} -> ${entry.defect}`)
        console.error(
            '\nA known defect must name a readable file in the repository where the work is' +
                '\nwritten down. If the work is done, the route is called now and the entry goes.'
        )
        process.exit(1)
    }

    return parsed
}

const matchers = backendMatchers()
const calls = frontendCalls(sourceFiles(WEB_SRC))

// Base-URL constants are concatenated with a suffix at the call site, so they
// are prefixes of real routes rather than routes themselves.
const isBaseURL = (path) => matchers.some((m) => m.path.startsWith(path + '/'))

const missing = []
for (const [path, file] of calls) {
    if (isBaseURL(path)) continue
    if (!matchers.some((m) => m.re.test(path))) missing.push({ path, file })
}

if (missing.length > 0) {
    console.error('Frontend calls API paths that the backend does not register:\n')
    for (const { path, file } of missing) console.error(`  ${path}\n    ${file}`)
    console.error('\nEither register the route in apps/api/internal/router/, or fix the path.')
    process.exit(1)
}

// ============================================================================
// Обратное направление: маршрут, которого не зовёт никто
// ============================================================================
//
// До этой проверки направление было одно: путь, который зовёт фронтенд, обязан
// существовать на сервере. Обратное не проверял никто, и маршрут без вызова
// проходил мимо всех сторожей. Так нашлась пустая `analytics_identities`:
// `POST /api/v1/analytics/identify` был написан, зарегистрирован и защищён, а
// вызова не существовало — воронку «аноним → зарегистрировался» нельзя было
// посчитать вообще, и в отчёте это выглядело продуктовым фактом, а не
// отсутствием измерения.
//
// Сопоставление идёт по пути, а не по методу: метод у вызова взять негде —
// `apiClient.get`, `post`, `fetch` с `method` в настройках и обёртки над ними
// дают слишком разные места. Отсюда известное ограничение: путь, у которого
// зовут хотя бы один метод, целиком считается вызываемым.
const callPaths = [...calls.keys()]
const isCalled = (matcher) => callPaths.some((path) => matcher.re.test(path))

const declared = new Map(registry().map((entry) => [entry.route, entry.reason]))
const uncalled = matchers.filter((m) => !isCalled(m)).map((m) => m.line)

const undeclared = uncalled.filter((route) => !declared.has(route))
const stale = [...declared.keys()].filter((route) => !uncalled.includes(route))
const unknown = stale.filter((route) => !matchers.some((m) => m.line === route))
const nowCalled = stale.filter((route) => !unknown.includes(route))

const problems = []

if (undeclared.length > 0) {
    problems.push(
        'These routes are registered but nothing in the frontend calls them:\n' +
            undeclared.map((route) => `  ${route}`).join('\n') +
            `\n\nEither call the route, or add it to ${REGISTRY} with the reason it is` +
            '\nnot called from a browser. "Not wired up yet" is not a reason — it is the' +
            '\ndefect this check exists to find.'
    )
}

if (nowCalled.length > 0) {
    problems.push(
        `These ${REGISTRY} entries are stale — the frontend calls these routes now:\n` +
            nowCalled.map((route) => `  ${route}`).join('\n') +
            '\n\nRemove them, so the registry keeps meaning what it says.'
    )
}

if (unknown.length > 0) {
    problems.push(
        `These ${REGISTRY} entries name routes the backend does not register:\n` +
            unknown.map((route) => `  ${route}`).join('\n') +
            '\n\nRemove them, or fix the route line to match routes.golden exactly.'
    )
}

if (problems.length > 0) {
    console.error(problems.join('\n\n'))
    process.exit(1)
}

console.log(
    `API contract OK — ${calls.size} frontend paths all resolve to registered routes; ` +
        `${matchers.length} routes are called or declared (${declared.size} declared).`
)
