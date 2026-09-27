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
import { join, extname, basename, relative } from 'node:path'

const problems = []

/**
 * Читает файл, найденный обходом дерева.
 *
 * Между обходом и чтением файл может исчезнуть — так `next dev` переписывает
 * свои артефакты, и так делают собственные тесты этого скрипта, подкладывая
 * образцы. Раньше это роняло проверку стектрейсом `ENOENT` внутри задачи, к
 * исчезнувшему файлу отношения не имевшей. Файла нет — проверять в нём нечего;
 * любая другая ошибка чтения по-прежнему поднимается.
 */
function readScanned(file) {
    try {
        return readFileSync(file, 'utf8')
    } catch (error) {
        if (error.code === 'ENOENT') return ''
        throw error
    }
}

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
const webText = webSources.map(readScanned).join('\n')

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
    const text = readScanned(file)
    if (/\/\/\s*TODO:\s*Implement/i.test(text)) {
        problems.push(
            `Unimplemented handler in a shipped module: ${file}\n` +
                `  A registered route returning placeholder data reaches production.\n` +
                `  Implement it, or remove the module and its routes.`,
        )
    }
}

// --- Rule: a configurable service must not be built by its own handler -----
//
// `NewHandler(db, ...)` calling `NewService(db, ...)` inside itself means the
// process runs two services: the one wired up at startup and the one the
// handler quietly made for itself. That is harmless while nothing configures
// the service — and a silent trap the moment something does, because the
// configuration lands on the instance the endpoints do not use.
//
// So the rule fires on exactly that combination: a service with `With…`
// methods, built inside its own handler. It shipped twice. In auth it meant a
// password change left every access token working for half a minute; in
// notifications it meant every digest carried an unsubscribe link the endpoint
// answered 503 to. Neither failed loudly.
const handlerFiles = walk('apps/api/internal/modules', (f) => basename(f) === 'handler.go')
for (const file of handlerFiles) {
    const source = readScanned(file)
    const constructor = source.match(/func New[A-Za-z]*Handler\([^)]*\)[^{]*\{[\s\S]*?\n\}/)
    if (!constructor || !/\bNew[A-Za-z]*Service\(/.test(constructor[0])) continue

    // Does this module's service carry configuration applied after it is built?
    const moduleDir = join(file, '..')
    const goFiles = walk(moduleDir, (f) => extname(f) === '.go' && !f.endsWith('_test.go'))
    const configurable = goFiles.some((f) =>
        /func \(s \*Service\) With[A-Za-z]+\(/.test(readScanned(f)),
    )
    if (!configurable) continue

    problems.push(
        `Handler builds its own service, and that service is configurable: ${relative(process.cwd(), file)}\n` +
            `  The service configured at startup and the one this constructor makes\n` +
            `  are different objects, so whatever is applied to the first — a cache,\n` +
            `  a secret, a sender — the endpoints will not have.\n` +
            `  Take the service as a parameter instead.`,
    )
}

// Роль из локального слепка.
//
// `localStorage['user']` — кэш первой отрисовки, а не источник истины: сессия,
// поднятая из cookie в браузере с очищенным хранилищем, слепка не имеет вовсе.
// Экраны, выбиравшие по нему оболочку, показывали куратору и администратору
// клиентскую навигацию, а `'client'` в качестве запасного значения превращал
// пустой кэш в понижение роли. `/curator` и `/admin` от этого вылечили, а
// `/profile`, `/settings/*`, `/notifications`, `/content` и `/food-tracker`
// остались — и нашёл это пользователь, а не сборка.
//
// Правило узкое намеренно: срабатывает только когда рядом и ключ `user`, и
// слово `role`. Чтение имени или почты для заголовка под него не попадает —
// это другой дефект, и он лечится тем же переходом на сессию, но ломать
// сборку из-за него сторож не должен.
const roleReaders = [
    ...walk('apps/web/src/app', (f) => ['.ts', '.tsx'].includes(extname(f))),
    ...walk('apps/web/src/features', (f) => ['.ts', '.tsx'].includes(extname(f))),
]
for (const file of roleReaders) {
    if (file.includes('__tests__') || file.includes('.test.')) continue
    const source = readScanned(file)
    for (const match of source.matchAll(/localStorage\.getItem\(\s*['"`]user['"`]\s*\)/g)) {
        // Окно после обращения: разбор слепка и взятие поля обычно стоят рядом,
        // в той же строке или в следующих двух-трёх.
        const window = source.slice(match.index, match.index + 200)
        if (!/\brole\b/.test(window)) continue

        const line = source.slice(0, match.index).split('\n').length
        problems.push(
            `Роль читается из локального хранилища: ${relative(process.cwd(), file)}:${line}\n` +
                `  Слепок в localStorage — кэш первой отрисовки, а не источник истины:\n` +
                `  в браузере с очищенным хранилищем его нет, и роль оттуда приходит\n` +
                `  пустой. Куратор получал клиентскую оболочку именно так.\n` +
                `  Возьмите роль из сессии — useCurrentUser(), или оберните экран\n` +
                `  в RoleShell, который это уже делает.`,
        )
    }
}

/**
 * Затирает комментарии, сохраняя длину и переводы строк.
 *
 * Нужно правилу ниже: сторож сработал на комментарии, который объясняет
 * исправленный дефект и цитирует прежний код. Правило, падающее на объяснении
 * самого себя, — первое, что отключат.
 */
function withoutComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, (line) => ' '.repeat(line.length))
}

// Придуманная норма КБЖУ.
//
// `calcTargets?.calories || 2000` — валидный TypeScript и ровно тот дефект,
// который человек нашёл раньше сборки: при незаполненном профиле 2000 ккал и
// 150 г белка показывались как его личная норма, а от них считались проценты
// выполнения, цвет калорий и алерты куратору. На проде такую норму видели 16
// клиентов из 18. Углеводов при том же «по умолчанию» было 200 в трекере и 250
// в дашборде — одна и та же норма на двух экранах разная.
//
// Тип `TargetGoals | null` ловит пропущенную ветвь, но не запрещает заполнить
// её неправдой. Это и есть второй слой: числовой литерал после `||` или `??`
// рядом с именем макронутриента.
const targetOwners = [
    ...walk('apps/web/src/features/food-tracker', (f) => ['.ts', '.tsx'].includes(extname(f))),
    ...walk('apps/web/src/features/dashboard', (f) => ['.ts', '.tsx'].includes(extname(f))),
    ...walk('apps/web/src/features/nutrition-calc', (f) => ['.ts', '.tsx'].includes(extname(f))),
]
const inventedTarget = /\b(calories|protein|fat|carbs|caloriesGoal|proteinGoal|fatGoal|carbsGoal)\b[^\n;,)]{0,40}(\?\?|\|\|)\s*(\d+)/g
for (const file of targetOwners) {
    if (file.includes('__tests__') || file.includes('.test.') || file.includes('/testing/')) continue
    const source = withoutComments(readScanned(file))
    for (const match of source.matchAll(inventedTarget)) {
        // Ноль запасным значением — не придуманная норма, а честный ноль:
        // «съедено нисколько» это измерение, «норма 2000» — нет.
        if (match[3] === '0') continue

        const line = source.slice(0, match.index).split('\n').length
        problems.push(
            `Придуманная норма КБЖУ: ${relative(process.cwd(), file)}:${line}\n` +
                `  ${match[0].trim()}\n` +
                `  Число на месте нормы показывается человеку как его собственная,\n` +
                `  и от него считаются проценты, цвета и алерты куратору.\n` +
                `  Нормы может не быть — это состояние, а не повод для догадки:\n` +
                `  оставьте null и покажите приглашение её посчитать.`,
        )
    }
}

// A page that ships invented data.
//
// /food-tracker/nutrient/[id] served two hard-coded vitamins, including a
// "sources in your diet" section listing salmon and eggs the person had never
// entered. No API stood behind it and nothing in the interface linked to it, so
// it went unnoticed — but the URL answered, and what it answered with looked
// like the reader's own data.
const appPages = walk('apps/web/src/app', (f) => ['.ts', '.tsx'].includes(extname(f)))
for (const file of appPages) {
    if (file.includes('__tests__') || file.includes('.test.')) continue
    const source = readScanned(file)
    const mock = source.match(/\b(?:const|let)\s+(MOCK_[A-Z0-9_]+|[A-Za-z]*_MOCK)\b/)
    if (!mock) continue

    problems.push(
        `Page renders fixture data: ${relative(process.cwd(), file)} defines ${mock[1]}\n` +
            `  A route that answers with invented content shows it to whoever opens\n` +
            `  the URL, and personal-looking fixtures read as the reader's own data.\n` +
            `  Fetch it, or do not register the route.`,
    )
}

// --- Каждый e2e-тест обязан входить в какой-нибудь проект Playwright ---
//
// Проекты перечисляют файлы поимённо, и файл, забытый в этом списке, просто не
// запускается. Ровно так и вышло: набор проверок на загрузку файлов пролежал
// целый релиз, отчитываясь зелёным Playwright, и не выполнился ни разу. Тест,
// который не запускается, ничем не отличается от отсутствующего.
const playwrightConfig = readFileSync('playwright.config.ts', 'utf8')
const specFiles = walk('e2e/tests', (f) => f.endsWith('.spec.ts'))
const unlisted = specFiles
    .map((f) => relative(process.cwd(), f).replace(/^e2e\//, ''))
    .filter((name) => !playwrightConfig.includes(`'${name}'`))

for (const name of unlisted) {
    problems.push(
        `E2E spec is in no Playwright project: e2e/${name}\n` +
            `  Projects list files by name, so a file missing from every testMatch\n` +
            `  never runs — and the suite still reports green.\n` +
            `  Add it to a project in playwright.config.ts.`,
    )
}


// --- Адрес API в локальном окружении обязан быть относительным ---
//
// Каждый вызывающий читает его как `process.env.NEXT_PUBLIC_API_URL || ''`, и
// пустое значение означает относительные пути: браузер спрашивает тот же
// источник, что отдал страницу, а локально это прокси на 3070. Абсолютное
// значение уводит браузер прямо в API, мимо прокси, — и Set-Cookie этой дороги
// не переживает. Ровно то, ради чего прокси и заведён (CLAUDE.md, «Routing:
// локально и в тестах через прокси»).
//
// Проверка нужна потому, что промах здесь не шумит: страницы открываются,
// запросы уходят, не работает только сессия. Файл держал `http://localhost:4000`
// достаточно долго, чтобы CI оброс обходом (.github/workflows/e2e.yml задаёт
// NEXT_PUBLIC_API_URL: ''), — то есть кто-то на это уже напоролся и обошёл
// вместо того, чтобы починить.
const webDir = 'apps/web'
const envFileNames = existsSync(webDir)
    ? readdirSync(webDir).filter((name) => name === '.env' || name.startsWith('.env.'))
    : []
for (const name of envFileNames) {
    const envPath = join(webDir, name)
    const envFile = readFileSync(envPath, 'utf8')
    for (const line of envFile.split('\n')) {
        // `export NEXT_PUBLIC_API_URL=…` is the same footgun with a shell
        // prefix — a value sourced instead of loaded by dotenv reads the same.
        const m = line.match(/^\s*(?:export\s+)?NEXT_PUBLIC_API_URL\s*=\s*(\S.*)$/)
        if (m) {
            problems.push(
                `NEXT_PUBLIC_API_URL is set to ${m[1].trim()} in ${envPath}\n` +
                    `  An absolute address sends the browser past the dev proxy on 3070,\n` +
                    `  and Set-Cookie does not survive that trip: pages load, requests go out,\n` +
                    `  and only the session quietly stops working.\n` +
                    `  Leave it empty so paths stay relative.`,
            )
        }
    }
}


// --- Каждое объявленное событие аналитики должен кто-то отправлять ---
//
// Словарь объявлен дважды — в Go и в TypeScript — и сервер отказывает всему,
// чего не знает. Но ничто не проверяло обратное: событие, объявленное с обеих
// сторон и не отправляемое ниоткуда, выглядит в воронке как «этого шага никто
// не делал». Так и было с support_chat_opened: объявлено на обеих сторонах,
// не отправлялось никем, и провал на его месте нельзя было отличить от
// отсутствия трафика.
const goDictionary = readFileSync('apps/api/internal/modules/analytics/dictionary.go', 'utf8')
const tsDictionary = readFileSync('apps/web/src/shared/analytics/events.ts', 'utf8')

const declaredEvents = [...goDictionary.matchAll(/Event[A-Za-z]+\s*=\s*"([a-z_]+)"/g)].map((m) => m[1])
const tsNames = new Map(
    [...tsDictionary.matchAll(/(\w+):\s*'([a-z_]+)'/g)].map((m) => [m[2], m[1]]),
)

// Обе стороны обязаны знать одно и то же: имя, объявленное только в клиенте,
// сервер отклонит, а объявленное только на сервере никто не пошлёт.
for (const [name] of tsNames) {
    if (!declaredEvents.includes(name)) {
        problems.push(
            `Analytics event declared in the client but not on the server: ${name}\n` +
                `  The server refuses names it does not know, so this one never arrives.\n` +
                `  Add it to apps/api/internal/modules/analytics/dictionary.go.`,
        )
    }
}

// Без самого словаря: иначе каждое событие «находит себя» в объявлении, и
// проверка проходит всегда. Первая версия этого сторожа была ровно такой.
const apiText = walk(
    'apps/api/internal',
    (f) => f.endsWith('.go') && !f.endsWith('_test.go') && !f.endsWith('dictionary.go'),
)
    .map(readScanned)
    .join('\n')
// Без тестов намеренно: вызов track() внутри проверки — не отправка события.
const productionWebText = walk('apps/web/src', (f) => /\.tsx?$/.test(f) && !f.includes('__tests__'))
    .map(readScanned)
    .join('\n')

// Считается отправкой любая ссылка вне словаря: сервер шлёт факты именем
// строкой, клиент — ключом словаря, и отправить можно как через track(), так и
// через <TrackView>. Проверять способ значило бы ловить форму записи, а вопрос
// здесь другой — существует ли вообще место, где событие рождается.
const unsent = declaredEvents.filter((name) => {
    if (apiText.includes(`"${name}"`)) return false
    const key = tsNames.get(name)
    if (key && new RegExp(`EVENTS\\.${key}\\b`).test(productionWebText)) return false
    return true
})

for (const name of unsent) {
    problems.push(
        `Analytics event is declared but never sent: ${name}\n` +
            `  A step nobody emits looks in the funnel exactly like a step nobody took.\n` +
            `  Send it where it happens, or remove it from both dictionaries.`,
    )
}

// Узкая проверка «маршруты аналитики кто-то зовёт» жила здесь с 2026-09-26 и
// снята: её заменило общее правило в check-api-contract.mjs, которое смотрит
// обратное направление для всех 164 маршрутов сразу. Правило там устроено так,
// что законное отсутствие вызова требует записи с причиной в
// scripts/uncalled-routes.json, а маршрут без вызова и без записи ломает сборку.
//
// Оговорка, ради которой проверка была узкой — «общее правило либо шумит, либо
// маскирует» — снялась разбором: ложных срабатываний было 32 из 42, и все от
// трёх форм записи пути, которых не видел скан. Их он теперь разбирает.

// Переменная, которую читает сервер, должна доходить до контейнера.
//
// Dokploy хранит переменные окружения у себя, а docker-compose передаёт в
// службу только то, что перечислено явно. Забытая строка выглядит как рабочая
// настройка: значение стоит в панели, в .env.example описано, а служба его не
// видит и молча работает как с пустым.
//
// Так дважды произошло на самом деле: APP_VERSION четыре дня показывала чужую
// версию, а TELEGRAM_SUPPORT_GROUP_ID выключала мост переписки при заданной
// группе.
const compose = readFileSync('docker-compose.yml', 'utf8')
const configGo = readFileSync('apps/api/internal/config/config.go', 'utf8')

const readByServer = new Set(
    [...configGo.matchAll(/getEnv(?:AsInt64|AsInt|AsDuration|WithFallback)?\(\s*"([A-Z0-9_]+)"/g)].map(
        (m) => m[1],
    ),
)
// Переменные, которые сервер читает не сам: их задаёт платформа или они
// собираются из других.
const notFromCompose = new Set(['PORT', 'NODE_ENV', 'DATABASE_URL'])

const forwarded = new Set(
    [...compose.matchAll(/^\s*-\s*([A-Z0-9_]+)=\$\{/gm)].map((m) => m[1]),
)

for (const name of [...readByServer].sort()) {
    if (notFromCompose.has(name) || forwarded.has(name)) continue
    problems.push(
        `Сервер читает ${name}, но docker-compose.yml её не пробрасывает.\n` +
            `  Значение будет стоять в панели и в .env.example, а служба увидит пустоту\n` +
            `  и промолчит об этом. Добавьте строку в окружение службы api.`,
    )
}

if (problems.length > 0) {
    console.error('Codebase integrity check failed:\n')
    for (const p of problems) console.error(p + '\n')
    process.exit(1)
}

console.log(
    `Codebase integrity OK — ${declared.size} public env vars all used, ` +
        `${configs.length} Next.js config, no unimplemented shipped handlers, ` +
        `${appPages.length} app files free of fixture data, ` +
        `${specFiles.length} e2e specs all in a project, ` +
        `${declaredEvents.length} analytics events all sent, ` +
            `${readByServer.size} server env vars all forwarded by compose.`,
)
