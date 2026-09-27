import { test, expect } from '../fixtures/session'
import { freshAddress } from '../fixtures/mail'

/**
 * Первый экран новичка.
 *
 * Стоит вместо ручного «зарегистрироваться и посмотреть, что видно». Новичок
 * встречал блок «Недостаточно данных» на пол-экрана — утверждение, которое он и
 * сам знает, — а куратор, главное отличие продукта от бесплатного счётчика
 * калорий, лежал в самом низу страницы свёрнутым и у новичка не рисовался вовсе:
 * отзыв на недельный отчёт без отчёта не существует.
 *
 * Свежая учётная запись и есть новичок: ни профиля, ни записей о еде, ни
 * сообщений куратору. Адрес от `freshAddress` попадает под шаблоны зачистки
 * стенда.
 */

test.use({ role: undefined })

const PASSWORD = 'E2eStand!2026'

async function registerNewcomer(context: import('@playwright/test').BrowserContext, baseURL: string) {
    const registered = await context.request.post(`${baseURL}/api/v1/auth/register`, {
        data: {
            email: freshAddress(),
            password: PASSWORD,
            name: 'Новичок Первой Недели',
            consents: {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false,
            },
        },
    })
    expect(registered.status(), await registered.text()).toBe(201)
}

test.describe('первый экран новичка', () => {
    test('вместо «Недостаточно данных» — чек-лист первой недели', async ({
        page,
        context,
        baseURL,
    }) => {
        await registerNewcomer(context, baseURL!)
        await page.goto('/dashboard')

        await expect(page.getByText('Первая неделя')).toBeVisible({ timeout: 20000 })

        // Ровно то, на что жаловались: пустой блок на пол-экрана.
        await expect(page.getByText('Недостаточно данных')).toHaveCount(0)

        // Каждый пункт ведёт туда, где его можно выполнить немедленно. Пункта
        // про фото тарелки может не быть — распознавание включено не на каждом
        // развёртывании, и тогда его не показывают вовсе.
        await expect(page.getByRole('link', { name: 'Заполнить профиль' })).toHaveAttribute(
            'href',
            '/settings/body',
        )
        await expect(
            page.getByRole('link', { name: 'Познакомиться с куратором' }),
        ).toHaveAttribute('href', '/chat')
    })

    test('куратор виден сразу, не в глубине страницы', async ({ page, context, baseURL }) => {
        await registerNewcomer(context, baseURL!)
        await page.goto('/dashboard')

        const card = page.getByTestId('curator-card')
        await expect(card).toBeVisible({ timeout: 20000 })

        // Состояние ошибки — не то же самое, что «куратор не назначен»: первое
        // говорит о сбое, второе о учётной записи человека. Проверка требует,
        // чтобы ответ пришёл.
        await expect(page.getByTestId('curator-card-error')).toHaveCount(0)

        // Карточка стоит выше календаря: куратора должно быть видно до всего
        // остального, а не после прокрутки.
        const cardBox = await card.boundingBox()
        const calendarBox = await page
            .getByRole('radiogroup', { name: 'Выбор дня недели' })
            .boundingBox()
        expect(cardBox, 'карточка куратора не отрисована').not.toBeNull()
        expect(calendarBox, 'календарь не отрисован').not.toBeNull()
        expect(cardBox!.y).toBeLessThan(calendarBox!.y)
    })

    test('пункт про фото тарелки ведёт прямо в распознавание', async ({
        page,
        context,
        baseURL,
    }) => {
        await registerNewcomer(context, baseURL!)
        await page.goto('/dashboard')
        await expect(page.getByText('Первая неделя')).toBeVisible({ timeout: 20000 })

        const platePhoto = page.getByRole('link', { name: 'Сфотографировать тарелку' })
        if ((await platePhoto.count()) === 0) {
            test.skip(true, 'распознавание еды по фото на этом развёртывании выключено')
        }

        await expect(platePhoto).toHaveAttribute('href', '/food-tracker?add=photo')
        await platePhoto.click()

        // Распознавание живёт внутри окна записи еды, и ссылка обязана открыть
        // его именно там: пункт, который нельзя выполнить по ссылке из него
        // самого, хуже отсутствующего.
        await expect(page.getByRole('tab', { name: /Фото/i })).toHaveAttribute(
            'aria-selected',
            'true',
        )
    })
})
