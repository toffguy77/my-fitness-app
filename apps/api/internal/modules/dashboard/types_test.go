package dashboard

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// TestDailyMetricsValidate tests the DailyMetrics.Validate method
func TestDailyMetricsValidate(t *testing.T) {
	tests := []struct {
		name    string
		metrics *DailyMetrics
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid metrics",
			metrics: &DailyMetrics{
				UserID:   1,
				Date:     time.Now(),
				Calories: 2000,
				Protein:  150,
				Fat:      60,
				Carbs:    200,
				Steps:    10000,
			},
			wantErr: false,
		},
		{
			name: "invalid user_id",
			metrics: &DailyMetrics{
				UserID:   0,
				Date:     time.Now(),
				Calories: 2000,
			},
			wantErr: true,
			errMsg:  "user_id is required and must be positive",
		},
		{
			name: "missing date",
			metrics: &DailyMetrics{
				UserID:   1,
				Calories: 2000,
			},
			wantErr: true,
			errMsg:  "date is required",
		},
		{
			name: "negative calories",
			metrics: &DailyMetrics{
				UserID:   1,
				Date:     time.Now(),
				Calories: -100,
			},
			wantErr: true,
			errMsg:  "calories must be non-negative",
		},
		{
			name: "negative protein",
			metrics: &DailyMetrics{
				UserID:   1,
				Date:     time.Now(),
				Calories: 2000,
				Protein:  -50,
			},
			wantErr: true,
			errMsg:  "protein must be non-negative",
		},
		{
			name: "negative fat",
			metrics: &DailyMetrics{
				UserID:   1,
				Date:     time.Now(),
				Calories: 2000,
				Protein:  150,
				Fat:      -10,
			},
			wantErr: true,
			errMsg:  "fat must be non-negative",
		},
		{
			name: "negative carbs",
			metrics: &DailyMetrics{
				UserID:   1,
				Date:     time.Now(),
				Calories: 2000,
				Protein:  150,
				Fat:      60,
				Carbs:    -50,
			},
			wantErr: true,
			errMsg:  "carbs must be non-negative",
		},
		{
			name: "invalid weight - too low",
			metrics: &DailyMetrics{
				UserID:   1,
				Date:     time.Now(),
				Calories: 2000,
				Weight:   ptrFloat64(0),
			},
			wantErr: true,
			errMsg:  "weight must be between 0 and 500 kg",
		},
		{
			name: "invalid weight - too high",
			metrics: &DailyMetrics{
				UserID:   1,
				Date:     time.Now(),
				Calories: 2000,
				Weight:   ptrFloat64(600),
			},
			wantErr: true,
			errMsg:  "weight must be between 0 and 500 kg",
		},
		{
			name: "negative steps",
			metrics: &DailyMetrics{
				UserID:   1,
				Date:     time.Now(),
				Calories: 2000,
				Steps:    -1000,
			},
			wantErr: true,
			errMsg:  "steps must be non-negative",
		},
		{
			name: "negative workout duration",
			metrics: &DailyMetrics{
				UserID:          1,
				Date:            time.Now(),
				Calories:        2000,
				WorkoutDuration: ptrInt(-30),
			},
			wantErr: true,
			errMsg:  "workout_duration must be non-negative",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.metrics.Validate()
			if tt.wantErr {
				assert.Error(t, err)
				assert.Equal(t, tt.errMsg, err.Error())
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestWeeklyPlanValidate tests the WeeklyPlan.Validate method
func TestWeeklyPlanValidate(t *testing.T) {
	tests := []struct {
		name    string
		plan    *WeeklyPlan
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid plan",
			plan: &WeeklyPlan{
				UserID:       1,
				CuratorID:      2,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
				CreatedBy:    2,
			},
			wantErr: false,
		},
		{
			name: "invalid user_id",
			plan: &WeeklyPlan{
				UserID:       0,
				CuratorID:      2,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
				CreatedBy:    2,
			},
			wantErr: true,
			errMsg:  "user_id is required and must be positive",
		},
		{
			name: "invalid curator_id",
			plan: &WeeklyPlan{
				UserID:       1,
				CuratorID:      0,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
				CreatedBy:    2,
			},
			wantErr: true,
			errMsg:  "curator_id is required and must be positive",
		},
		{
			name: "invalid calories_goal",
			plan: &WeeklyPlan{
				UserID:       1,
				CuratorID:      2,
				CaloriesGoal: 0,
				ProteinGoal:  150,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
				CreatedBy:    2,
			},
			wantErr: true,
			errMsg:  "calories_goal is required and must be positive",
		},
		{
			name: "invalid protein_goal",
			plan: &WeeklyPlan{
				UserID:       1,
				CuratorID:      2,
				CaloriesGoal: 2000,
				ProteinGoal:  0,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
				CreatedBy:    2,
			},
			wantErr: true,
			errMsg:  "protein_goal is required and must be positive",
		},
		{
			name: "negative fat_goal",
			plan: &WeeklyPlan{
				UserID:       1,
				CuratorID:      2,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				FatGoal:      ptrInt(-10),
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
				CreatedBy:    2,
			},
			wantErr: true,
			errMsg:  "fat_goal must be non-negative",
		},
		{
			name: "negative carbs_goal",
			plan: &WeeklyPlan{
				UserID:       1,
				CuratorID:      2,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				CarbsGoal:    ptrInt(-50),
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
				CreatedBy:    2,
			},
			wantErr: true,
			errMsg:  "carbs_goal must be non-negative",
		},
		{
			name: "negative steps_goal",
			plan: &WeeklyPlan{
				UserID:       1,
				CuratorID:      2,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				StepsGoal:    ptrInt(-1000),
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
				CreatedBy:    2,
			},
			wantErr: true,
			errMsg:  "steps_goal must be non-negative",
		},
		{
			name: "missing start_date",
			plan: &WeeklyPlan{
				UserID:       1,
				CuratorID:      2,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				EndDate:      time.Now().AddDate(0, 0, 7),
				CreatedBy:    2,
			},
			wantErr: true,
			errMsg:  "start_date is required",
		},
		{
			name: "missing end_date",
			plan: &WeeklyPlan{
				UserID:       1,
				CuratorID:      2,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				StartDate:    time.Now(),
				CreatedBy:    2,
			},
			wantErr: true,
			errMsg:  "end_date is required",
		},
		{
			name: "end_date before start_date",
			plan: &WeeklyPlan{
				UserID:       1,
				CuratorID:      2,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, -7),
				CreatedBy:    2,
			},
			wantErr: true,
			errMsg:  "end_date must be on or after start_date",
		},
		{
			name: "invalid created_by",
			plan: &WeeklyPlan{
				UserID:       1,
				CuratorID:      2,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
				CreatedBy:    0,
			},
			wantErr: true,
			errMsg:  "created_by is required and must be positive",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.plan.Validate()
			if tt.wantErr {
				assert.Error(t, err)
				assert.Equal(t, tt.errMsg, err.Error())
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestTaskStatusIsValid tests the TaskStatus.IsValid method
func TestTaskStatusIsValid(t *testing.T) {
	tests := []struct {
		name   string
		status TaskStatus
		want   bool
	}{
		{"active is valid", TaskStatusActive, true},
		{"completed is valid", TaskStatusCompleted, true},
		{"overdue is valid", TaskStatusOverdue, true},
		{"invalid status", TaskStatus("invalid"), false},
		{"empty status", TaskStatus(""), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.status.IsValid())
		})
	}
}

// TestTaskValidate tests the Task.Validate method
func TestTaskValidate(t *testing.T) {
	tests := []struct {
		name    string
		task    *Task
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid task",
			task: &Task{
				UserID:     1,
				CuratorID:    2,
				Title:      "Test Task",
				WeekNumber: 1,
				DueDate:    time.Now().AddDate(0, 0, 7),
				Status:     TaskStatusActive,
			},
			wantErr: false,
		},
		{
			name: "invalid user_id",
			task: &Task{
				UserID:     0,
				CuratorID:    2,
				Title:      "Test Task",
				WeekNumber: 1,
				DueDate:    time.Now().AddDate(0, 0, 7),
				Status:     TaskStatusActive,
			},
			wantErr: true,
			errMsg:  "user_id is required and must be positive",
		},
		{
			name: "invalid curator_id",
			task: &Task{
				UserID:     1,
				CuratorID:    0,
				Title:      "Test Task",
				WeekNumber: 1,
				DueDate:    time.Now().AddDate(0, 0, 7),
				Status:     TaskStatusActive,
			},
			wantErr: true,
			errMsg:  "curator_id is required and must be positive",
		},
		{
			name: "empty title",
			task: &Task{
				UserID:     1,
				CuratorID:    2,
				Title:      "",
				WeekNumber: 1,
				DueDate:    time.Now().AddDate(0, 0, 7),
				Status:     TaskStatusActive,
			},
			wantErr: true,
			errMsg:  "title is required",
		},
		{
			name: "title too long",
			task: &Task{
				UserID:     1,
				CuratorID:    2,
				Title:      string(make([]byte, 256)),
				WeekNumber: 1,
				DueDate:    time.Now().AddDate(0, 0, 7),
				Status:     TaskStatusActive,
			},
			wantErr: true,
			errMsg:  "title must be 255 characters or less",
		},
		{
			name: "description too long",
			task: &Task{
				UserID:      1,
				CuratorID:     2,
				Title:       "Test Task",
				Description: ptrString(string(make([]byte, 1001))),
				WeekNumber:  1,
				DueDate:     time.Now().AddDate(0, 0, 7),
				Status:      TaskStatusActive,
			},
			wantErr: true,
			errMsg:  "description must be 1000 characters or less",
		},
		{
			name: "invalid week_number",
			task: &Task{
				UserID:     1,
				CuratorID:    2,
				Title:      "Test Task",
				WeekNumber: 0,
				DueDate:    time.Now().AddDate(0, 0, 7),
				Status:     TaskStatusActive,
			},
			wantErr: true,
			errMsg:  "week_number is required and must be positive",
		},
		{
			name: "missing due_date",
			task: &Task{
				UserID:     1,
				CuratorID:    2,
				Title:      "Test Task",
				WeekNumber: 1,
				Status:     TaskStatusActive,
			},
			wantErr: true,
			errMsg:  "due_date is required",
		},
		{
			name: "invalid status",
			task: &Task{
				UserID:     1,
				CuratorID:    2,
				Title:      "Test Task",
				WeekNumber: 1,
				DueDate:    time.Now().AddDate(0, 0, 7),
				Status:     TaskStatus("invalid"),
			},
			wantErr: true,
			errMsg:  "invalid status: invalid",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.task.Validate()
			if tt.wantErr {
				assert.Error(t, err)
				assert.Equal(t, tt.errMsg, err.Error())
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// Helper functions
func ptrFloat64(v float64) *float64 {
	return &v
}

func ptrInt(v int) *int {
	return &v
}

func ptrString(v string) *string {
	return &v
}

// TestWeeklyReportValidate tests the WeeklyReport.Validate method
func TestWeeklyReportValidate(t *testing.T) {
	tests := []struct {
		name    string
		report  *WeeklyReport
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid report",
			report: &WeeklyReport{
				UserID:     1,
				CuratorID:    2,
				WeekStart:  time.Now(),
				WeekEnd:    time.Now().AddDate(0, 0, 7),
				WeekNumber: 1,
				Summary:    "Test summary",
			},
			wantErr: false,
		},
		{
			name: "invalid user_id",
			report: &WeeklyReport{
				UserID:     0,
				CuratorID:    2,
				WeekStart:  time.Now(),
				WeekEnd:    time.Now().AddDate(0, 0, 7),
				WeekNumber: 1,
				Summary:    "Test summary",
			},
			wantErr: true,
			errMsg:  "user_id is required and must be positive",
		},
		{
			name: "invalid curator_id",
			report: &WeeklyReport{
				UserID:     1,
				CuratorID:    0,
				WeekStart:  time.Now(),
				WeekEnd:    time.Now().AddDate(0, 0, 7),
				WeekNumber: 1,
				Summary:    "Test summary",
			},
			wantErr: true,
			errMsg:  "curator_id is required and must be positive",
		},
		{
			name: "missing week_start",
			report: &WeeklyReport{
				UserID:     1,
				CuratorID:    2,
				WeekEnd:    time.Now().AddDate(0, 0, 7),
				WeekNumber: 1,
				Summary:    "Test summary",
			},
			wantErr: true,
			errMsg:  "week_start is required",
		},
		{
			name: "missing week_end",
			report: &WeeklyReport{
				UserID:     1,
				CuratorID:    2,
				WeekStart:  time.Now(),
				WeekNumber: 1,
				Summary:    "Test summary",
			},
			wantErr: true,
			errMsg:  "week_end is required",
		},
		{
			name: "week_end before week_start",
			report: &WeeklyReport{
				UserID:     1,
				CuratorID:    2,
				WeekStart:  time.Now(),
				WeekEnd:    time.Now().AddDate(0, 0, -7),
				WeekNumber: 1,
				Summary:    "Test summary",
			},
			wantErr: true,
			errMsg:  "week_end must be on or after week_start",
		},
		{
			name: "invalid week_number",
			report: &WeeklyReport{
				UserID:     1,
				CuratorID:    2,
				WeekStart:  time.Now(),
				WeekEnd:    time.Now().AddDate(0, 0, 7),
				WeekNumber: 0,
				Summary:    "Test summary",
			},
			wantErr: true,
			errMsg:  "week_number is required and must be positive",
		},
		{
			name: "empty summary",
			report: &WeeklyReport{
				UserID:     1,
				CuratorID:    2,
				WeekStart:  time.Now(),
				WeekEnd:    time.Now().AddDate(0, 0, 7),
				WeekNumber: 1,
				Summary:    "",
			},
			wantErr: true,
			errMsg:  "summary is required",
		},
		{
			name: "photo_url too long",
			report: &WeeklyReport{
				UserID:     1,
				CuratorID:    2,
				WeekStart:  time.Now(),
				WeekEnd:    time.Now().AddDate(0, 0, 7),
				WeekNumber: 1,
				Summary:    "Test summary",
				PhotoURL:   ptrString(string(make([]byte, 501))),
			},
			wantErr: true,
			errMsg:  "photo_url must be 500 characters or less",
		},
		{
			name: "curator_feedback too long",
			report: &WeeklyReport{
				UserID:        1,
				CuratorID:       2,
				WeekStart:     time.Now(),
				WeekEnd:       time.Now().AddDate(0, 0, 7),
				WeekNumber:    1,
				Summary:       "Test summary",
				CuratorFeedback: ptrString(string(make([]byte, 2001))),
			},
			wantErr: true,
			errMsg:  "curator_feedback must be 2000 characters or less",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.report.Validate()
			if tt.wantErr {
				assert.Error(t, err)
				assert.Equal(t, tt.errMsg, err.Error())
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestPhotoDataValidate tests the PhotoData.Validate method
func TestPhotoDataValidate(t *testing.T) {
	tests := []struct {
		name    string
		photo   *PhotoData
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid photo data",
			photo: &PhotoData{
				UserID:         1,
				WeekStart:      time.Now(),
				WeekEnd:        time.Now().AddDate(0, 0, 7),
				WeekIdentifier: "2024-W01",
				PhotoURL:       "https://example.com/photo.jpg",
				FileSize:       1024 * 1024, // 1MB
				MimeType:       "image/jpeg",
			},
			wantErr: false,
		},
		{
			name: "invalid user_id",
			photo: &PhotoData{
				UserID:         0,
				WeekStart:      time.Now(),
				WeekEnd:        time.Now().AddDate(0, 0, 7),
				WeekIdentifier: "2024-W01",
				PhotoURL:       "https://example.com/photo.jpg",
				FileSize:       1024 * 1024,
				MimeType:       "image/jpeg",
			},
			wantErr: true,
			errMsg:  "user_id is required and must be positive",
		},
		{
			name: "missing week_start",
			photo: &PhotoData{
				UserID:         1,
				WeekEnd:        time.Now().AddDate(0, 0, 7),
				WeekIdentifier: "2024-W01",
				PhotoURL:       "https://example.com/photo.jpg",
				FileSize:       1024 * 1024,
				MimeType:       "image/jpeg",
			},
			wantErr: true,
			errMsg:  "week_start is required",
		},
		{
			name: "missing week_end",
			photo: &PhotoData{
				UserID:         1,
				WeekStart:      time.Now(),
				WeekIdentifier: "2024-W01",
				PhotoURL:       "https://example.com/photo.jpg",
				FileSize:       1024 * 1024,
				MimeType:       "image/jpeg",
			},
			wantErr: true,
			errMsg:  "week_end is required",
		},
		{
			name: "week_end before week_start",
			photo: &PhotoData{
				UserID:         1,
				WeekStart:      time.Now(),
				WeekEnd:        time.Now().AddDate(0, 0, -7),
				WeekIdentifier: "2024-W01",
				PhotoURL:       "https://example.com/photo.jpg",
				FileSize:       1024 * 1024,
				MimeType:       "image/jpeg",
			},
			wantErr: true,
			errMsg:  "week_end must be on or after week_start",
		},
		{
			name: "empty week_identifier",
			photo: &PhotoData{
				UserID:         1,
				WeekStart:      time.Now(),
				WeekEnd:        time.Now().AddDate(0, 0, 7),
				WeekIdentifier: "",
				PhotoURL:       "https://example.com/photo.jpg",
				FileSize:       1024 * 1024,
				MimeType:       "image/jpeg",
			},
			wantErr: true,
			errMsg:  "week_identifier is required",
		},
		{
			name: "empty photo_url",
			photo: &PhotoData{
				UserID:         1,
				WeekStart:      time.Now(),
				WeekEnd:        time.Now().AddDate(0, 0, 7),
				WeekIdentifier: "2024-W01",
				PhotoURL:       "",
				FileSize:       1024 * 1024,
				MimeType:       "image/jpeg",
			},
			wantErr: true,
			errMsg:  "photo_url is required",
		},
		{
			name: "photo_url too long",
			photo: &PhotoData{
				UserID:         1,
				WeekStart:      time.Now(),
				WeekEnd:        time.Now().AddDate(0, 0, 7),
				WeekIdentifier: "2024-W01",
				PhotoURL:       string(make([]byte, 501)),
				FileSize:       1024 * 1024,
				MimeType:       "image/jpeg",
			},
			wantErr: true,
			errMsg:  "photo_url must be 500 characters or less",
		},
		{
			name: "invalid file_size - zero",
			photo: &PhotoData{
				UserID:         1,
				WeekStart:      time.Now(),
				WeekEnd:        time.Now().AddDate(0, 0, 7),
				WeekIdentifier: "2024-W01",
				PhotoURL:       "https://example.com/photo.jpg",
				FileSize:       0,
				MimeType:       "image/jpeg",
			},
			wantErr: true,
			errMsg:  "file_size is required and must be positive",
		},
		{
			name: "file_size too large",
			photo: &PhotoData{
				UserID:         1,
				WeekStart:      time.Now(),
				WeekEnd:        time.Now().AddDate(0, 0, 7),
				WeekIdentifier: "2024-W01",
				PhotoURL:       "https://example.com/photo.jpg",
				FileSize:       11 * 1024 * 1024, // 11MB
				MimeType:       "image/jpeg",
			},
			wantErr: true,
			errMsg:  "file_size must be 10MB or less",
		},
		{
			name: "empty mime_type",
			photo: &PhotoData{
				UserID:         1,
				WeekStart:      time.Now(),
				WeekEnd:        time.Now().AddDate(0, 0, 7),
				WeekIdentifier: "2024-W01",
				PhotoURL:       "https://example.com/photo.jpg",
				FileSize:       1024 * 1024,
				MimeType:       "",
			},
			wantErr: true,
			errMsg:  "mime_type is required",
		},
		{
			name: "invalid mime_type",
			photo: &PhotoData{
				UserID:         1,
				WeekStart:      time.Now(),
				WeekEnd:        time.Now().AddDate(0, 0, 7),
				WeekIdentifier: "2024-W01",
				PhotoURL:       "https://example.com/photo.jpg",
				FileSize:       1024 * 1024,
				MimeType:       "application/pdf",
			},
			wantErr: true,
			errMsg:  "mime_type must be image/jpeg, image/png, or image/webp",
		},
		{
			name: "valid mime_type - png",
			photo: &PhotoData{
				UserID:         1,
				WeekStart:      time.Now(),
				WeekEnd:        time.Now().AddDate(0, 0, 7),
				WeekIdentifier: "2024-W01",
				PhotoURL:       "https://example.com/photo.png",
				FileSize:       1024 * 1024,
				MimeType:       "image/png",
			},
			wantErr: false,
		},
		{
			name: "valid mime_type - webp",
			photo: &PhotoData{
				UserID:         1,
				WeekStart:      time.Now(),
				WeekEnd:        time.Now().AddDate(0, 0, 7),
				WeekIdentifier: "2024-W01",
				PhotoURL:       "https://example.com/photo.webp",
				FileSize:       1024 * 1024,
				MimeType:       "image/webp",
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.photo.Validate()
			if tt.wantErr {
				assert.Error(t, err)
				assert.Equal(t, tt.errMsg, err.Error())
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestMetricUpdateTypeIsValid tests the MetricUpdateType.IsValid method
func TestMetricUpdateTypeIsValid(t *testing.T) {
	tests := []struct {
		name       string
		updateType MetricUpdateType
		want       bool
	}{
		{"nutrition is valid", MetricUpdateTypeNutrition, true},
		{"weight is valid", MetricUpdateTypeWeight, true},
		{"steps is valid", MetricUpdateTypeSteps, true},
		{"workout is valid", MetricUpdateTypeWorkout, true},
		{"invalid type", MetricUpdateType("invalid"), false},
		{"empty type", MetricUpdateType(""), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.updateType.IsValid())
		})
	}
}
