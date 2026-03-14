/**
 * compressImage Unit Tests
 *
 * Tests for image compression utility used before AI food recognition upload.
 *
 * @module food-tracker/api/__tests__/compressImage.test
 */

import { compressImage } from '../compressImage';

// ============================================================================
// Mocks
// ============================================================================

const mockClose = jest.fn();

const createMockImageBitmap = (width: number, height: number) => ({
    width,
    height,
    close: mockClose,
});

let mockCanvasContext: {
    drawImage: jest.Mock;
};

let mockToBlob: jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();

    mockCanvasContext = {
        drawImage: jest.fn(),
    };

    mockToBlob = jest.fn((callback: (blob: Blob | null) => void, type: string) => {
        const blob = new Blob(['compressed'], { type });
        callback(blob);
    });

    // Mock document.createElement for canvas
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'canvas') {
            return {
                width: 0,
                height: 0,
                getContext: jest.fn(() => mockCanvasContext),
                toBlob: mockToBlob,
            } as unknown as HTMLCanvasElement;
        }
        return document.createElement.call(document, tag);
    });

    // Mock createImageBitmap
    (global as unknown as Record<string, unknown>).createImageBitmap = jest.fn(
        () => Promise.resolve(createMockImageBitmap(800, 600))
    );
});

afterEach(() => {
    jest.restoreAllMocks();
});

// ============================================================================
// Helper
// ============================================================================

const createMockFile = (name = 'photo.png', type = 'image/png'): File => {
    const blob = new Blob(['test-image-data'], { type });
    return new File([blob], name, { type });
};

// ============================================================================
// Tests
// ============================================================================

describe('compressImage', () => {
    it('does not resize image smaller than 1280px', async () => {
        (global as unknown as Record<string, unknown>).createImageBitmap = jest.fn(
            () => Promise.resolve(createMockImageBitmap(800, 600))
        );

        const file = createMockFile();
        const result = await compressImage(file);

        // Canvas dimensions should match original
        const canvas = (document.createElement as jest.Mock).mock.results.find(
            (r: jest.MockResult<unknown>) => (r as { type: string; value: Record<string, unknown> }).value?.toBlob
        )?.value;
        expect(canvas.width).toBe(800);
        expect(canvas.height).toBe(600);

        expect(result).toBeInstanceOf(File);
    });

    it('resizes image with width > 1280px (landscape)', async () => {
        (global as unknown as Record<string, unknown>).createImageBitmap = jest.fn(
            () => Promise.resolve(createMockImageBitmap(2560, 1920))
        );

        const file = createMockFile();
        await compressImage(file);

        const canvas = (document.createElement as jest.Mock).mock.results.find(
            (r: jest.MockResult<unknown>) => (r as { type: string; value: Record<string, unknown> }).value?.toBlob
        )?.value;
        expect(canvas.width).toBe(1280);
        expect(canvas.height).toBe(960);
    });

    it('resizes image with height > 1280px (portrait)', async () => {
        (global as unknown as Record<string, unknown>).createImageBitmap = jest.fn(
            () => Promise.resolve(createMockImageBitmap(1920, 2560))
        );

        const file = createMockFile();
        await compressImage(file);

        const canvas = (document.createElement as jest.Mock).mock.results.find(
            (r: jest.MockResult<unknown>) => (r as { type: string; value: Record<string, unknown> }).value?.toBlob
        )?.value;
        expect(canvas.width).toBe(960);
        expect(canvas.height).toBe(1280);
    });

    it('outputs as JPEG format', async () => {
        const file = createMockFile();
        const result = await compressImage(file);

        expect(mockToBlob).toHaveBeenCalledWith(
            expect.any(Function),
            'image/jpeg',
            0.8,
        );
        expect(result.type).toBe('image/jpeg');
    });

    it('returns File with correct type and .jpg extension', async () => {
        const file = createMockFile('photo.png', 'image/png');
        const result = await compressImage(file);

        expect(result).toBeInstanceOf(File);
        expect(result.type).toBe('image/jpeg');
        expect(result.name).toBe('photo.jpg');
    });

    it('closes ImageBitmap after drawing', async () => {
        const file = createMockFile();
        await compressImage(file);

        expect(mockClose).toHaveBeenCalled();
    });

    it('draws image on canvas with correct dimensions', async () => {
        (global as unknown as Record<string, unknown>).createImageBitmap = jest.fn(
            () => Promise.resolve(createMockImageBitmap(640, 480))
        );

        const file = createMockFile();
        await compressImage(file);

        expect(mockCanvasContext.drawImage).toHaveBeenCalledWith(
            expect.objectContaining({ width: 640, height: 480 }),
            0, 0, 640, 480,
        );
    });

    it('throws when canvas context is null', async () => {
        jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
            if (tag === 'canvas') {
                return {
                    width: 0,
                    height: 0,
                    getContext: jest.fn(() => null),
                    toBlob: mockToBlob,
                } as unknown as HTMLCanvasElement;
            }
            return document.createElement.call(document, tag);
        });

        const file = createMockFile();
        await expect(compressImage(file)).rejects.toThrow('Failed to get canvas 2d context');
    });

    it('throws when toBlob returns null', async () => {
        mockToBlob.mockImplementation((callback: (blob: Blob | null) => void) => {
            callback(null);
        });

        const file = createMockFile();
        await expect(compressImage(file)).rejects.toThrow('Failed to compress image');
    });
});
