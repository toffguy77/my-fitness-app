#!/usr/bin/env node
/**
 * Posts the release notes of a merged release PR to the team's Telegram group
 * (topic «Releases» of «Burcev Team»), once the release is live on prod.
 *
 * The audience is everyone in the group, not only developers, so the message
 * is not the PR body: that is written for whoever reviews the merge — migration
 * numbers, package versions, PR cross-references. The release PR carries a
 * `## Что нового` section in plain language, and only that section is sent.
 * A PR without it fails here rather than falling back to the technical body.
 *
 * "Live" is judged by `/ready` on prod: its `version` ends in the short SHA of
 * the deployed commit (`vГГГГ.ММ.ДД+<SHA>`). The auto-deploy after a merge
 * still carries the previous APP_VERSION; the version moves only after it is
 * raised and prod is deployed again — that second deploy is the release.
 * Merge time is not rollout time: the build runs up to forty minutes.
 *
 * Usage:
 *   node scripts/release-notify.mjs <PR#> [--wait] [--dry-run] [--pr-json <file>]
 *
 *   --wait       poll /ready until prod runs the merge commit or a descendant
 *   --dry-run    print the message instead of sending it
 *   --pr-json    read the PR from a file (`gh pr view --json` shape), not gh
 *
 * Env: TELEGRAM_BOT_TOKEN, RELEASE_NOTIFY_CHAT_ID, RELEASE_NOTIFY_THREAD_ID
 * (required unless --dry-run); READY_URL (default https://burcev.team/ready);
 * WAIT_TIMEOUT_MIN (default 90); GH_TOKEN for gh in CI.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const SECTION_TITLE = 'Что нового'

// Telegram rejects a message longer than this outright.
const TELEGRAM_LIMIT = 4096

const MONTHS = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

/**
 * Returns the body of the `## Что нового` section, or null when the PR has
 * none or it is empty. The section ends at the next `#`/`##` heading or at
 * the Claude Code attribution line, whichever comes first.
 */
export function extractSection(body) {
    const lines = String(body ?? '').replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n')
    const start = lines.findIndex(
        (l) => /^##\s+/.test(l) && l.replace(/^##\s+/, '').trim().toLowerCase() === SECTION_TITLE.toLowerCase(),
    )
    if (start === -1) return null
    const out = []
    for (const line of lines.slice(start + 1)) {
        if (/^#{1,2}\s/.test(line) || line.startsWith('🤖 Generated with')) break
        out.push(line)
    }
    const text = out.join('\n').trim()
    return text === '' ? null : text
}

export function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Inline Markdown → Telegram HTML: links, **bold**, _italic_, `code`. */
function inline(s) {
    return escapeHtml(s)
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, text, url) => `<a href="${url.replace(/"/g, '&quot;')}">${text}</a>`)
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/(^|[\s(])_(.+?)_(?=[\s.,;:!?)]|$)/g, '$1<i>$2</i>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
}

/**
 * The subset of Markdown a release section needs, rendered for Telegram's
 * HTML mode: `###` headings become bold lines, `-`/`*` items become bullets
 * (nested items indented), everything else is inline-formatted as is.
 */
export function markdownToTelegramHtml(md) {
    return md
        .split('\n')
        .map((line) => {
            const heading = line.match(/^#{3,6}\s+(.*)$/)
            if (heading) return `<b>${inline(heading[1].trim())}</b>`
            const item = line.match(/^(\s*)[-*]\s+(.*)$/)
            if (item) {
                const depth = Math.floor(item[1].replace(/\t/g, '  ').length / 2)
                return `${'    '.repeat(depth)}${depth ? '◦' : '•'} ${inline(item[2])}`
            }
            return inline(line)
        })
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
}

export function formatDate(iso) {
    const d = new Date(iso)
    // Moscow time: a release merged at 23:30 UTC happened "tomorrow" for the team.
    const msk = new Date(d.getTime() + 3 * 60 * 60 * 1000)
    return `${msk.getUTCDate()} ${MONTHS[msk.getUTCMonth()]} ${msk.getUTCFullYear()}`
}

export function buildMessage({ section, mergedAt, version }) {
    const parts = [
        `🚀 <b>Обновление BURCEV — ${formatDate(mergedAt)}</b>`,
        '',
        markdownToTelegramHtml(section),
    ]
    if (version) parts.push('', `<i>Версия ${escapeHtml(version)}</i>`)
    return parts.join('\n')
}

/** Short SHA from a `/ready` version like `v2026.10.06+d4f70902`, or null. */
export function shaFromVersion(version) {
    const m = String(version ?? '').match(/\+([0-9a-f]{7,40})$/)
    return m ? m[1] : null
}

function parseArgs(argv) {
    const args = { pr: null, wait: false, dryRun: false, prJson: null }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--wait') args.wait = true
        else if (a === '--dry-run') args.dryRun = true
        else if (a === '--pr-json') args.prJson = argv[++i]
        else if (/^\d+$/.test(a)) args.pr = a
        else throw new Error(`unknown argument: ${a}`)
    }
    if (!args.pr && !args.prJson) throw new Error('usage: release-notify.mjs <PR#> [--wait] [--dry-run] [--pr-json <file>]')
    return args
}

function loadPr(args) {
    const raw = args.prJson
        ? readFileSync(args.prJson, 'utf8')
        : execFileSync('gh', ['pr', 'view', args.pr, '--json', 'number,title,body,url,state,mergedAt,mergeCommit,baseRefName'], { encoding: 'utf8' })
    return JSON.parse(raw)
}

/** True when `deployed` is `merge` itself or a commit after it on main. */
function deployedIncludes(merge, deployed) {
    if (merge.startsWith(deployed)) return true
    try {
        const status = execFileSync(
            'gh', ['api', `repos/{owner}/{repo}/compare/${merge}...${deployed}`, '--jq', '.status'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        ).trim()
        return status === 'ahead' || status === 'identical'
    } catch {
        // An unknown SHA (an old version, a typo in APP_VERSION) is "not yet".
        return false
    }
}

async function waitForRelease(mergeSha, readyUrl, timeoutMin) {
    const deadline = Date.now() + timeoutMin * 60 * 1000
    let last = null
    while (Date.now() < deadline) {
        try {
            // /health answers HTML from the frontend while the API restarts;
            // /ready with a JSON body is the only answer worth reading.
            const res = await fetch(readyUrl, { signal: AbortSignal.timeout(15000) })
            const body = await res.json()
            const sha = shaFromVersion(body.version)
            if (body.version !== last) {
                console.log(`prod version: ${body.version} (ready: ${body.ready})`)
                last = body.version
            }
            if (body.ready === true && sha && deployedIncludes(mergeSha, sha)) return body.version
        } catch (err) {
            console.log(`prod not answering yet: ${err.message}`)
        }
        await new Promise((r) => setTimeout(r, 60 * 1000))
    }
    throw new Error(
        `prod did not reach ${mergeSha.slice(0, 8)} within ${timeoutMin} min (last version: ${last}). ` +
        'Raise APP_VERSION and deploy again, then re-run this workflow by hand.',
    )
}

async function send(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.RELEASE_NOTIFY_CHAT_ID
    const threadId = process.env.RELEASE_NOTIFY_THREAD_ID
    const missing = Object.entries({ TELEGRAM_BOT_TOKEN: token, RELEASE_NOTIFY_CHAT_ID: chatId, RELEASE_NOTIFY_THREAD_ID: threadId })
        .filter(([, v]) => !v).map(([k]) => k)
    if (missing.length) throw new Error(`missing env: ${missing.join(', ')}`)

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            message_thread_id: Number(threadId),
            text,
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
        }),
    })
    const body = await res.json()
    if (!body.ok) throw new Error(`Telegram refused the message: ${body.description}`)
    return body.result
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    const pr = loadPr(args)
    if (!pr.mergedAt || !pr.mergeCommit?.oid) throw new Error(`PR #${pr.number} is not merged`)
    if (pr.baseRefName && pr.baseRefName !== 'main') throw new Error(`PR #${pr.number} targets ${pr.baseRefName}, not main`)

    // Checked before waiting: a missing section should fail in seconds, not
    // after the rollout an hour later.
    const section = extractSection(pr.body)
    if (!section) {
        throw new Error(
            `PR #${pr.number} has no "## ${SECTION_TITLE}" section. Add one written for the whole team ` +
            '(no migration numbers or package versions) and re-run.',
        )
    }

    const mergeSha = pr.mergeCommit.oid
    let version = null
    if (args.wait) {
        version = await waitForRelease(mergeSha, process.env.READY_URL || 'https://burcev.team/ready', Number(process.env.WAIT_TIMEOUT_MIN || 90))
    }

    const text = buildMessage({ section, mergedAt: pr.mergedAt, version })
    if (text.length > TELEGRAM_LIMIT) {
        throw new Error(`message is ${text.length} characters, Telegram allows ${TELEGRAM_LIMIT}; shorten "${SECTION_TITLE}"`)
    }
    if (args.dryRun) {
        console.log(text)
        return
    }
    const sent = await send(text)
    console.log(`sent: message ${sent.message_id} in thread ${sent.message_thread_id}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((err) => {
        console.error(`release-notify: ${err.message}`)
        process.exit(1)
    })
}
