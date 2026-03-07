/**
 * Unit tests for AudienceSelector component
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { AudienceSelector } from '../AudienceSelector'

describe('AudienceSelector', () => {
    const defaultProps = {
        value: 'all' as const,
        onChange: jest.fn(),
        clientIds: [] as number[],
        onClientIdsChange: jest.fn(),
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders all audience options', () => {
        render(<AudienceSelector {...defaultProps} />)

        expect(screen.getByText('Все пользователи')).toBeInTheDocument()
        expect(screen.getByText('Мои клиенты')).toBeInTheDocument()
        expect(screen.getByText('Выборочно')).toBeInTheDocument()
    })

    it('renders fieldset with legend', () => {
        render(<AudienceSelector {...defaultProps} />)

        expect(screen.getByText('Аудитория')).toBeInTheDocument()
    })

    it('shows selected option as checked', () => {
        render(<AudienceSelector {...defaultProps} value="my_clients" />)

        const radios = screen.getAllByRole('radio')
        const myClientsRadio = radios.find(
            (r) => (r as HTMLInputElement).value === 'my_clients'
        )
        expect(myClientsRadio).toBeChecked()
    })

    it('calls onChange when option is selected', () => {
        const onChange = jest.fn()
        render(<AudienceSelector {...defaultProps} onChange={onChange} />)

        const radios = screen.getAllByRole('radio')
        const selectedRadio = radios.find(
            (r) => (r as HTMLInputElement).value === 'selected'
        )
        fireEvent.click(selectedRadio!)

        expect(onChange).toHaveBeenCalledWith('selected')
    })

    it('shows "coming soon" notice when "selected" is chosen', () => {
        render(<AudienceSelector {...defaultProps} value="selected" />)

        expect(
            screen.getByText('Выбор конкретных клиентов будет добавлен позже')
        ).toBeInTheDocument()
    })

    it('does not show "coming soon" notice for other options', () => {
        render(<AudienceSelector {...defaultProps} value="all" />)

        expect(
            screen.queryByText('Выбор конкретных клиентов будет добавлен позже')
        ).not.toBeInTheDocument()
    })

    it('renders radio inputs with correct name', () => {
        render(<AudienceSelector {...defaultProps} />)

        const radios = screen.getAllByRole('radio')
        radios.forEach((radio) => {
            expect(radio).toHaveAttribute('name', 'audience_scope')
        })
    })
})
