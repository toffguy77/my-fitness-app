#!/usr/bin/env node
/**
 * Brings the counter's goals in line with the list declared in the code.
 *
 * The list of goals has to match MIRRORED_EVENTS in
 * apps/web/src/shared/analytics/events.ts. A goal created by hand under a
 * different name is a goal that will never be reached, and nobody notices:
 * zero conversions looks exactly like no traffic. Reading the list from the
 * source rather than repeating it here is what keeps the two from drifting.
 *
 * Changes nothing unless asked. This touches a service shared by everybody,
 * and a script that mutates it as a side effect of being run is a script
 * somebody will run to "just have a look".
 *
 * It does not set the retargeting flag, and cannot: `is_retargeting` is not
 * the counter owner's to set. A goal becomes a retargeting goal when somebody
 * names it in a Direct campaign as an audience condition — the flag is the
 * consequence, not the cause. Sending `is_retargeting: 1` on creation is
 * accepted and ignored; the goals come back with 0. Measured, not assumed.
 *
 * So creating the goals is the whole job here. Picking them up in Direct is a
 * decision with a budget attached, and it belongs to whoever has one.
 *
 *   node scripts/metrika-goals.mjs             # show the difference
 *   node scripts/metrika-goals.mjs --apply     # create what is missing
 *
 * Needs YANDEX_METRIKA_OAUTH_TOKEN and YANDEX_METRIKA_COUNTER_ID.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const EVENTS_FILE = join(here, '..', 'apps', 'web', 'src', 'shared', 'analytics', 'events.ts')

const API = 'https://api-metrika.yandex.net/management/v1'

/** The mirrored names, read from the source of truth rather than repeated. */
export function declaredGoals(source = readFileSync(EVENTS_FILE, 'utf8')) {
    // Anchored on the `=`, not on the first bracket: the declaration carries
    // a type annotation (`readonly EventName[]`) whose brackets come first.
    const block = source.match(/MIRRORED_EVENTS[^=]*=\s*\[([\s\S]*?)\]/)
    if (!block) throw new Error('MIRRORED_EVENTS not found in events.ts')

    const names = new Map(
        [...source.matchAll(/(\w+):\s*'([a-z_]+)'/g)].map((m) => [m[1], m[2]]),
    )

    return [...block[1].matchAll(/EVENTS\.(\w+)/g)].map(([, key]) => {
        const name = names.get(key)
        if (!name) throw new Error(`EVENTS.${key} is mirrored but not declared`)
        return name
    })
}

/**
 * What differs between the counter and the declaration.
 *
 * `stale` is reported but never deleted: a goal with history behind it is
 * somebody's report, and removing it is a decision with consequences this
 * script is in no position to weigh.
 *
 * `notInDirect` is reported for the same reason and is not a fault: a declared
 * goal nobody has picked up in a Direct campaign yet simply is not a
 * retargeting condition yet. Nothing here can change that.
 */
export function difference(declared, existing) {
    const byName = new Map(existing.map((goal) => [goal.name, goal]))

    return {
        missing: declared.filter((name) => !byName.has(name)),
        notInDirect: declared
            .map((name) => byName.get(name))
            .filter((goal) => goal && !goal.is_retargeting),
        stale: existing.filter((goal) => !declared.includes(goal.name)),
    }
}

async function call(path, token, init = {}) {
    const response = await fetch(`${API}${path}`, {
        ...init,
        headers: {
            Authorization: `OAuth ${token}`,
            'Content-Type': 'application/json',
            ...(init.headers ?? {}),
        },
    })

    if (!response.ok) {
        throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`)
    }
    return response.json()
}

async function main() {
    const token = process.env.YANDEX_METRIKA_OAUTH_TOKEN
    const counter = process.env.YANDEX_METRIKA_COUNTER_ID
    const apply = process.argv.includes('--apply')

    if (!token || !counter) {
        console.error(
            'Нужны YANDEX_METRIKA_OAUTH_TOKEN и YANDEX_METRIKA_COUNTER_ID.\n' +
                'Без них скрипт не обращается в сеть вовсе.',
        )
        process.exit(2)
    }

    const declared = declaredGoals()
    const { goals: existing = [] } = await call(`/counter/${counter}/goals`, token)
    const diff = difference(declared, existing)

    console.log(`Счётчик ${counter}: объявлено ${declared.length}, заведено ${existing.length}.`)

    for (const goal of diff.stale) {
        console.log(`  лишняя (не трогаю): ${goal.name}`)
    }
    for (const goal of diff.notInDirect) {
        console.log(`  пока не условие ретаргетинга: ${goal.name}`)
    }
    for (const name of diff.missing) {
        console.log(`  отсутствует: ${name}`)
    }

    if (diff.missing.length === 0) {
        console.log('Все объявленные цели заведены.')
        if (diff.notInDirect.length > 0) {
            console.log(
                'Ретаргетинг включается не здесь: цель становится условием подбора\n' +
                    'аудитории, когда её выбирают в кампании Директа.',
            )
        }
        return
    }

    if (!apply) {
        console.log('\nНичего не изменено. Чтобы применить: --apply')
        return
    }

    for (const name of diff.missing) {
        await call(`/counter/${counter}/goals`, token, {
            method: 'POST',
            body: JSON.stringify({
                goal: {
                    name,
                    type: 'action',
                    // The name the browser reaches the goal by. Same string as
                    // the event, which is what makes the two sides line up.
                    conditions: [{ type: 'exact', url: name }],
                },
            }),
        })
        console.log(`  создана: ${name}`)
    }

    console.log(
        '\nРетаргетинг не выставляется отсюда: цель становится условием подбора\n' +
            'аудитории, когда её выбирают в кампании Директа.',
    )
}

// Importable for the tests without running against the real counter.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error.message)
        process.exit(1)
    })
}
