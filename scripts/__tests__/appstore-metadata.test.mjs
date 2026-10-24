// Тексты страницы «Взвешено» в App Store (apps/ios/fastlane/metadata).
//
// App Store Connect проверяет длины только при загрузке, а lane `metadata`
// узнаёт об отказе поля уже на раннере. Остальное — правила ревью, которые
// сам ASC не проверяет вовсе: цены и призывы оплатить работу с куратором вне
// приложения (3.1.1, 3.1.3(d)), чужие товарные знаки в ключевых словах (2.3.7),
// http-ссылки вместо https.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const dir = new URL('../../apps/ios/fastlane/metadata/', import.meta.url)
const read = (name) => readFileSync(new URL(name, dir), 'utf8').trim()
const chars = (text) => [...text].length

// Лимиты App Store Connect; ключевые слова считаются в байтах UTF-8, и
// кириллица занимает вдвое больше места, чем кажется.
const LIMITS = {
    'ru/name.txt': 30,
    'ru/subtitle.txt': 30,
    'ru/promotional_text.txt': 170,
    'ru/description.txt': 4000,
    'ru/release_notes.txt': 4000,
}

// То, что пользователь видит на странице магазина.
const PUBLIC_TEXTS = Object.keys(LIMITS)

// Цена, подписка и любые призывы оплатить или «оставить заявку» — без них
// ревью не задаёт вопросов по 3.1.1. Работа с куратором оплачивается вне
// приложения, и страница магазина об этом молчит.
// \b в JavaScript знает только латиницу — границы слова здесь через \p{L}.
const FORBIDDEN = [
    /подписк/i,
    /(?<!\p{L})руб/iu,
    /₽/,
    /(?<!\p{L})цен[аыуе]?(?!\p{L})/iu,
    /стоимост/i,
    /оплат/i,
    /(?<!\p{L})куп[иа]/iu,
    /покупк/i,
    /тариф/i,
    /скидк/i,
    /промокод/i,
    /бесплатн/i,
    /заявк/i,
    /пробн/i,
]

// Чужие марки и платформы в ключевых словах — отказ по 2.3.7.
const FORBIDDEN_KEYWORDS = [/siri/i, /apple/i, /iphone/i, /ios/i, /watch/i, /fatsecret/i, /yazio/i,
    /myfitnesspal/i, /lifesum/i, /вкусвилл/i, /яндекс/i, /телеграм/i, /telegram/i]

const words = (text) => text.toLowerCase().replace(/ё/g, 'е').match(/[\p{L}\p{N}]+/gu) ?? []

test('каждый текст на месте и укладывается в лимит App Store Connect', () => {
    for (const [name, limit] of Object.entries(LIMITS)) {
        assert.ok(existsSync(new URL(name, dir)), `нет ${name}`)
        const text = read(name)
        assert.ok(text.length > 0, `${name} пустой`)
        assert.ok(chars(text) <= limit, `${name}: ${chars(text)} символов при лимите ${limit}`)
    }
})

test('ключевые слова: не больше 100 байт, через запятую без пробелов', () => {
    const keywords = read('ru/keywords.txt')
    const bytes = Buffer.byteLength(keywords, 'utf8')
    assert.ok(bytes <= 100, `ключевые слова: ${bytes} байт при лимите 100`)
    assert.doesNotMatch(keywords, /,\s|\s,/, 'пробел у запятой съедает байты и ничего не даёт')
    assert.doesNotMatch(keywords, /\n/)
    const list = keywords.split(',')
    assert.ok(list.every((k) => k.length > 0), 'пустое ключевое слово')
    assert.equal(new Set(list).size, list.length, 'повтор ключевого слова')
})

test('ключевые слова не повторяют название и подзаголовок', () => {
    // Слова названия и подзаголовка App Store и так индексирует: повтор в
    // ключевых словах — потерянные байты.
    const taken = new Set([...words(read('ru/name.txt')), ...words(read('ru/subtitle.txt'))])
    for (const word of words(read('ru/keywords.txt'))) {
        assert.ok(!taken.has(word), `«${word}» уже есть в названии или подзаголовке`)
    }
})

test('в ключевых словах нет чужих марок', () => {
    const keywords = read('ru/keywords.txt')
    for (const pattern of FORBIDDEN_KEYWORDS) {
        assert.doesNotMatch(keywords, pattern)
    }
})

test('на странице нет цен, подписки и призывов оплатить вне приложения', () => {
    for (const name of [...PUBLIC_TEXTS, 'ru/keywords.txt']) {
        const text = read(name)
        for (const pattern of FORBIDDEN) {
            assert.doesNotMatch(text, pattern, `${name}: ${pattern}`)
        }
    }
})

test('ссылки страницы — https на burcev.team', () => {
    for (const name of ['ru/support_url.txt', 'ru/marketing_url.txt', 'ru/privacy_url.txt']) {
        assert.match(read(name), /^https:\/\/burcev\.team\/\S*$/, name)
    }
    assert.equal(read('ru/privacy_url.txt'), 'https://burcev.team/legal/privacy')
})

test('пароль демо-аккаунта в git не попадает', () => {
    // Пароль вписывается в App Store Connect при подаче; в файле — заглушка.
    const notes = read('review_information/notes.txt')
    const fields = [...notes.matchAll(/(?:Пароль|Password):\s*(.*)/g)].map((m) => m[1])
    assert.ok(fields.length > 0, 'в заметках нет строки пароля демо-аккаунта')
    for (const value of fields) {
        assert.match(value, /^<[^>]+>$/, `похоже на пароль: ${value}`)
    }
})
