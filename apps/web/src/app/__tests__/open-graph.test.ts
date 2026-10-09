/**
 * Open Graph у каждой публичной страницы — полный.
 *
 * Next не сливает `openGraph` страницы с блоком layout: страница, назвавшая
 * свой заголовок, теряла всё остальное. Так пропали og:image, а потом og:type
 * — валидатор Яндекса назвал его отсутствие ошибкой на / и /pricing.
 */
import type { Metadata } from 'next'
import { metadata as layout } from '../layout'
import { metadata as home } from '../page'
import { metadata as pricing } from '../pricing/page'
import { metadata as content } from '../content/page'
import { metadata as calculator } from '../kalkulyator-kbzhu/page'
import { metadata as author } from '../avtor/sergey-burcev/page'
import { openGraph, OPEN_GRAPH_BASE } from '@/shared/constants/seo'

jest.mock('@/features/onboarding/components/KbzhuCalculator', () => ({
    KbzhuCalculator: () => null,
}))

type OG = { type?: string; locale?: string; siteName?: string; images?: unknown }

describe('Open Graph публичных страниц', () => {
    it.each([
        ['layout', layout, 'website'],
        ['/', home, 'website'],
        ['/pricing', pricing, 'website'],
        ['/content', content, 'website'],
        ['/kalkulyator-kbzhu', calculator, 'website'],
        ['/avtor/sergey-burcev', author, 'profile'],
    ] as [string, Metadata, string][])('%s несёт тип, сайт, язык и картинку', (_page, metadata, type) => {
        const og = metadata.openGraph as OG

        expect(og.type).toBe(type)
        expect(og.siteName).toBe('BURCEV')
        expect(og.locale).toBe('ru_RU')
        expect(og.images).toEqual([expect.objectContaining({ url: '/opengraph-image' })])
    })

    it('поля страницы перекрывают общие, остальное остаётся', () => {
        const og = openGraph({
            type: 'article',
            title: 'Статья',
            images: [{ url: 'https://example.com/cover.jpg' }],
        }) as OG & { title?: string }

        expect(og.type).toBe('article')
        expect(og.title).toBe('Статья')
        expect(og.images).toEqual([{ url: 'https://example.com/cover.jpg' }])
        expect(og.siteName).toBe(OPEN_GRAPH_BASE.siteName)
        expect(og.locale).toBe(OPEN_GRAPH_BASE.locale)
    })
})
