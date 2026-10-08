import { t } from '@/shared/i18n'

/**
 * Цена для разметки — из той же строки, что видит человек.
 *
 * Отдельная числовая константа была бы вторым местом, где записана цена, и
 * однажды разошлась бы с первым — а разметка, расходящаяся с видимой ценой,
 * для поисковика повод не доверять странице.
 */
export function curatorPriceRub(): number {
    return Number(t('pricing.paidPrice').replace(/\D/g, ''))
}

/**
 * Product/Offer для платной части: Яндекс и Google читают из него цену.
 *
 * Отдельным модулем, а не в page.tsx: Next не пропускает из страницы
 * именованные экспорты, кроме своих, а тесту нужно вызвать это напрямую.
 */
export function curatorOfferJsonLd(pageUrl: string) {
    const price = curatorPriceRub()
    return {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: `BURCEV: ${t('pricing.paidTitle').toLowerCase()}`,
        description: t('pricing.lead'),
        brand: { '@type': 'Brand', name: 'BURCEV' },
        url: pageUrl,
        offers: {
            '@type': 'Offer',
            url: pageUrl,
            price,
            priceCurrency: 'RUB',
            priceSpecification: {
                '@type': 'UnitPriceSpecification',
                price,
                priceCurrency: 'RUB',
                unitCode: 'MON',
                referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
            },
            availability: 'https://schema.org/InStock',
            seller: { '@type': 'Organization', name: 'BURCEV', url: 'https://burcev.team' },
        },
    }
}
