/**
 * AI food recognition API function
 *
 * Compresses and uploads a photo for AI-powered food recognition.
 * Maps backend response to the RecognitionResult format expected by AIPhotoTab.
 *
 * @module food-tracker/api/recognizeFood
 */

import { compressImage } from './compressImage';
import { apiClient } from '@/shared/utils/api-client';
import type { AIRecognitionResponse, RecognizedFood } from '../types';
import type { RecognitionResult } from '../components/AIPhotoTab';

/**
 * Get estimated weight from a recognized food item,
 * handling both camelCase and snake_case field names from backend.
 */
function getEstimatedWeight(food: RecognizedFood): number {
    return food.estimatedWeight ?? food.estimated_weight ?? 0;
}

/**
 * Recognize food items from a photo using the AI recognition API.
 *
 * @param photo - Image file to analyze
 * @returns Array of recognition results with FoodItem and confidence
 */
export async function recognizeFood(photo: File): Promise<RecognitionResult[]> {
    const compressed = await compressImage(photo);

    const formData = new FormData();
    formData.append('photo', compressed);

    const result = await apiClient.postFormData<AIRecognitionResponse>('/api/v1/food-tracker/recognize', formData);

    return result.foods.map((food, index) => ({
        food: {
            id: `ai-${Date.now()}-${index}`,
            name: food.name,
            category: 'ai',
            servingSize: getEstimatedWeight(food),
            servingUnit: 'г',
            nutritionPer100: {
                calories: food.nutrition.calories,
                protein: food.nutrition.protein,
                fat: food.nutrition.fat,
                carbs: food.nutrition.carbs,
            },
            source: 'ai' as const,
            verified: false,
        },
        confidence: food.confidence,
        composition: result.composition,
    }));
}
