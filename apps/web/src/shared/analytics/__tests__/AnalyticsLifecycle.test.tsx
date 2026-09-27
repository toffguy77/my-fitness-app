/**
 * Отправка при уходе со страницы включена везде, а не только на посадочной.
 *
 * `startAnalytics()` звали только `TrackView` и `TrackScrollDepth`, стоящие на
 * посадочной и в гостевом мастере. На дневнике питания, в чате и на дашборде
 * обработчики `pagehide` и `visibilitychange` не регистрировались, и событие,
 * попавшее в очередь там, гибло при переходе — требование спеки «отправка при
 * уходе со страницы» на этих страницах не выполнялось.
 */

import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { AnalyticsLifecycle } from '../AnalyticsLifecycle'

const startAnalytics = jest.fn()
jest.mock('../client', () => ({
    startAnalytics: () => startAnalytics(),
}))

describe('AnalyticsLifecycle', () => {
    beforeEach(() => {
        startAnalytics.mockClear()
    })

    it('включает отправку при монтировании', () => {
        render(<AnalyticsLifecycle />)

        expect(startAnalytics).toHaveBeenCalledTimes(1)
    })

    it('ничего не рисует', () => {
        const { container } = render(<AnalyticsLifecycle />)

        expect(container).toBeEmptyDOMElement()
    })
})

describe('корневой макет', () => {
    // Читается исходник: смысл в том, что компонент стоит именно в корне, а не
    // на отдельной странице. Возвращение к старому — по экрану — должно ронять
    // тест, а не обнаруживаться пропавшими событиями.
    it('монтирует его в корне, рядом со сшивкой посетителя', () => {
        const source = readFileSync(join(__dirname, '../../../app/layout.tsx'), 'utf8')

        expect(source).toContain('<AnalyticsLifecycle />')
        expect(source).toContain('<AnalyticsIdentity />')
    })
})
