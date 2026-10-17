import { render, screen } from '@testing-library/react'
import { AppleHealthStatus } from '../AppleHealthStatus'

describe('AppleHealthStatus', () => {
    it('объясняет, что Здоровье подключается в приложении на iPhone', () => {
        render(<AppleHealthStatus connected={false} />)

        expect(screen.getByText(/Подключается в приложении на iPhone/)).toBeInTheDocument()
        expect(screen.getByText(/импорт не перезаписывает/)).toBeInTheDocument()
    })

    it('показывает «Подключено на iPhone», когда признак стоит', () => {
        render(<AppleHealthStatus connected />)

        expect(screen.getByTestId('apple-health-state')).toHaveTextContent('Подключено на iPhone')
        expect(screen.getByText(/Отключить можно там же/)).toBeInTheDocument()
    })

    it('показывает «Не подключено», когда признак снят', () => {
        render(<AppleHealthStatus connected={false} />)

        expect(screen.getByTestId('apple-health-state')).toHaveTextContent('Не подключено')
        expect(screen.queryByText(/Отключить можно там же/)).not.toBeInTheDocument()
    })

    it('не даёт ничего переключить из браузера', () => {
        render(<AppleHealthStatus connected={false} />)

        expect(screen.queryByRole('switch')).not.toBeInTheDocument()
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
})
