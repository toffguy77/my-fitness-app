/**
 * Логика пакетного импорта рецептов ВкусВилла. Рецепты уходят клиентам без
 * человеческой проверки, поэтому тесты держат именно отказы: неправдоподобный
 * продукт, неразобранное количество, вес блюда и БЖУ, расходящиеся с ВкусВиллом.
 *
 * Данные — из настоящих ответов ВкусВилла и нашего каталога (2026-10-10).
 *
 * Run: node --test scripts/__tests__/import-vkusvill-recipes.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
    catalogueQueries,
    chooseCandidate,
    compareWithVkusvill,
    deriveYield,
    eligible,
    ingredientGrams,
    ingredientLines,
    keyword,
    mealTypesFor,
    parseNumber,
    parseQuantity,
    parseVkusvillNutrition,
    plausible,
    totals,
} from '../vkusvill-import/lib.mjs'

test('числа: целые, дроби, диапазоны, запятая', () => {
    assert.equal(parseNumber('3'), 3)
    assert.equal(parseNumber('1,5'), 1.5)
    assert.equal(parseNumber('1/4'), 0.25)
    assert.equal(parseNumber('1 1/2'), 1.5)
    assert.equal(parseNumber('2-3'), 2.5)
    assert.equal(parseNumber('½'), 0.5)
    assert.equal(parseNumber('по вкусу'), null)
})

test('количества: граммы, килограммы, миллилитры', () => {
    assert.deepEqual(parseQuantity('50 г', 'Сыр'), { grams: 50 })
    assert.deepEqual(parseQuantity('0,5 кг', 'Говядина'), { grams: 500 })
    assert.deepEqual(parseQuantity('200 мл', 'Молоко'), { grams: 200 })
})

test('количества: штуки — по таблице, затем по весу штуки продукта', () => {
    assert.deepEqual(parseQuantity('6 шт.', 'Яйцо куриное'), { grams: 330 })
    assert.deepEqual(parseQuantity('2 шт.', 'Яйцо перепелиное'), { grams: 20 })
    assert.deepEqual(parseQuantity('1/4 шт.', 'Лимон'), { grams: 30 })
    assert.deepEqual(parseQuantity('2 зуб.', 'Чеснок'), { grams: 10 })
    assert.deepEqual(parseQuantity('2 шт.', 'Сырники замороженные', 75), { grams: 150 })
    assert.ok(parseQuantity('2 шт.', 'Сырники замороженные').error, 'без веса штуки — отказ, а не догадка')
})

test('количества: ложки, стакан, по вкусу, неразобранное', () => {
    assert.deepEqual(parseQuantity('2 ст. л.', 'Масло оливковое'), { grams: 30 })
    assert.deepEqual(parseQuantity('1 ч. л.', 'Соль'), { grams: 5 })
    assert.deepEqual(parseQuantity('1 стакан', 'Рис'), { grams: 200 })
    assert.deepEqual(parseQuantity('по вкусу', 'Перец'), { toTaste: true })
    assert.deepEqual(parseQuantity('для подачи', 'Зелень'), { toTaste: true })
    assert.ok(parseQuantity('1 упак.', 'Тесто').error)
})

test('КБЖУ товара ВкусВилла из свойства карточки', () => {
    const props = [{ name: 'Пищевая и энергетическая ценность в 100 г', value: 'белки 16 г, жиры 9 г, углеводы 3 г; 157 ккал Поставщики: …' }]
    assert.deepEqual(parseVkusvillNutrition(props), { kcal: 157, protein: 16, fat: 9, carbs: 3 })
    assert.deepEqual(
        parseVkusvillNutrition([{ name: 'Пищевая и энергетическая ценность в 100 г', value: 'белки 0,5 г, жиры 82,5 г; 748 ккал' }]),
        { kcal: 748, protein: 0.5, fat: 82.5, carbs: 0 }
    )
    assert.equal(parseVkusvillNutrition([{ name: 'Состав', value: 'молоко' }]), null)
})

test('правдоподобие продукта: калории без БЖУ — отказ (масло Mansanella с dev)', () => {
    assert.equal(plausible({ kcal_100: 890, protein_100: 0, fat_100: 0, carbs_100: 0 }), false)
    assert.equal(plausible({ kcal_100: 899, protein_100: 0, fat_100: 99.9, carbs_100: 0 }), true)
    assert.equal(plausible({ kcal_100: 0, protein_100: 0, fat_100: 0, carbs_100: 0 }), false)
    assert.equal(plausible({ kcal_100: 105.9, protein_100: 23.1, fat_100: 1.2, carbs_100: 0 }), true)
    assert.equal(plausible({ kcal_100: 500, protein_100: 1, fat_100: 1, carbs_100: 1 }), false, 'БЖУ не дают калорий')
})

test('ключевое слово названия', () => {
    assert.equal(keyword('Яйцо куриное'), 'яйцо')
    assert.ok('куриное филе'.includes(keyword('Куриное филе')))
    assert.ok('масло сливочное 82,5%'.includes(keyword('Масло сливочное')))
})

const butterRef = { kcal: 748, protein: 0.5, fat: 82.5, carbs: 0.8 }
test('выбор продукта: ближайший по КБЖУ среди названных так же', () => {
    const candidates = [
        { food_id: 'a', name: 'Масло сливочное 72,5%', kcal_100: 662, protein_100: 0.8, fat_100: 72.5, carbs_100: 1.3 },
        { food_id: 'b', name: 'Масло сливочное 82,5%', kcal_100: 748, protein_100: 0.6, fat_100: 82.5, carbs_100: 0.9 },
        { food_id: 'c', name: 'Сливочный соус', kcal_100: 748, protein_100: 0.6, fat_100: 82.5, carbs_100: 0.9 },
    ]
    const pick = chooseCandidate('Масло сливочное', candidates, butterRef)
    assert.equal(pick.candidate.food_id, 'b')
    assert.equal(pick.verified, true)
})

test('выбор продукта: калории далеко от ВкусВилла — без сверки, судит итоговая сверка блюда', () => {
    const light = { food_id: 'x', name: 'Масло сливочное лёгкое', kcal_100: 360, protein_100: 1, fat_100: 39, carbs_100: 1 }
    assert.deepEqual(chooseCandidate('Масло сливочное', [light], butterRef), { candidate: light, verified: false })
    const other = { food_id: 'z', name: 'Спред растительный', kcal_100: 360, protein_100: 1, fat_100: 39, carbs_100: 1 }
    assert.ok(chooseCandidate('Масло сливочное', [other], butterRef).error, 'назван иначе — отказ')
})

test('выбор продукта: без данных ВкусВилла — непроверенный, только правдоподобный', () => {
    const pick = chooseCandidate('Соль', [
        { food_id: 's1', name: 'Соль поваренная', kcal_100: 0, protein_100: 0, fat_100: 0, carbs_100: 0 },
        { food_id: 's2', name: 'Соль морская', kcal_100: 1, protein_100: 0, fat_100: 0, carbs_100: 0 },
    ], null)
    assert.equal(pick.candidate.food_id, 's2')
    assert.equal(pick.verified, false)
})

// Фриттата с овощами: 330 г яиц, 200 г овощной смеси, 20 г масла; у ВкусВилла 146 ккал на 100 г.
const egg = { kcal_100: 157, protein_100: 12.7, fat_100: 11.5, carbs_100: 0.7 }
const veg = { kcal_100: 30, protein_100: 1.5, fat_100: 0.2, carbs_100: 5 }
const butter = { kcal_100: 748, protein_100: 0.5, fat_100: 82.5, carbs_100: 0.8 }
const frittata = [
    { candidate: egg, grams: 330 },
    { candidate: veg, grams: 200 },
    { candidate: butter, grams: 20 },
    { candidate: egg, toTaste: true, grams: null },
]

test('сумма КБЖУ без ингредиентов «по вкусу»', () => {
    const t = totals(frittata)
    assert.equal(t.grams, 550)
    assert.equal(Math.round(t.kcal), 728)
})

test('вес блюда из калорийности ВкусВилла', () => {
    const t = totals(frittata)
    assert.deepEqual(deriveYield(t, { calories: t.kcal / 5 }), { grams: 500 })
    assert.ok(deriveYield(t, { calories: 30 }).error, 'вес в разы больше сырого — ошибка сопоставления')
    assert.ok(deriveYield(t, { calories: 0 }).error)
})

test('сверка БЖУ на 100 г с ВкусВиллом', () => {
    const t = totals(frittata)
    const per100 = { calories: t.kcal / 5, proteins: (t.protein / 500) * 100, fats: (t.fat / 500) * 100, carbs: (t.carbs / 500) * 100 }
    assert.deepEqual(compareWithVkusvill(t, 500, per100), { ok: true })
    assert.ok(compareWithVkusvill(t, 500, { ...per100, fats: 2 }).error, 'жир в разы меньше — отказ')
})

test('отбор: без «профи», праздников, соусов и напитков', () => {
    const base = { complexity: { id: 393 }, sections: [{ id: 2273, name: 'На обед' }], categories: [{ name: 'По типу блюда', items: [{ id: 332 }] }] }
    assert.equal(eligible(base), true)
    assert.equal(eligible({ ...base, complexity: { id: 395 } }), false)
    assert.equal(eligible({ ...base, sections: [{ id: 346, name: 'Новый год' }] }), false)
    assert.equal(eligible({ ...base, categories: [{ name: 'По типу блюда', items: [{ id: 331 }] }] }), false)
    assert.equal(eligible({ ...base, categories: [{ name: 'По типу блюда', items: [{ id: 331 }, { id: 332 }] }] }), true)
})

test('приёмы пищи: перекус для лёгких закусок и завтраков', () => {
    const salad = { sections: [{ name: 'Салаты' }] }
    assert.deepEqual(mealTypesFor(['lunch'], salad, 250), ['lunch', 'snack'])
    assert.deepEqual(mealTypesFor(['lunch'], salad, 600), ['lunch'])
    assert.deepEqual(mealTypesFor(['breakfast'], {}, 280), ['breakfast', 'snack'])
    assert.deepEqual(mealTypesFor([], {}, 500), ['lunch', 'dinner'])
})

// Случаи из сухого прогона на проде 2026-10-10: всё это отклонялось зря.
test('сокращения единиц ВкусВилла: щеп., кус., стак.', () => {
    assert.deepEqual(parseQuantity('1 щеп.', 'Соль'), { grams: 1 })
    assert.deepEqual(parseQuantity('2 кус.', 'Хлеб белый'), { grams: 60 })
    assert.deepEqual(parseQuantity('1 стак.', 'Крупа пшённая'), { grams: 200 })
})

test('запросы к каталогу: без сокращений, затем шире', () => {
    assert.deepEqual(catalogueQueries('Масло подсолнечное раф.'), ['Масло подсолнечное', 'Масло'])
    assert.deepEqual(catalogueQueries('Тесто слоёное бездрож.'), ['Тесто слоёное', 'Тесто'])
    assert.deepEqual(catalogueQueries('Шпинат зам.'), ['Шпинат'])
    assert.deepEqual(catalogueQueries('Сыр «Моцарелла» (для пиццы)'), ['Сыр Моцарелла', 'Сыр'])
})

test('карточка ВкусВилла не того товара: берётся продукт с тем же названием', () => {
    const yolk = { food_id: 'y', name: 'Яичный желток куриный', kcal_100: 352, protein_100: 16.2, fat_100: 31.2, carbs_100: 1 }
    const pick = chooseCandidate('Желток яичный', [yolk], { kcal: 157, protein: 12.7, fat: 11.5, carbs: 0.7 })
    assert.equal(pick.candidate.food_id, 'y')
    assert.equal(pick.verified, false)
})

test('без данных ВкусВилла и без продукта с тем же названием — отказ', () => {
    const other = { food_id: 'o', name: 'Курица тикка с лепёшкой', kcal_100: 192, protein_100: 12, fat_100: 8, carbs_100: 18 }
    assert.ok(chooseCandidate('Тыква', [other], null).error)
    assert.equal(chooseCandidate('Тыква', [{ ...other, name: 'Тыква мускатная', kcal_100: 26, protein_100: 1, fat_100: 0.1, carbs_100: 6.5 }], null).verified, false)
})

test('заголовки групп не ингредиенты — то же правило, что у серверного импорта', () => {
    const recipe = {
        ingredients: [
            { name: 'Мука', quantity: '200 г' },
            { name: '<b>Для начинки:</b>', quantity: null },
            { name: '<b>Для подачи:</b>', quantity: '' },
            { name: ' Творог ', quantity: '300 г' },
        ],
    }
    assert.deepEqual(ingredientLines(recipe).map((i) => i.name), ['Мука', 'Творог'])
})

test('веточки и лепёшки', () => {
    assert.deepEqual(parseQuantity('2 вет.', 'Укроп'), { grams: 4 })
    assert.deepEqual(parseQuantity('2 шт.', 'Лепёшка роти'), { grams: 120 })
})

test('надёжные штуки из сухого прогона; ломтики и упаковки — по-прежнему отказ', () => {
    assert.deepEqual(parseQuantity('2 шт.', 'Сельдерей стебель'), { grams: 80 })
    assert.deepEqual(parseQuantity('1 шт.', 'Манго'), { grams: 300 })
    assert.deepEqual(parseQuantity('3 шт.', 'Белок яичный'), { grams: 90 })
    assert.deepEqual(parseQuantity('2 кап.', 'Ваниль экстракт'), { toTaste: true })
    assert.ok(parseQuantity('3 шт.', 'Ветчина').error, 'ломтик ветчины — неизвестный вес')
    assert.ok(parseQuantity('1 уп.', 'Творог').error, 'упаковка — неизвестный вес')
})

test('экранированный заголовок группы — тоже не ингредиент', () => {
    const recipe = { ingredients: [{ name: '&lt;b&gt;Для подачи:&lt;/b&gt;', quantity: '1 шт.' }, { name: 'Соль &amp; перец', quantity: 'по вкусу' }] }
    assert.deepEqual(ingredientLines(recipe).map((i) => i.name), ['Соль & перец'])
})

test('вес ингредиента: до десятых и не ноль (лавровый лист 0,2 г)', () => {
    assert.equal(ingredientGrams(0.2), 0.2)
    assert.equal(ingredientGrams(0.04), 0.1)
    assert.equal(ingredientGrams(332.46), 332.5)
})
