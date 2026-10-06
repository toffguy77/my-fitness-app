/**
 * `release-notify.mjs` posts a release PR's `## Что нового` section to the
 * team's Telegram group. The group is everyone, not only developers, so the
 * cases that matter are the ones where the technical body would leak out: no
 * section, an empty one, a section running into the next heading or into the
 * attribution line. Telegram's HTML mode rejects a whole message over one
 * unescaped `<`, so escaping is tested too.
 *
 * Run: node --test scripts/__tests__/release-notify.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
    extractSection,
    markdownToTelegramHtml,
    buildMessage,
    formatDate,
    shaFromVersion,
} from '../release-notify.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'release-notify.mjs')

const BODY = [
    '## Что нового',
    '',
    '- Бот больше не отвечает в группе кураторов.',
    '- Заявки на куратора приходят в группу.',
    '',
    '## Что едет',
    '',
    '- #207 — миграция 088',
    '',
    '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
].join('\n')

test('takes only the plain-language section, not the technical one after it', () => {
    const section = extractSection(BODY)
    assert.equal(section, '- Бот больше не отвечает в группе кураторов.\n- Заявки на куратора приходят в группу.')
    assert.doesNotMatch(section, /миграция/)
})

test('a section at the end stops at the attribution line', () => {
    const section = extractSection('## Что нового\n\n- Пункт.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)')
    assert.equal(section, '- Пункт.')
})

test('keeps ### subheadings inside the section', () => {
    const section = extractSection('## Что нового\n\n### Клиентам\n- Пункт.\n\n## Миграции\n- 088')
    assert.equal(section, '### Клиентам\n- Пункт.')
})

test('no section, an empty one, or one only holding a comment is null', () => {
    assert.equal(extractSection('## Что едет\n- #207'), null)
    assert.equal(extractSection('## Что нового\n\n## Что едет\n- #207'), null)
    assert.equal(extractSection('## Что нового\n<!-- написать для всей команды -->\n## Что едет'), null)
    assert.equal(extractSection(null), null)
})

test('the heading matches regardless of case and trailing spaces', () => {
    assert.equal(extractSection('## что НОВОГО  \r\n- Пункт.'), '- Пункт.')
})

test('renders bullets, bold, links and escapes HTML', () => {
    const html = markdownToTelegramHtml(
        '### Клиентам\n- **Важно**: калории < 1200 & белок\n  - вложенный\n- [справка](https://burcev.team/help)',
    )
    assert.equal(
        html,
        '<b>Клиентам</b>\n' +
        '• <b>Важно</b>: калории &lt; 1200 &amp; белок\n' +
        '    ◦ вложенный\n' +
        '• <a href="https://burcev.team/help">справка</a>',
    )
})

test('snake_case words are not turned into italics', () => {
    assert.equal(markdownToTelegramHtml('live_users и _курсив_'), 'live_users и <i>курсив</i>')
})

test('the date is the team’s date, in Moscow time', () => {
    assert.equal(formatDate('2026-10-06T15:57:06Z'), '6 октября 2026')
    assert.equal(formatDate('2026-10-06T22:30:00Z'), '7 октября 2026')
})

test('message carries a title, the section and the version', () => {
    const text = buildMessage({ section: '- Пункт.', mergedAt: '2026-10-06T15:57:06Z', version: 'v2026.10.06+d4f70902' })
    assert.equal(text, '🚀 <b>Обновление BURCEV — 6 октября 2026</b>\n\n• Пункт.\n\n<i>Версия v2026.10.06+d4f70902</i>')
})

test('reads the SHA from a /ready version', () => {
    assert.equal(shaFromVersion('v2026.10.06+d4f70902'), 'd4f70902')
    assert.equal(shaFromVersion('dev'), null)
    assert.equal(shaFromVersion(undefined), null)
})

function runWithPr(pr, ...extra) {
    const dir = mkdtempSync(join(tmpdir(), 'release-notify-'))
    try {
        const file = join(dir, 'pr.json')
        writeFileSync(file, JSON.stringify(pr))
        return spawnSync(process.execPath, [SCRIPT, '--pr-json', file, ...extra], {
            encoding: 'utf8',
            env: { PATH: process.env.PATH },
        })
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
}

const MERGED = {
    number: 210,
    body: BODY,
    mergedAt: '2026-10-06T15:57:06Z',
    mergeCommit: { oid: 'd4f70902aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    baseRefName: 'main',
}

test('dry run prints the message and sends nothing', () => {
    const r = runWithPr(MERGED, '--dry-run')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /Обновление BURCEV — 6 октября 2026/)
    assert.match(r.stdout, /• Бот больше не отвечает/)
    assert.doesNotMatch(r.stdout, /миграция 088/)
})

test('a release PR without the section fails instead of sending the technical body', () => {
    const r = runWithPr({ ...MERGED, body: '## Что едет\n- #207 — миграция 088' }, '--dry-run')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /no "## Что нового" section/)
})

test('an unmerged PR fails', () => {
    const r = runWithPr({ ...MERGED, mergedAt: null, mergeCommit: null }, '--dry-run')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /not merged/)
})

test('sending without a token fails loudly, not silently', () => {
    const r = runWithPr(MERGED)
    assert.equal(r.status, 1)
    assert.match(r.stderr, /missing env: TELEGRAM_BOT_TOKEN, RELEASE_NOTIFY_CHAT_ID, RELEASE_NOTIFY_THREAD_ID/)
})
