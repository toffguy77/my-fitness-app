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
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        postFormData: jest.fn(),
    },
}));

import { apiClient } from '@/shared/utils/api-client';

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

const mockCompressImage = compressImageModule.compressImage as jest.MockedFunction<
    typeof compressImageModule.compressImage
>;

// ============================================================================
// Test Data
// ============================================================================

const createMockFile = (name = 'photo.jpg'): File => {
    const blob = new Blob(['test'], { type: 'image/jpeg' });
    return new File([blob], name, { type: 'image/jpeg' });
};

const mockAiResponse = {
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
};

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
    jest.clearAllMocks();

    const compressedFile = createMockFile('photo.jpg');
    mockCompressImage.mockResolvedValue(compressedFile);
});

// ============================================================================
// Tests
// ============================================================================

describe('recognizeFood', () => {
    it('sends FormData with compressed photo to postFormData', async () => {
        mockApiClient.postFormData.mockResolvedValueOnce(mockAiResponse);

        const photo = createMockFile();
        await recognizeFood(photo);

        expect(mockCompressImage).toHaveBeenCalledWith(photo);
        expect(mockApiClient.postFormData).toHaveBeenCalledWith(
            '/api/v1/food-tracker/recognize',
            expect.any(FormData),
        );

        // Verify FormData contains the photo
        const formData = (mockApiClient.postFormData as jest.Mock).mock.calls[0][1] as FormData;
        expect(formData.get('photo')).toBeTruthy();
    });

    it('correctly maps RecognizedFood[] to RecognitionResult[]', async () => {
        mockApiClient.postFormData.mockResolvedValueOnce(mockAiResponse);

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
        mockApiClient.postFormData.mockResolvedValueOnce(mockAiResponse);

        const results = await recognizeFood(createMockFile());

        expect(results[0].food.id).toMatch(/^ai-/);
        expect(results[1].food.id).toMatch(/^ai-/);
        expect(results[0].food.id).not.toBe(results[1].food.id);
    });

    it('throws on HTTP error response (API request failed)', async () => {
        const error: any = new Error('API request failed');
        error.response = { status: 500, data: { message: 'Internal server error' } };
        mockApiClient.postFormData.mockRejectedValueOnce(error);

        await expect(recognizeFood(createMockFile())).rejects.toThrow('API request failed');
    });

    it('throws on network error', async () => {
        mockApiClient.postFormData.mockRejectedValueOnce(new TypeError('Failed to fetch'));

        await expect(recognizeFood(createMockFile())).rejects.toThrow('Failed to fetch');
    });

    it('handles response without data wrapper', async () => {
        mockApiClient.postFormData.mockResolvedValueOnce(mockAiResponse);

        const results = await recognizeFood(createMockFile());
        expect(results).toHaveLength(2);
        expect(results[0].food.name).toBe('Яблоко');
    });
});
