/**
 * Чистая логика пакетного импорта рецептов ВкусВилла: разбор количеств,
 * выбор продукта нашего каталога для ингредиента, вес готового блюда и сверка
 * КБЖУ с данными ВкусВилла. Сети здесь нет — всё проверяется тестами
 * (`scripts/__tests__/import-vkusvill-recipes.test.mjs`).
 *
 * Рецепт без человеческой проверки уходит клиентам, поэтому каждое сомнение
 * здесь — отказ с причиной, а не догадка: рецепт, который не прошёл, не
 * импортируется и попадает в отчёт.
 */

/** Вес одной штуки по ключевому слову названия, граммы. Первое совпадение. */
export const PIECE_WEIGHTS = [
    ['белок яич', 30], ['желток', 18], ['перепел', 10],
    ['сельдерей стеб', 40], ['лавров', 0.2], ['ванил', 3],
    ['манго', 300], ['айв', 250], ['хурм', 200], ['пита', 60], ['круассан', 60], ['бриош', 60], ['бейгл', 90],
    ['кукуруза мини', 15], ['кукуруз', 250], ['пекинск', 800], ['редьк', 300],
    ['яйц', 55], ['яйко', 55],
    ['черри', 15],
    ['зубч', 5], ['чеснок', 5],
    ['лайм', 70], ['лимон', 120], ['апельсин', 200], ['мандарин', 80], ['грейпфрут', 350],
    ['яблок', 160], ['груш', 160], ['банан', 120], ['авокадо', 170], ['киви', 70],
    ['персик', 150], ['нектарин', 150], ['абрикос', 40], ['слив', 30], ['финик', 8], ['инжир', 50],
    ['помидор', 120], ['томат', 120], ['огур', 120], ['морков', 90], ['свекл', 200],
    ['картоф', 120], ['батат', 200], ['кабач', 300], ['цукини', 300], ['баклажан', 300],
    ['перец чили', 15], ['чили', 15], ['перец', 150],
    ['порей', 150], ['лук', 90], ['редис', 15], ['шампиньон', 20], ['гриб', 20],
    ['лепёш', 60], ['лепеш', 60], ['роти', 60], ['лаваш', 80], ['тортиль', 50], ['булоч', 60], ['хлеб', 30], ['багет', 250],
    ['сосиск', 50], ['креветк', 15], ['филе', 200], ['груд', 200], ['бедр', 120], ['голен', 100],
    ['стейк', 200], ['имбир', 30], ['грецк', 5],
]

/** Меры объёма и прочие единицы, граммы за единицу. `null` — вес не вывести. */
const MEASURES = [
    [/^(ст\.?\s*л\.?|столов\S*\s+ложк\S*)$/, 15],
    [/^(ч\.?\s*л\.?|чайн\S*\s+ложк\S*)$/, 5],
    [/^стак\S*$/, 200],
    [/^щеп\S*$/, 1],
    [/^пуч\S*$/, 30],
    [/^вет\S*$/, 2],
    [/^лист\S*$/, 1],
    [/^горст\S*$/, 30],
    [/^долек|^дольк\S*$/, 10],
    [/^банк\S*$/, 400],
]

const TO_TASTE = /\bкап\S*$|по вкусу|для подачи|для смазывания|для жарки|для украшения|по желанию/i

/**
 * Ингредиенты рецепта без заголовков групп («<b>Для начинки:</b>»): у
 * заголовка нет количества или в названии разметка. Правило то же, что у
 * серверного импорта (`isSectionHeading` в recipes/vkusvill.go), — иначе
 * порядок ингредиентов разойдётся с черновиком.
 */
export function ingredientLines(recipe) {
    return (recipe.ingredients ?? [])
        .filter((ing) => ing.quantity != null && !String(ing.name ?? '').includes('<'))
        .map((ing) => ({ ...ing, name: String(ing.name).replace(/<[^>]*>/g, '').trim() }))
        .filter((ing) => ing.name !== '')
}

/** Число из «2», «1,5», «1/4», «½», «2-3» (среднее). `null`, если числа нет. */
export function parseNumber(text) {
    const s = text.replace(',', '.').replace('½', '0.5').replace('¼', '0.25').replace('¾', '0.75').trim()
    let m = s.match(/^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/)
    if (m) return (Number(m[1]) + Number(m[2])) / 2
    m = s.match(/^(\d+)\s+(\d+)\/(\d+)/)
    if (m) return Number(m[1]) + Number(m[2]) / Number(m[3])
    m = s.match(/^(\d+)\/(\d+)/)
    if (m) return Number(m[1]) / Number(m[2])
    m = s.match(/^(\d+(?:\.\d+)?)/)
    if (m) return Number(m[1])
    return null
}

/** Вес штуки для ингредиента: таблица по названию, иначе вес штуки продукта. */
export function pieceWeight(name, productDefaultWeight) {
    const n = name.toLowerCase()
    for (const [key, grams] of PIECE_WEIGHTS) if (n.includes(key)) return grams
    return productDefaultWeight > 0 ? productDefaultWeight : null
}

/**
 * Граммы по подписи количества ВкусВилла.
 * Возвращает `{ toTaste: true }`, `{ grams }` или `{ error }`.
 */
export function parseQuantity(quantity, ingredientName, productDefaultWeight = 0) {
    const q = (quantity ?? '').trim().toLowerCase()
    if (!q || TO_TASTE.test(q)) return { toTaste: true }
    const amount = parseNumber(q)
    if (amount === null || !(amount > 0)) return { error: `нет числа в «${quantity}»` }
    const unit = q.replace(/^[\d.,/\s½¼¾\-–—]+/, '').trim()
    if (/^(г|гр|грамм\S*)\.?$/.test(unit)) return { grams: amount }
    if (/^кг\.?$/.test(unit)) return { grams: amount * 1000 }
    if (/^мл\.?$/.test(unit)) return { grams: amount }
    if (/^л\.?$/.test(unit)) return { grams: amount * 1000 }
    if (/^(шт\S*|штук\S*|зуб\S*|зубчик\S*|головк\S*|кус\S*|ломт\S*|)$/.test(unit)) {
        const isClove = /^зуб/.test(unit) || /зубч/.test(ingredientName.toLowerCase())
        const weight = isClove ? 5 : /^головк/.test(unit) ? 40 : pieceWeight(ingredientName, productDefaultWeight)
        return weight ? { grams: amount * weight } : { error: `вес штуки «${ingredientName}» неизвестен` }
    }
    for (const [re, grams] of MEASURES) if (re.test(unit)) return { grams: amount * grams }
    return { error: `единица «${unit}» не разобрана` }
}

/** КБЖУ товара ВкусВилла на 100 г из свойства «Пищевая и энергетическая ценность в 100 г». */
export function parseVkusvillNutrition(properties = []) {
    const prop = properties.find((p) => /Пищевая и энергетическая ценность/i.test(p.name ?? ''))
    if (!prop) return null
    const v = prop.value.replace(/,/g, '.')
    const num = (re) => {
        const m = v.match(re)
        return m ? Number(m[1]) : null
    }
    const n = {
        kcal: num(/(\d+(?:\.\d+)?)\s*ккал/i),
        protein: num(/белк\S*\s+(\d+(?:\.\d+)?)/i),
        fat: num(/жир\S*\s+(\d+(?:\.\d+)?)/i),
        carbs: num(/углевод\S*\s+(\d+(?:\.\d+)?)/i),
    }
    return n.kcal === null ? null : { kcal: n.kcal, protein: n.protein ?? 0, fat: n.fat ?? 0, carbs: n.carbs ?? 0 }
}

/** Продукт каталога правдоподобен: калории есть и сходятся с БЖУ. */
export function plausible(c) {
    if (!(c.kcal_100 > 0)) return false
    const macros = (c.protein_100 ?? 0) + (c.fat_100 ?? 0) + (c.carbs_100 ?? 0)
    if (macros === 0) return c.kcal_100 < 30 // вода, специи без данных — допустимо только для «пустых» продуктов
    const atwater = 4 * (c.protein_100 ?? 0) + 9 * (c.fat_100 ?? 0) + 4 * (c.carbs_100 ?? 0)
    return Math.abs(atwater - c.kcal_100) <= 0.3 * c.kcal_100 + 25
}

/**
 * Запросы к каталогу от точного к широкому: очищенное название (без
 * сокращений вида «раф.», «зам.», «бездрож.» и скобок), первые два слова,
 * первое слово. «Масло подсолнечное раф.» целиком не находит ничего.
 */
export function catalogueQueries(name) {
    const clean = name
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[«»"]/g, ' ')
        .split(/\s+/)
        .filter((w) => w && !/\.$/.test(w))
        .join(' ')
        .trim()
    const words = clean.split(/\s+/).filter(Boolean)
    return [...new Set([clean, words.slice(0, 2).join(' '), words[0]].filter(Boolean))]
}

/** Главное слово названия ингредиента — для проверки, что продукт про то же. */
export function keyword(name) {
    const words = name.toLowerCase().replace(/[«»"().,]/g, ' ').split(/\s+/).filter((w) => w.length >= 3)
    return words.length ? words[0].slice(0, Math.max(4, Math.min(6, words[0].length - 1))) : name.toLowerCase()
}

/**
 * Выбор продукта каталога для ингредиента.
 * `reference` — КБЖУ товара ВкусВилла (может быть `null`).
 * Возвращает `{ candidate, verified }` или `{ error }`.
 */
export function chooseCandidate(ingredientName, candidates, reference) {
    const key = keyword(ingredientName)
    const named = candidates.filter((c) => c.name.toLowerCase().includes(key))
    const pool = (named.length ? named : candidates).filter(plausible)
    if (!pool.length) return { error: `нет правдоподобного продукта для «${ingredientName}»` }
    // Без сверки по карточке — только продукт, названный так же: проверкой ему
    // служит итоговая сверка БЖУ всего блюда с ВкусВиллом.
    if (!reference) {
        return named.length
            ? { candidate: pool[0], verified: false }
            : { error: `«${ingredientName}»: нет ни данных ВкусВилла, ни продукта с тем же названием` }
    }
    const dist = (c) =>
        Math.abs(c.kcal_100 - reference.kcal) / Math.max(reference.kcal, 50) +
        (0.5 *
            (Math.abs((c.protein_100 ?? 0) - reference.protein) +
                Math.abs((c.fat_100 ?? 0) - reference.fat) +
                Math.abs((c.carbs_100 ?? 0) - reference.carbs))) /
            (reference.protein + reference.fat + reference.carbs + 5)
    const best = [...pool].sort((a, b) => dist(a) - dist(b))[0]
    const kcalOff = Math.abs(best.kcal_100 - reference.kcal)
    if (kcalOff > Math.max(25, 0.35 * reference.kcal)) {
        // Карточка ВкусВилла в ссылке бывает не тем товаром (желток → яйцо
        // целиком). Названный так же продукт берётся без сверки — блюдо целиком
        // всё равно проверяется; иначе отказ.
        const sameName = named.filter(plausible)
        if (sameName.length) return { candidate: sameName[0], verified: false }
        return { error: `«${ingredientName}»: ближайший продукт «${best.name}» ${best.kcal_100} ккал против ${reference.kcal} у ВкусВилла` }
    }
    return { candidate: best, verified: true }
}

/** Сумма КБЖУ ингредиентов (граммы × на 100 г). */
export function totals(lines) {
    const t = { kcal: 0, protein: 0, fat: 0, carbs: 0, grams: 0 }
    for (const l of lines) {
        if (l.toTaste) continue
        const k = l.grams / 100
        t.kcal += l.candidate.kcal_100 * k
        t.protein += (l.candidate.protein_100 ?? 0) * k
        t.fat += (l.candidate.fat_100 ?? 0) * k
        t.carbs += (l.candidate.carbs_100 ?? 0) * k
        t.grams += l.grams
    }
    return t
}

/**
 * Вес готового блюда из калорийности ВкусВилла на 100 г: сумма калорий
 * ингредиентов ÷ ккал на 100 г × 100. Отказ, если вес неправдоподобен
 * относительно сырых ингредиентов (ошибка сопоставления или данных).
 */
export function deriveYield(sum, vvPer100) {
    if (!vvPer100 || !(vvPer100.calories > 0)) return { error: 'у рецепта ВкусВилла нет калорийности на 100 г' }
    const grams = Math.round((sum.kcal / vvPer100.calories) * 100)
    const ratio = grams / sum.grams
    if (!(ratio >= 0.45 && ratio <= 1.6)) {
        return { error: `вес блюда ${grams} г при ${Math.round(sum.grams)} г сырых ингредиентов (×${ratio.toFixed(2)})` }
    }
    return { grams }
}

/** БЖУ на 100 г готового блюда сходятся с ВкусВиллом в пределах допуска. */
export function compareWithVkusvill(sum, yieldGrams, vvPer100) {
    const ours = {
        proteins: (sum.protein / yieldGrams) * 100,
        fats: (sum.fat / yieldGrams) * 100,
        carbs: (sum.carbs / yieldGrams) * 100,
    }
    const off = []
    for (const k of ['proteins', 'fats', 'carbs']) {
        const theirs = Number(vvPer100[k] ?? 0)
        if (Math.abs(ours[k] - theirs) > Math.max(3, 0.3 * theirs)) {
            off.push(`${k}: ${ours[k].toFixed(1)} против ${theirs}`)
        }
    }
    return off.length ? { error: `БЖУ на 100 г расходятся с ВкусВиллом (${off.join('; ')})` } : { ok: true }
}

const THEMATIC = new Set([345, 346, 348, 648, 1291, 1292, 2412])
const NOT_A_MEAL = new Set([331, 350]) // соусы, напитки
const PROFI = 395

/** Рецепт ВкусВилла годится в каталог: не «профи», не праздничный, не соус и не напиток. */
export function eligible(recipe) {
    if (recipe.complexity?.id === PROFI) return false
    const sections = new Set((recipe.sections ?? []).map((s) => s.id))
    for (const id of sections) if (THEMATIC.has(id)) return false
    const dishTypes = (recipe.categories ?? []).find((g) => g.name === 'По типу блюда')?.items ?? []
    if (dishTypes.length && dishTypes.every((d) => NOT_A_MEAL.has(d.id))) return false
    return true
}

/** Приёмы пищи: из импорта, плюс перекус для лёгких закусок, салатов и десертов и лёгких завтраков. */
export function mealTypesFor(imported, recipe, portionKcal) {
    const out = new Set(imported?.length ? imported : ['lunch', 'dinner'])
    const names = new Set((recipe.sections ?? []).map((s) => s.name))
    const snacky = ['Закуски', 'Салаты', 'Десерты'].some((n) => names.has(n))
    if ((snacky && portionKcal <= 350) || (out.has('breakfast') && portionKcal <= 300)) out.add('snack')
    return ['breakfast', 'lunch', 'dinner', 'snack'].filter((m) => out.has(m))
}
