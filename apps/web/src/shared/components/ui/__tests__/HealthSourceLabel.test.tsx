import { render, screen } from '@testing-library/react'
import { HealthSourceLabel } from '../HealthSourceLabel'

describe('HealthSourceLabel', () => {
    it('подписывает значение из Здоровья', () => {
        render(<HealthSourceLabel source="healthkit" />)
        expect(screen.getByText('из Здоровья')).toBeInTheDocument()
    })

    it.each([['manual'], [null], [undefined]])('ничего не показывает для %s', (source) => {
        const { container } = render(<HealthSourceLabel source={source} />)
        expect(container).toBeEmptyDOMElement()
    })
})
