DROP INDEX IF EXISTS idx_food_items_barcode_unique;
CREATE INDEX idx_food_items_barcode ON food_items(barcode) WHERE barcode IS NOT NULL;
