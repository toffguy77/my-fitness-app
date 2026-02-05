-- Migration: Create Notifications Table
-- Description: Creates notifications table for user notifications system
-- Version: 002
-- Date: 2026-01-27

-- ============================================================================
-- 1. Create notifications table
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(20) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  icon_url VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,

  CONSTRAINT notifications_category_check CHECK (category IN ('main', 'content')),
  CONSTRAINT notifications_type_check CHECK (type IN ('trainer_feedback', 'achievement', 'reminder', 'system_update', 'new_feature', 'general'))
);

-- Create indexes for optimized queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_category ON notifications(user_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- Add comments
COMMENT ON TABLE notifications IS 'User notifications for personal and content updates';
COMMENT ON COLUMN notifications.user_id IS 'Reference to the user who receives this notification';
COMMENT ON COLUMN notifications.category IS 'Notification category: main (personal) or content (general)';
COMMENT ON COLUMN notifications.type IS 'Notification type: trainer_feedback, achievement, reminder, system_update, new_feature, general';
COMMENT ON COLUMN notifications.title IS 'Notification title (max 255 characters)';
COMMENT ON COLUMN notifications.content IS 'Notification content/message';
COMMENT ON COLUMN notifications.icon_url IS 'Optional URL to custom icon or image';
COMMENT ON COLUMN notifications.created_at IS 'Timestamp when notification was created';
COMMENT ON COLUMN notifications.read_at IS 'Timestamp when notification was marked as read (NULL if unread)';

-- ============================================================================
-- Migration complete
-- ============================================================================
