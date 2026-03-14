/**
 * AI food recognition API function
 *
 * Compresses and uploads a photo for AI-powered food recognition.
 * Maps backend response to the RecognitionResult format expected by AIPhotoTab.
 *
 * @module food-tracker/api/recognizeFood
 */

import { compressImage } from './compressImage';
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

    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

    const response = await fetch('/api/v1/food-tracker/recognize', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Recognition failed: ${response.status}`);
    }

    const data = await response.json();
    const result: AIRecognitionResponse = data.data !== undefined ? data.data : data;

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
