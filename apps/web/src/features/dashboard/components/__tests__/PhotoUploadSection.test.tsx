/**
 * Unit tests for PhotoUploadSection component
 * Feature: dashboard
 *
 * Tests specific examples and edge cases for photo upload functionality
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhotoUploadSection } from '../PhotoUploadSection'
import { useDashboardStore } from '../../store/dashboardStore'
import type { PhotoData } from '../../types'

// Mock the store
jest.mock('../../store/dashboardStore')
const mockUseDashboardStore = useDashboardStore as jest.MockedFunction<typeof useDashboardStore>

// Mock toast
jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: {
        success: jest.fn(),
        error: jest.fn(),
    },
}))

/**
 * Helper: Create mock photo data
 */
function createMockPhotoData(overrides?: Partial<PhotoData>): PhotoData {
    return {
        id: 'photo-123',
        userId: 'user-123',
        weekStart: new Date('2024-01-01'),
        weekEnd: new Date('2024-01-07'),
        weekIdentifier: '2024-W01',
        photoUrl: 'https://example.com/photos/photo.jpg',
        fileSize: 1024 * 1024, // 1 MB
        mimeType: 'image/jpeg',
        uploadedAt: new Date('2024-01-07T12:00:00Z'),
        createdAt: new Date('2024-01-07T12:00:00Z'),
        ...overrides,
    }
}

/**
 * Helper: Create mock file
 */
function createMockFile(
    name: string,
    size: number,
    type: string
): File {
    const content = new Array(size).fill('a').join('')
    return new File([content], name, { type })
}

describe('PhotoUploadSection', () => {
    beforeEach(() => {
        jest.clearAllMocks()

        // Mock Date to a weekday (Monday) to avoid weekend reminder alert
        // interfering with getByRole('alert') queries in validation tests
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2024-01-01T12:00:00Z')) // Monday

        // Default mock implementation
        mockUseDashboardStore.mockReturnValue({
            uploadPhoto: jest.fn().mockResolvedValue(undefined),
            isLoading: false,
        } as any)
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    describe('Rendering', () => {
        it('renders section with heading', () => {
            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            expect(screen.getByRole('heading', { name: /фото прогресса/i })).toBeInTheDocument()
        })

        it('renders upload button when no photo uploaded', () => {
            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            expect(screen.getByRole('button', { name: /загрузить фото/i })).toBeInTheDocument()
        })

        it('renders file requirements', () => {
            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            expect(screen.getByText(/формат: jpeg, png или webp/i)).toBeInTheDocument()
            expect(screen.getByText(/максимальный размер: 10 мб/i)).toBeInTheDocument()
        })

        it('applies custom className', () => {
            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            const { container } = render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                    className="custom-class"
                />
            )

            const section = container.querySelector('.photo-upload-section')
            expect(section).toHaveClass('custom-class')
        })
    })

    describe('Photo Display', () => {
        it('displays uploaded photo with thumbnail', () => {
            const photoData = createMockPhotoData()
            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                    photoData={photoData}
                />
            )

            const thumbnail = screen.getByAltText(/фото прогресса за неделю/i)
            expect(thumbnail).toBeInTheDocument()
            expect(thumbnail).toHaveAttribute('src', photoData.photoUrl)
        })

        it('displays upload date for uploaded photo', () => {
            const photoData = createMockPhotoData({
                uploadedAt: new Date('2024-01-07T12:00:00Z'),
            })
            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                    photoData={photoData}
                />
            )

            expect(screen.getByText(/загружено:/i)).toBeInTheDocument()
        })

        it('displays uploaded indicator', () => {
            const photoData = createMockPhotoData()
            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                    photoData={photoData}
                />
            )

            // Check for screen reader text
            expect(screen.getByText('Загружено', { selector: '.sr-only' })).toBeInTheDocument()
        })

        it('shows re-upload button when photo exists', () => {
            const photoData = createMockPhotoData()
            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                    photoData={photoData}
                />
            )

            expect(screen.getByRole('button', { name: /загрузить другое фото/i })).toBeInTheDocument()
        })
    })

    describe('Weekend Behavior', () => {
        it('shows prominent button on Saturday', () => {
            jest.setSystemTime(new Date('2024-01-06T12:00:00Z')) // Saturday

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const button = screen.getByRole('button', { name: /загрузить фото прогресса/i })
            expect(button).toHaveClass('bg-blue-600')
        })

        it('shows prominent button on Sunday', () => {
            jest.setSystemTime(new Date('2024-01-07T12:00:00Z')) // Sunday

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const button = screen.getByRole('button', { name: /загрузить фото прогресса/i })
            expect(button).toHaveClass('bg-blue-600')
        })

        it('shows weekend reminder on Saturday', () => {
            jest.setSystemTime(new Date('2024-01-06T12:00:00Z')) // Saturday

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            expect(screen.getByText(/не забудьте загрузить фото прогресса/i)).toBeInTheDocument()
        })

        it('shows weekend reminder on Sunday', () => {
            jest.setSystemTime(new Date('2024-01-07T12:00:00Z')) // Sunday

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            expect(screen.getByText(/не забудьте загрузить фото прогресса/i)).toBeInTheDocument()
        })

        it('shows regular button on weekday', () => {
            // Already on Monday from beforeEach

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const button = screen.getByRole('button', { name: /загрузить фото/i })
            expect(button).toHaveClass('bg-gray-100')
            expect(button).not.toHaveClass('bg-blue-600')
        })

        it('does not show weekend reminder on weekday', () => {
            // Already on Monday from beforeEach

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            expect(screen.queryByText(/не забудьте загрузить фото прогресса/i)).not.toBeInTheDocument()
        })
    })

    describe('File Upload', () => {
        it('uploads valid JPEG file', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
            const mockUploadPhoto = jest.fn().mockResolvedValue(undefined)

            mockUseDashboardStore.mockReturnValue({
                uploadPhoto: mockUploadPhoto,
                isLoading: false,
            } as any)

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const file = createMockFile('photo.jpg', 1024, 'image/jpeg')
            const fileInput = screen.getByLabelText(/выбрать файл фото/i)

            await user.upload(fileInput, file)

            await waitFor(() => {
                expect(mockUploadPhoto).toHaveBeenCalledWith(
                    expect.stringMatching(/^\d{4}-W\d{2}$/),
                    file
                )
            })
        })

        it('uploads valid PNG file', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
            const mockUploadPhoto = jest.fn().mockResolvedValue(undefined)

            mockUseDashboardStore.mockReturnValue({
                uploadPhoto: mockUploadPhoto,
                isLoading: false,
            } as any)

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const file = createMockFile('photo.png', 1024, 'image/png')
            const fileInput = screen.getByLabelText(/выбрать файл фото/i)

            await user.upload(fileInput, file)

            await waitFor(() => {
                expect(mockUploadPhoto).toHaveBeenCalled()
            })
        })

        it('uploads valid WebP file', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
            const mockUploadPhoto = jest.fn().mockResolvedValue(undefined)

            mockUseDashboardStore.mockReturnValue({
                uploadPhoto: mockUploadPhoto,
                isLoading: false,
            } as any)

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const file = createMockFile('photo.webp', 1024, 'image/webp')
            const fileInput = screen.getByLabelText(/выбрать файл фото/i)

            await user.upload(fileInput, file)

            await waitFor(() => {
                expect(mockUploadPhoto).toHaveBeenCalled()
            })
        })

        it('shows preview after selecting file', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
            const mockUploadPhoto = jest.fn().mockResolvedValue(undefined)

            mockUseDashboardStore.mockReturnValue({
                uploadPhoto: mockUploadPhoto,
                isLoading: false,
            } as any)

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const file = createMockFile('photo.jpg', 1024, 'image/jpeg')
            const fileInput = screen.getByLabelText(/выбрать файл фото/i)

            await user.upload(fileInput, file)

            await waitFor(() => {
                expect(screen.getByAltText(/фото прогресса за неделю/i)).toBeInTheDocument()
            })
        })
    })

    describe('File Validation', () => {
        it('rejects file exceeding size limit', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
            const mockUploadPhoto = jest.fn()

            mockUseDashboardStore.mockReturnValue({
                uploadPhoto: mockUploadPhoto,
                isLoading: false,
            } as any)

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const file = createMockFile('photo.jpg', 11 * 1024 * 1024, 'image/jpeg') // 11 MB
            const fileInput = screen.getByLabelText(/выбрать файл фото/i)

            await user.upload(fileInput, file)

            await waitFor(() => {
                expect(screen.getByRole('alert')).toHaveTextContent(/10 МБ/i)
            })

            expect(mockUploadPhoto).not.toHaveBeenCalled()
        })

        it('rejects unsupported file type (GIF)', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
            const mockUploadPhoto = jest.fn()

            mockUseDashboardStore.mockReturnValue({
                uploadPhoto: mockUploadPhoto,
                isLoading: false,
            } as any)

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const file = createMockFile('photo.gif', 1024, 'image/gif')
            const fileInput = screen.getByLabelText(/выбрать файл фото/i)

            // Remove accept attribute to allow upload in test
            fileInput.removeAttribute('accept')
            await user.upload(fileInput, file)

            await waitFor(() => {
                expect(screen.getByRole('alert')).toHaveTextContent(/JPEG, PNG или WebP/i)
            }, { timeout: 2000 })

            expect(mockUploadPhoto).not.toHaveBeenCalled()
        })

        it('rejects unsupported file type (PDF)', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
            const mockUploadPhoto = jest.fn()

            mockUseDashboardStore.mockReturnValue({
                uploadPhoto: mockUploadPhoto,
                isLoading: false,
            } as any)

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const file = createMockFile('document.pdf', 1024, 'application/pdf')
            const fileInput = screen.getByLabelText(/выбрать файл фото/i)

            // Remove accept attribute to allow upload in test
            fileInput.removeAttribute('accept')
            await user.upload(fileInput, file)

            await waitFor(() => {
                expect(screen.getByRole('alert')).toHaveTextContent(/JPEG, PNG или WebP/i)
            }, { timeout: 2000 })

            expect(mockUploadPhoto).not.toHaveBeenCalled()
        })

        it('rejects empty file', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
            const mockUploadPhoto = jest.fn()

            mockUseDashboardStore.mockReturnValue({
                uploadPhoto: mockUploadPhoto,
                isLoading: false,
            } as any)

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const file = createMockFile('photo.jpg', 0, 'image/jpeg')
            const fileInput = screen.getByLabelText(/выбрать файл фото/i)

            await user.upload(fileInput, file)

            await waitFor(() => {
                expect(screen.getByRole('alert')).toHaveTextContent(/пустой/i)
            })

            expect(mockUploadPhoto).not.toHaveBeenCalled()
        })

        it('clears previous validation error on new upload', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
            const mockUploadPhoto = jest.fn().mockResolvedValue(undefined)

            mockUseDashboardStore.mockReturnValue({
                uploadPhoto: mockUploadPhoto,
                isLoading: false,
            } as any)

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            // Upload invalid file
            const invalidFile = createMockFile('photo.gif', 1024, 'image/gif')
            const fileInput = screen.getByLabelText(/выбрать файл фото/i)

            // Remove accept attribute to allow upload in test
            fileInput.removeAttribute('accept')
            await user.upload(fileInput, invalidFile)

            await waitFor(() => {
                expect(screen.getByRole('alert')).toBeInTheDocument()
            }, { timeout: 2000 })

            // Upload valid file
            const validFile = createMockFile('photo.jpg', 1024, 'image/jpeg')
            await user.upload(fileInput, validFile)

            await waitFor(() => {
                expect(screen.queryByRole('alert')).not.toBeInTheDocument()
            }, { timeout: 2000 })
        })
    })

    describe('Loading State', () => {
        it('disables upload button when loading', () => {
            mockUseDashboardStore.mockReturnValue({
                uploadPhoto: jest.fn(),
                isLoading: true,
            } as any)

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const button = screen.getByRole('button', { name: /загрузить фото/i })
            expect(button).toBeDisabled()
        })

        it('disables re-upload button when loading', () => {
            mockUseDashboardStore.mockReturnValue({
                uploadPhoto: jest.fn(),
                isLoading: true,
            } as any)

            const photoData = createMockPhotoData()
            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                    photoData={photoData}
                />
            )

            const button = screen.getByRole('button', { name: /загрузить другое фото/i })
            expect(button).toBeDisabled()
        })
    })

    describe('Error Handling', () => {
        it('handles upload error gracefully', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
            const mockUploadPhoto = jest.fn().mockRejectedValue(new Error('Upload failed'))

            mockUseDashboardStore.mockReturnValue({
                uploadPhoto: mockUploadPhoto,
                isLoading: false,
            } as any)

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const file = createMockFile('photo.jpg', 1024, 'image/jpeg')
            const fileInput = screen.getByLabelText(/выбрать файл фото/i)

            await user.upload(fileInput, file)

            // Wait for upload to be called
            await waitFor(() => {
                expect(mockUploadPhoto).toHaveBeenCalled()
            }, { timeout: 3000 })

            // Verify upload was attempted with correct parameters
            expect(mockUploadPhoto).toHaveBeenCalledWith(
                expect.stringMatching(/^\d{4}-W\d{2}$/),
                file
            )

            // Error is handled by store (toast notification)
            // Component continues to function normally
            expect(mockUploadPhoto).toHaveBeenCalledTimes(1)
        })
    })

    describe('Accessibility', () => {
        it('has proper ARIA labels', () => {
            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            expect(screen.getByLabelText(/выбрать файл фото/i)).toBeInTheDocument()
            expect(screen.getByRole('button', { name: /загрузить фото/i })).toBeInTheDocument()
        })

        it('has proper heading structure', () => {
            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const heading = screen.getByRole('heading', { name: /фото прогресса/i })
            expect(heading).toHaveAttribute('id', 'photo-upload-heading')
        })

        it('announces validation errors with role="alert"', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
            const mockUploadPhoto = jest.fn()

            mockUseDashboardStore.mockReturnValue({
                uploadPhoto: mockUploadPhoto,
                isLoading: false,
            } as any)

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const file = createMockFile('photo.gif', 1024, 'image/gif')
            const fileInput = screen.getByLabelText(/выбрать файл фото/i)

            // Remove accept attribute to allow upload in test
            fileInput.removeAttribute('accept')
            await user.upload(fileInput, file)

            await waitFor(() => {
                const alert = screen.getByRole('alert')
                expect(alert).toHaveAttribute('aria-live', 'polite')
            }, { timeout: 2000 })
        })

        it('has screen reader text for uploaded indicator', () => {
            const photoData = createMockPhotoData()
            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                    photoData={photoData}
                />
            )

            // Check for screen reader text specifically
            expect(screen.getByText('Загружено', { selector: '.sr-only' })).toBeInTheDocument()
        })
    })

    describe('Week Identifier', () => {
        it('generates correct week identifier format', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
            const mockUploadPhoto = jest.fn().mockResolvedValue(undefined)

            mockUseDashboardStore.mockReturnValue({
                uploadPhoto: mockUploadPhoto,
                isLoading: false,
            } as any)

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const file = createMockFile('photo.jpg', 1024, 'image/jpeg')
            const fileInput = screen.getByLabelText(/выбрать файл фото/i)

            await user.upload(fileInput, file)

            await waitFor(() => {
                expect(mockUploadPhoto).toHaveBeenCalled()
            })

            const [weekIdentifier] = mockUploadPhoto.mock.calls[0]
            expect(weekIdentifier).toMatch(/^\d{4}-W\d{2}$/)
        })
    })

    describe('Attention Indicators (Requirement 15.8)', () => {
        it('shows attention icon on Saturday when photo not uploaded', () => {
            jest.setSystemTime(new Date('2024-01-06T12:00:00Z')) // Saturday

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const icon = screen.getByRole('img', { name: /не забудьте загрузить фото/i })
            expect(icon).toBeInTheDocument()
            expect(icon).toHaveAttribute('data-urgency', 'high')
        })

        it('shows attention icon on Sunday when photo not uploaded', () => {
            jest.setSystemTime(new Date('2024-01-07T12:00:00Z')) // Sunday

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const icon = screen.getByRole('img', { name: /не забудьте загрузить фото/i })
            expect(icon).toBeInTheDocument()
        })

        it('does not show attention icon on weekday', () => {
            // Already on Monday from beforeEach

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            expect(screen.queryByRole('img', { name: /не забудьте загрузить фото/i })).not.toBeInTheDocument()
        })

        it('does not show attention icon when photo already uploaded', () => {
            jest.setSystemTime(new Date('2024-01-06T12:00:00Z')) // Saturday

            const photoData = createMockPhotoData()
            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                    photoData={photoData}
                />
            )

            expect(screen.queryByRole('img', { name: /не забудьте загрузить фото/i })).not.toBeInTheDocument()
        })

        it('attention icon has pulse animation', () => {
            jest.setSystemTime(new Date('2024-01-06T12:00:00Z')) // Saturday

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const icon = screen.getByRole('img', { name: /не забудьте загрузить фото/i })
            expect(icon).toHaveClass('animate-pulse')
        })

        it('has proper ARIA label for attention icon', () => {
            jest.setSystemTime(new Date('2024-01-06T12:00:00Z')) // Saturday

            const weekStart = new Date('2024-01-01')
            const weekEnd = new Date('2024-01-07')

            render(
                <PhotoUploadSection
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                />
            )

            const icon = screen.getByRole('img', { name: /не забудьте загрузить фото прогресса на выходных/i })
            expect(icon).toBeInTheDocument()
        })
    })
})
