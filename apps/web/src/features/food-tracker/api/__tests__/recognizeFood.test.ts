/**
 * recognizeFood Unit Tests
 *
 * Tests for the AI food recognition API function.
 *
 * @module food-tracker/api/__tests__/recognizeFood.test
 */

import { recognizeFood } from '../recognizeFood';
import * as compressImageModule from '../compressImage';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('../compressImage');

const mockCompressImage = compressImageModule.compressImage as jest.MockedFunction<
    typeof compressImageModule.compressImage
>;

const mockFetch = jest.fn();
(global as unknown as Record<string, unknown>).fetch = mockFetch;

// ============================================================================
// Test Data
// ============================================================================

const createMockFile = (name = 'photo.jpg'): File => {
    const blob = new Blob(['test'], { type: 'image/jpeg' });
    return new File([blob], name, { type: 'image/jpeg' });
};

const mockBackendResponse = {
    data: {
        foods: [
            {
                name: 'Яблоко',
                confidence: 0.95,
                estimated_weight: 150,
                nutrition: {
                    calories: 52,
                    protein: 0.3,
                    fat: 0.2,
                    carbs: 14,
                },
            },
            {
                name: 'Банан',
                confidence: 0.82,
                estimated_weight: 120,
                nutrition: {
                    calories: 89,
                    protein: 1.1,
                    fat: 0.3,
                    carbs: 23,
                },
            },
        ],
        composition: [
            {
                name: 'Яблоко',
                confidence: 0.95,
                estimated_weight: 150,
                nutrition: { calories: 52, protein: 0.3, fat: 0.2, carbs: 14 },
            },
        ],
    },
};

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
    jest.clearAllMocks();

    const compressedFile = createMockFile('photo.jpg');
    mockCompressImage.mockResolvedValue(compressedFile);

    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
        value: {
            getItem: jest.fn(() => 'test-token-123'),
            setItem: jest.fn(),
            removeItem: jest.fn(),
        },
        writable: true,
    });
});

// ============================================================================
// Tests
// ============================================================================

describe('recognizeFood', () => {
    it('sends FormData with compressed photo', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockBackendResponse),
        });

        const photo = createMockFile();
        await recognizeFood(photo);

        expect(mockCompressImage).toHaveBeenCalledWith(photo);
        expect(mockFetch).toHaveBeenCalledWith(
            '/api/v1/food-tracker/recognize',
            expect.objectContaining({
                method: 'POST',
                body: expect.any(FormData),
            }),
        );

        // Verify FormData contains the photo
        const fetchCall = mockFetch.mock.calls[0];
        const formData = fetchCall[1].body as FormData;
        expect(formData.get('photo')).toBeTruthy();
    });

    it('includes auth token in request headers', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockBackendResponse),
        });

        await recognizeFood(createMockFile());

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].headers).toEqual({
            Authorization: 'Bearer test-token-123',
        });
    });

    it('correctly maps RecognizedFood[] to RecognitionResult[]', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockBackendResponse),
        });

        const results = await recognizeFood(createMockFile());

        expect(results).toHaveLength(2);

        // First item
        expect(results[0].confidence).toBe(0.95);
        expect(results[0].food.name).toBe('Яблоко');
        expect(results[0].food.source).toBe('ai');
        expect(results[0].food.verified).toBe(false);
        expect(results[0].food.servingSize).toBe(150);
        expect(results[0].food.servingUnit).toBe('г');
        expect(results[0].food.category).toBe('ai');

        // Nutrition values are already per 100g from backend — passed through directly
        expect(results[0].food.nutritionPer100.calories).toBe(52);
        expect(results[0].food.nutritionPer100.protein).toBe(0.3);
        expect(results[0].food.nutritionPer100.fat).toBe(0.2);
        expect(results[0].food.nutritionPer100.carbs).toBe(14);

        // Second item
        expect(results[1].confidence).toBe(0.82);
        expect(results[1].food.name).toBe('Банан');
        expect(results[1].food.nutritionPer100.calories).toBe(89);

        // Composition is passed through
        expect(results[0].composition).toBeDefined();
        expect(results[0].composition).toHaveLength(1);
    });

    it('generates unique IDs for each food item', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockBackendResponse),
        });

        const results = await recognizeFood(createMockFile());

        expect(results[0].food.id).toMatch(/^ai-/);
        expect(results[1].food.id).toMatch(/^ai-/);
        expect(results[0].food.id).not.toBe(results[1].food.id);
    });

    it('throws on HTTP error response', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ message: 'Internal server error' }),
        });

        await expect(recognizeFood(createMockFile())).rejects.toThrow('Internal server error');
    });

    it('throws with status code when error response has no message', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 503,
            json: () => Promise.reject(new Error('Invalid JSON')),
        });

        await expect(recognizeFood(createMockFile())).rejects.toThrow('Recognition failed: 503');
    });

    it('handles network errors', async () => {
        mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

        await expect(recognizeFood(createMockFile())).rejects.toThrow('Failed to fetch');
    });

    it('handles response without data wrapper', async () => {
        const unwrappedResponse = {
            foods: mockBackendResponse.data.foods,
            composition: mockBackendResponse.data.composition,
        };

        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(unwrappedResponse),
        });

        const results = await recognizeFood(createMockFile());
        expect(results).toHaveLength(2);
        expect(results[0].food.name).toBe('Яблоко');
    });
});
