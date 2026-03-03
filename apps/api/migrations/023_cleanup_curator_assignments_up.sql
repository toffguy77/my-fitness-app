-- Migration: Clean up bad curator assignments
-- Description: Remove curator_client_relationships and conversations where client is a coordinator or admin
-- Version: 023
-- Date: 2026-03-03

-- Remove relationships where client is a coordinator or admin
DELETE FROM curator_client_relationships
WHERE client_id IN (SELECT id FROM users WHERE role IN ('coordinator', 'admin'));

-- Remove conversations where client is a coordinator or admin
DELETE FROM conversations
WHERE client_id IN (SELECT id FROM users WHERE role IN ('coordinator', 'admin'));
