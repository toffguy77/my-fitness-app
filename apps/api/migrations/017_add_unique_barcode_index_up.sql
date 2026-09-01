-- IF NOT EXISTS added so the chain can be applied to an empty database:
-- several of these objects are also created by earlier migrations, and a
-- bare CREATE aborted the run. Idempotent statements are a no-op where the
-- object already exists, so production is unaffected.
-- Migration: Add unique constraint on food_items.barcode
-- Required for ON CONFLICT (barcode) in import tool and existing saveOFFProduct()
-- Version: 017

-- Drop the old non-unique index
DROP INDEX IF EXISTS idx_food_items_barcode;

-- Create a unique partial index (NULL barcodes are allowed, but non-NULL must be unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_food_items_barcode_unique ON food_items(barcode) WHERE barcode IS NOT NULL;
