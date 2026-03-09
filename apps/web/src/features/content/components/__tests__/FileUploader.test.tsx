/**
 * Unit tests for FileUploader component
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { FileUploader } from '../FileUploader'

describe('FileUploader', () => {
    it('renders the import button', () => {
        render(<FileUploader onFileLoaded={jest.fn()} />)

        expect(screen.getByText('Импорт .md файла')).toBeInTheDocument()
    })

    it('has a hidden file input with markdown accept types', () => {
        const { container } = render(<FileUploader onFileLoaded={jest.fn()} />)

        const input = container.querySelector('input[type="file"]')
        expect(input).toBeTruthy()
        expect(input).toHaveAttribute('accept', '.md,.markdown,text/markdown')
        expect(input).toHaveClass('hidden')
    })

    it('calls onFileLoaded when file is selected', async () => {
        const onFileLoaded = jest.fn()
        const { container } = render(<FileUploader onFileLoaded={onFileLoaded} />)

        const input = container.querySelector('input[type="file"]') as HTMLInputElement

        // Create a mock file
        const file = new File(['# Test Markdown'], 'test.md', {
            type: 'text/markdown',
        })

        // Mock FileReader
        const mockReadAsText = jest.fn()
        const mockReader = {
            readAsText: mockReadAsText,
            onload: null as any,
            result: '# Test Markdown',
        }
        jest.spyOn(window, 'FileReader').mockImplementation(() => mockReader as any)

        fireEvent.change(input, { target: { files: [file] } })

        // Trigger the onload callback
        mockReader.onload!()

        expect(onFileLoaded).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Test Markdown',
                body: '',
            }),
            'test.md'
        )
        expect(mockReadAsText).toHaveBeenCalledWith(file)

        jest.restoreAllMocks()
    })

    it('does nothing when no file is selected', () => {
        const onFileLoaded = jest.fn()
        const { container } = render(<FileUploader onFileLoaded={onFileLoaded} />)

        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [] } })

        expect(onFileLoaded).not.toHaveBeenCalled()
    })
})
