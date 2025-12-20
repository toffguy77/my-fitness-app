/**
 * Типы для OCR функциональности
 */

export interface OCRResult {
  text: string
  confidence: number
  extractedData: ExtractedNutritionData
  rawText: string
  provider?: OCRProvider
  modelName?: string
  processingTimeMs?: number
}

export interface ExtractedNutritionData {
  productName?: string
  calories?: number
  protein?: number
  fats?: number
  carbs?: number
  weight?: number
  brand?: string
}

export type OCRProvider =
  | 'tesseract'
  | 'google_vision'
  | 'aws_textract'
  | 'lighton_ocr_1b'
  | 'deepseek_ocr'
  | 'paddleocr_vl'
  | 'qwen3_omni'
  | 'qwen3_vl_30b'
  | 'gemma_27b_vision'
  | 'openrouter_lighton'
  | 'openrouter_deepseek'
  | 'openrouter_paddleocr'
  | 'openrouter_qwen3_omni'
  | 'openrouter_qwen3_vl'
  | 'openrouter_gemma'
  | 'direct_qwen'

export type OCRModelTier = 'fast' | 'balanced' | 'advanced'

export interface OCRScanRecord {
  id: string
  user_id: string
  image_hash: string | null
  ocr_provider: OCRProvider
  model_name: string | null
  confidence: number | null
  success: boolean
  extracted_data: ExtractedNutritionData | null
  processing_time_ms: number | null
  cost_usd: number | null
  created_at: string
}

