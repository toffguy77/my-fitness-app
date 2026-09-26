/**
 * Сторож имени поля в ответах со списками-подсказками.
 *
 * «Недавние» и избранное не показывались никогда: сервер отдаёт `foods`
 * (`GetRecentFoodsResponse`, `GetFavoriteFoodsResponse`), а клиент читал `items`.
 * Получалось `undefined`, уходило в состояние, и пропс со значением по умолчанию
 * `recentFoods = []` превращал это в пустой список — то есть в «у вас пока ничего
 * нет», неотличимое от правды.
 *
 * Тесты хука этого поймать не могли: они подменяют клиент API и сами говорили
 * `items`. Подмена, повторяющая ошибку кода, подтверждает ошибку.
 *
 * Поэтому здесь читается Go-источник: имя поля берётся из json-тега структуры
 * ответа и сверяется с тем, что читает хук.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const GO_TYPES = join(process.cwd(), '..', 'api', 'internal', 'modules', 'food-tracker', 'types.go')
const HOOK = join(process.cwd(), 'src', 'features', 'food-tracker', 'hooks', 'useFoodSearch.ts')

/** Единственное json-поле структуры ответа. */
function responseField(goSource: string, typeName: string): string {
    const start = goSource.indexOf(`type ${typeName} struct {`)
    if (start === -1) throw new Error(`структура ${typeName} не найдена в types.go`)
    const end = goSource.indexOf('\n}', start)
    const fields = [...goSource.slice(start, end).matchAll(/json:"([^",]+)/g)].map((m) => m[1])
    if (fields.length !== 1) {
        throw new Error(`у ${typeName} ожидалось одно поле, найдено: ${fields.join(', ')}`)
    }
    return fields[0]
}

describe('Списки-подсказки читаются тем полем, которым их отдаёт сервер', () => {
    const goTypes = readFileSync(GO_TYPES, 'utf8')
    const hook = readFileSync(HOOK, 'utf8')

    it.each([
        ['GetRecentFoodsResponse', 'setRecentFoods'],
        ['GetFavoriteFoodsResponse', 'setFavoriteFoods'],
    ])('%s: хук читает то же поле', (typeName, setter) => {
        const field = responseField(goTypes, typeName)

        // Ровно тот вызов, который кладёт ответ в состояние.
        const call = hook.match(new RegExp(`${setter}\\(\\s*response\\.(\\w+)`))
        if (!call) throw new Error(`в хуке не нашлось ${setter}(response.…)`)
        expect(call[1]).toBe(field)
    })

    it('тип запроса объявлен тем же полем', () => {
        for (const typeName of ['GetRecentFoodsResponse', 'GetFavoriteFoodsResponse']) {
            const field = responseField(goTypes, typeName)
            expect(hook).toContain(`apiClient.get<{ ${field}: FoodItem[] }>`)
        }
    })
})
