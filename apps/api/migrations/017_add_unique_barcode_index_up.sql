-- Migration: Add unique constraint on food_items.barcode
-- Required for ON CONFLICT (barcode) in import tool and existing saveOFFProduct()
-- Version: 017

-- Drop the old non-unique index
DROP INDEX IF EXISTS idx_food_items_barcode;

-- Create a unique partial index (NULL barcodes are allowed, but non-NULL must be unique)
CREATE UNIQUE INDEX idx_food_items_barcode_unique ON food_items(barcode) WHERE barcode IS NOT NULL;
