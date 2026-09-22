/**
 * Слепок отказывается принимать адреса, не похожие на одноразовые.
 *
 * Зачистка удаляет КАЖДУЮ учётную запись из слепка целиком, вместе со всем,
 * что на неё ссылается. Перечень учёток — это список на удаление, и ошибка в
 * нём необратима.
 *
 * Ошибиться легко: `e2e/.env` в этом репозитории перечислял личные адреса
 * владельца (mail.ru, gmail.com, yandex.ru) — файл писался, когда зачистки не
 * существовало и переменные значили только «под кем входить». Прогон с ним и
 * этой обвязкой удалил бы настоящие аккаунты.
 *
 * Проверка идёт ДО обращения к базе, поэтому тестам база не нужна: при отказе
 * скрипт выходит с кодом 1 и называет адреса, при пропуске — доходит до
 * заведомо несуществующего хоста и падает уже на нём. Разница между этими
 * двумя исходами и есть предмет проверки.
 *
 * Запуск: node --test scripts/__tests__/e2e-db-snapshot-address-guard.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'e2e-db-snapshot.sh')

/** Хост, которого не существует: попытка соединения обязана провалиться. */
const NOWHERE = 'postgres://user:pass@e2e-guard-nowhere.invalid:6432/db'

function run(accounts, extraEnv = {}) {
    const result = spawnSync('bash', [SCRIPT], {
        encoding: 'utf8',
        env: {
            ...process.env,
            DATABASE_URL: NOWHERE,
            ACCOUNT_EMAILS: accounts,
            ...extraEnv,
        },
    })
    return { status: result.status, out: `${result.stdout}${result.stderr}` }
}

test('личный адрес роняет слепок по имени, до всякого обращения к базе', () => {
    const { status, out } = run('spasskiy@mail.ru')
    assert.equal(status, 1)
    assert.match(out, /spasskiy@mail\.ru/)
    assert.match(out, /не похожи на одноразовые/)
    assert.doesNotMatch(out, /nowhere\.invalid/)
})

test('называются все подозрительные адреса, а не первый', () => {
    const { out } = run('spasskiy@mail.ru,toffguy77@gmail.com')
    assert.match(out, /spasskiy@mail\.ru/)
    assert.match(out, /toffguy77@gmail\.com/)
})

test('служебный домен проходит: отказ приходит уже от базы', () => {
    const { out } = run('stand-1@burcev.test')
    assert.doesNotMatch(out, /не похожи на одноразовые/)
})

test('приставка e2e- на домене продукта проходит', () => {
    const { out } = run('e2e-client@burcev.team')
    assert.doesNotMatch(out, /не похожи на одноразовые/)
})

test('адрес на домене продукта БЕЗ приставки не проходит', () => {
    // Именно этот случай отделяет одноразовую учётку от настоящего сотрудника:
    // домен тот же, а удалять такую учётку нельзя.
    const { status, out } = run('director@burcev.team')
    assert.equal(status, 1)
    assert.match(out, /director@burcev\.team/)
})

test('проверку можно снять осознанно', () => {
    const { out } = run('spasskiy@mail.ru', { E2E_CLEANUP_ALLOW_ANY_ADDRESS: '1' })
    assert.doesNotMatch(out, /не похожи на одноразовые/)
})
