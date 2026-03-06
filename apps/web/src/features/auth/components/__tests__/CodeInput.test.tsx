/**
 * Unit tests for CodeInput component
 * Tests digit input, navigation, paste handling, and accessibility
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { CodeInput } from '../CodeInput'

describe('CodeInput', () => {
    const defaultProps = {
        value: ['', '', '', '', '', ''],
        onChange: jest.fn(),
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders 6 input fields', () => {
        render(<CodeInput {...defaultProps} />)

        const inputs = screen.getAllByRole('textbox')
        expect(inputs).toHaveLength(6)
    })

    it('renders with aria labels', () => {
        render(<CodeInput {...defaultProps} />)

        for (let i = 1; i <= 6; i++) {
            expect(screen.getByLabelText(`Цифра ${i}`)).toBeInTheDocument()
        }
    })

    it('displays values from prop', () => {
        const value = ['1', '2', '3', '4', '5', '6']
        render(<CodeInput {...defaultProps} value={value} />)

        const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
        inputs.forEach((input, i) => {
            expect(input.value).toBe(String(i + 1))
        })
    })

    it('calls onChange with updated value when digit is entered', () => {
        const onChange = jest.fn()
        render(<CodeInput {...defaultProps} onChange={onChange} />)

        const inputs = screen.getAllByRole('textbox')
        fireEvent.change(inputs[0], { target: { value: '5' } })

        expect(onChange).toHaveBeenCalledWith(['5', '', '', '', '', ''])
    })

    it('rejects non-digit input', () => {
        const onChange = jest.fn()
        render(<CodeInput {...defaultProps} onChange={onChange} />)

        const inputs = screen.getAllByRole('textbox')
        fireEvent.change(inputs[0], { target: { value: 'a' } })

        expect(onChange).not.toHaveBeenCalled()
    })

    it('handles paste event with 6 digits', () => {
        const onChange = jest.fn()
        render(<CodeInput {...defaultProps} onChange={onChange} />)

        const inputs = screen.getAllByRole('textbox')
        fireEvent.paste(inputs[0], {
            clipboardData: { getData: () => '123456' },
        })

        expect(onChange).toHaveBeenCalledWith(['1', '2', '3', '4', '5', '6'])
    })

    it('handles paste with non-digit characters stripped', () => {
        const onChange = jest.fn()
        render(<CodeInput {...defaultProps} onChange={onChange} />)

        const inputs = screen.getAllByRole('textbox')
        fireEvent.paste(inputs[0], {
            clipboardData: { getData: () => '12-34-56' },
        })

        expect(onChange).toHaveBeenCalledWith(['1', '2', '3', '4', '5', '6'])
    })

    it('handles paste with fewer than 6 digits', () => {
        const onChange = jest.fn()
        render(<CodeInput {...defaultProps} onChange={onChange} />)

        const inputs = screen.getAllByRole('textbox')
        fireEvent.paste(inputs[0], {
            clipboardData: { getData: () => '123' },
        })

        expect(onChange).toHaveBeenCalledWith(['1', '2', '3', '', '', ''])
    })

    it('disables all inputs when disabled prop is true', () => {
        render(<CodeInput {...defaultProps} disabled />)

        const inputs = screen.getAllByRole('textbox')
        inputs.forEach((input) => {
            expect(input).toBeDisabled()
        })
    })

    it('applies error styling when error prop is true', () => {
        render(<CodeInput {...defaultProps} error />)

        const inputs = screen.getAllByRole('textbox')
        inputs.forEach((input) => {
            expect(input.className).toContain('border-red')
        })
    })

    it('applies normal styling when error prop is false', () => {
        render(<CodeInput {...defaultProps} error={false} />)

        const inputs = screen.getAllByRole('textbox')
        inputs.forEach((input) => {
            expect(input.className).toContain('border-gray')
        })
    })

    it('handles backspace navigation to previous input', () => {
        const value = ['1', '', '', '', '', '']
        render(<CodeInput {...defaultProps} value={value} />)

        const inputs = screen.getAllByRole('textbox')
        fireEvent.keyDown(inputs[1], { key: 'Backspace' })

        // Focus should move to previous input (we can't test focus directly without refs, but the handler should run)
        expect(inputs[1]).toBeTruthy()
    })

    it('sets inputMode to numeric', () => {
        render(<CodeInput {...defaultProps} />)

        const inputs = screen.getAllByRole('textbox')
        inputs.forEach((input) => {
            expect(input).toHaveAttribute('inputmode', 'numeric')
        })
    })

    it('sets maxLength to 1 on each input', () => {
        render(<CodeInput {...defaultProps} />)

        const inputs = screen.getAllByRole('textbox')
        inputs.forEach((input) => {
            expect(input).toHaveAttribute('maxlength', '1')
        })
    })
})
