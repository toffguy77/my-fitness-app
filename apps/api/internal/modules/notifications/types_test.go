package notifications

import (
	"testing"
	"time"
)

func TestNotificationCategory_IsValid(t *testing.T) {
	tests := []struct {
		name     string
		category NotificationCategory
		want     bool
	}{
		{
			name:     "valid main category",
			category: CategoryMain,
			want:     true,
		},
		{
			name:     "valid content category",
			category: CategoryContent,
			want:     true,
		},
		{
			name:     "invalid category",
			category: NotificationCategory("invalid"),
			want:     false,
		},
		{
			name:     "empty category",
			category: NotificationCategory(""),
			want:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.category.IsValid(); got != tt.want {
				t.Errorf("NotificationCategory.IsValid() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestNotificationType_IsValid(t *testing.T) {
	tests := []struct {
		name string
		typ  NotificationType
		want bool
	}{
		{
			name: "valid trainer_feedback type",
			typ:  TypeTrainerFeedback,
			want: true,
		},
		{
			name: "valid achievement type",
			typ:  TypeAchievement,
			want: true,
		},
		{
			name: "valid reminder type",
			typ:  TypeReminder,
			want: true,
		},
		{
			name: "valid system_update type",
			typ:  TypeSystemUpdate,
			want: true,
		},
		{
			name: "valid new_feature type",
			typ:  TypeNewFeature,
			want: true,
		},
		{
			name: "valid general type",
			typ:  TypeGeneral,
			want: true,
		},
		{
			name: "invalid type",
			typ:  NotificationType("invalid"),
			want: false,
		},
		{
			name: "empty type",
			typ:  NotificationType(""),
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.typ.IsValid(); got != tt.want {
				t.Errorf("NotificationType.IsValid() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestNotification_Validate(t *testing.T) {
	validIconURL := "https://example.com/icon.png"
	longIconURL := string(make([]byte, 501))

	tests := []struct {
		name    string
		notif   *Notification
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid notification",
			notif: &Notification{
				ID:        "123e4567-e89b-12d3-a456-426614174000",
				UserID:    1,
				Category:  CategoryMain,
				Type:      TypeTrainerFeedback,
				Title:     "Test Notification",
				Content:   "This is a test notification",
				IconURL:   &validIconURL,
				CreatedAt: time.Now(),
			},
			wantErr: false,
		},
		{
			name: "missing user_id",
			notif: &Notification{
				ID:       "123e4567-e89b-12d3-a456-426614174000",
				UserID:   0,
				Category: CategoryMain,
				Type:     TypeTrainerFeedback,
				Title:    "Test",
				Content:  "Test content",
			},
			wantErr: true,
			errMsg:  "user_id is required and must be positive",
		},
		{
			name: "negative user_id",
			notif: &Notification{
				ID:       "123e4567-e89b-12d3-a456-426614174000",
				UserID:   -1,
				Category: CategoryMain,
				Type:     TypeTrainerFeedback,
				Title:    "Test",
				Content:  "Test content",
			},
			wantErr: true,
			errMsg:  "user_id is required and must be positive",
		},
		{
			name: "invalid category",
			notif: &Notification{
				ID:       "123e4567-e89b-12d3-a456-426614174000",
				UserID:   1,
				Category: NotificationCategory("invalid"),
				Type:     TypeTrainerFeedback,
				Title:    "Test",
				Content:  "Test content",
			},
			wantErr: true,
			errMsg:  "invalid category: invalid",
		},
		{
			name: "invalid type",
			notif: &Notification{
				ID:       "123e4567-e89b-12d3-a456-426614174000",
				UserID:   1,
				Category: CategoryMain,
				Type:     NotificationType("invalid"),
				Title:    "Test",
				Content:  "Test content",
			},
			wantErr: true,
			errMsg:  "invalid type: invalid",
		},
		{
			name: "empty title",
			notif: &Notification{
				ID:       "123e4567-e89b-12d3-a456-426614174000",
				UserID:   1,
				Category: CategoryMain,
				Type:     TypeTrainerFeedback,
				Title:    "",
				Content:  "Test content",
			},
			wantErr: true,
			errMsg:  "title is required",
		},
		{
			name: "title too long",
			notif: &Notification{
				ID:       "123e4567-e89b-12d3-a456-426614174000",
				UserID:   1,
				Category: CategoryMain,
				Type:     TypeTrainerFeedback,
				Title:    string(make([]byte, 256)),
				Content:  "Test content",
			},
			wantErr: true,
			errMsg:  "title must be 255 characters or less",
		},
		{
			name: "empty content",
			notif: &Notification{
				ID:       "123e4567-e89b-12d3-a456-426614174000",
				UserID:   1,
				Category: CategoryMain,
				Type:     TypeTrainerFeedback,
				Title:    "Test",
				Content:  "",
			},
			wantErr: true,
			errMsg:  "content is required",
		},
		{
			name: "icon_url too long",
			notif: &Notification{
				ID:       "123e4567-e89b-12d3-a456-426614174000",
				UserID:   1,
				Category: CategoryMain,
				Type:     TypeTrainerFeedback,
				Title:    "Test",
				Content:  "Test content",
				IconURL:  &longIconURL,
			},
			wantErr: true,
			errMsg:  "icon_url must be 500 characters or less",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.notif.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Notification.Validate() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if tt.wantErr && err.Error() != tt.errMsg {
				t.Errorf("Notification.Validate() error message = %v, want %v", err.Error(), tt.errMsg)
			}
		})
	}
}
