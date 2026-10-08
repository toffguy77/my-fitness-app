/**
 * Страница тарифов — та, на которую ссылается публичная оферта.
 *
 * Способности передаются явно: страница спрашивает их у живого `/ready`, и
 * сеть в тесте сделала бы условный рендер недетерминированным. Тот же приём,
 * что у теста посадочной.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import PricingPage, { metadata } from '../page'
import { curatorOfferJsonLd } from '../curatorOffer'
import { DISALLOW, robotsTxt } from '../../robots.txt/robotsTxt'
import sitemap from '../../sitemap'

jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ children, href, ...rest }: React.PropsWithChildren<{ href: string }>) => (
        <a href={href} {...rest}>{children}</a>
    ),
}))

jest.mock('@/features/onboarding/components/PricingRequestForm', () => ({
    PricingRequestForm: () => <form data-testid="pricing-request-form" />,
}))

const allOn = { food_recognition: true, weekly_photos: true }

async function renderPricing(features: Record<string, boolean> = allOn) {
    render(await PricingPage({ features }))
}

describe('PricingPage', () => {
    it('называет состав платной услуги и цену за месяц', async () => {
        await renderPricing()

        expect(screen.getByText('Переписка с куратором')).toBeInTheDocument()
        expect(screen.getByText('Недельный план КБЖУ')).toBeInTheDocument()
        expect(screen.getByText('Письменный разбор недели')).toBeInTheDocument()
        expect(screen.getByText('5000 ₽')).toBeInTheDocument()
        expect(screen.getByText('в месяц')).toBeInTheDocument()
    })

    it('называет бесплатную часть', async () => {
        await renderPricing()

        expect(screen.getByText('Расчёт личной нормы КБЖУ и воды')).toBeInTheDocument()
        expect(screen.getByText('Дневник питания: поиск, штрихкод, ручной ввод')).toBeInTheDocument()
        expect(screen.getByText('Вся своя история и выгрузка данных')).toBeInTheDocument()
    })

    // Обещание распознавания еды там, где для него нет учётных данных, — это
    // обещание отказа 503.
    it('не обещает выключенную способность', async () => {
        await renderPricing({ food_recognition: false, weekly_photos: false })

        expect(screen.queryByText('Распознавание еды по фото')).not.toBeInTheDocument()
        expect(screen.queryByText('Разбор фотографий прогресса')).not.toBeInTheDocument()
    })

    it('обещает включённую способность', async () => {
        await renderPricing()

        expect(screen.getByText('Распознавание еды по фото')).toBeInTheDocument()
        expect(screen.getByText('Разбор фотографий прогресса')).toBeInTheDocument()
    })

    // Отказ `/ready` не должен превращаться в обещание: обещание, которое некому
    // подтвердить, не даётся.
    it('при пустом ответе о способностях ничего о них не утверждает', async () => {
        await renderPricing({})

        expect(screen.queryByText('Распознавание еды по фото')).not.toBeInTheDocument()
        expect(screen.queryByText('Разбор фотографий прогресса')).not.toBeInTheDocument()
        // Остальное на месте: страница и без тезисов о способностях работает.
        expect(screen.getByText('5000 ₽')).toBeInTheDocument()
    })

    it('называет правила возврата и ведёт в оферту', async () => {
        await renderPricing()

        expect(screen.getByText(/Возврат в первые 7 дней/)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Условия оказания услуг' }))
            .toHaveAttribute('href', '/legal/terms')
    })

    it('даёт оставить заявку', async () => {
        await renderPricing()

        expect(screen.getByTestId('pricing-request-form')).toBeInTheDocument()
    })

    it('объявляет себя канонической по своему адресу', () => {
        expect(metadata.alternates?.canonical).toBe('https://burcev.team/pricing')
    })

    // Шаблон корневого layout дописывает «| BURCEV» сам: бренд в заголовке
    // страницы давал «Тарифы — BURCEV | BURCEV».
    it('не повторяет бренд в заголовке', () => {
        expect(String(metadata.title)).not.toContain('BURCEV')
    })

    // Свой блок openGraph заменяет родительский целиком: без картинки здесь
    // ссылка на тарифы уходила в мессенджеры без превью.
    it('отдаёт картинку для превью ссылки', () => {
        const images = metadata.openGraph?.images
        expect(Array.isArray(images) ? images : [images]).toEqual([
            expect.objectContaining({ url: '/opengraph-image' }),
        ])
    })

    it('размечает цену той же суммой, что видна на странице', async () => {
        const { container } = render(await PricingPage({ features: allOn }))
        const script = container.querySelector('script[type="application/ld+json"]')
        const data = JSON.parse(script?.textContent ?? '{}')

        expect(data).toEqual(curatorOfferJsonLd('https://burcev.team/pricing'))
        expect(data['@type']).toBe('Product')
        expect(data.offers.price).toBe(5000)
        expect(data.offers.priceCurrency).toBe('RUB')
        expect(data.offers.priceSpecification.unitCode).toBe('MON')
        expect(screen.getByText(`${data.offers.price} ₽`)).toBeInTheDocument()
    })
})

describe('страница тарифов открыта поиску', () => {
    // Обязательство, доступное только своим, необязательством не становится, но
    // проверить его снаружи невозможно.
    it('не входит в число закрытых от индексации', () => {
        // Прочитано так, как читает робот: по префиксу. Перечислять /pricing в
        // Allow не нужно — Allow: / его покрывает.
        expect(DISALLOW.some((prefix) => '/pricing'.startsWith(prefix))).toBe(false)
        expect(robotsTxt()).toMatch(/^Allow: \/$/m)
    })

    // Эквайринг проверяет, что продавец назван на странице, где продаётся.
    it('называет продавца внизу страницы', async () => {
        await renderPricing()

        const footer = screen.getByRole('contentinfo')
        expect(footer).toHaveTextContent('ИП Бурцев С. В.')
        expect(footer).toHaveTextContent('ИНН 572006540445')
        expect(footer).toHaveTextContent('ОГРНИП 324774600419913')
    })

    it('присутствует в карте сайта', async () => {
        const urls = (await sitemap()).map((entry) => entry.url)

        expect(urls).toContain('https://burcev.team/pricing')
    })
})
