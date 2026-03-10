package dashboard

import (
	"fmt"
	"time"
)

// DailyMetrics represents daily tracking metrics for a user
type DailyMetrics struct {
	ID               string    `json:"id" db:"id"`
	UserID           int64     `json:"user_id" db:"user_id"`
	Date             time.Time `json:"date" db:"date"`
	Calories         int       `json:"calories" db:"calories"`
	Protein          int       `json:"protein" db:"protein"`
	Fat              int       `json:"fat" db:"fat"`
	Carbs            int       `json:"carbs" db:"carbs"`
	Weight           *float64  `json:"weight,omitempty" db:"weight"`
	Steps            int       `json:"steps" db:"steps"`
	WorkoutCompleted bool      `json:"workout_completed" db:"workout_completed"`
	WorkoutType      *string   `json:"workout_type,omitempty" db:"workout_type"`
	WorkoutDuration  *int      `json:"workout_duration,omitempty" db:"workout_duration"`
	CreatedAt        time.Time `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time `json:"updated_at" db:"updated_at"`
}

// Validate validates the daily metrics fields
func (d *DailyMetrics) Validate() error {
	if d.UserID <= 0 {
		return fmt.Errorf("user_id is required and must be positive")
	}
	if d.Date.IsZero() {
		return fmt.Errorf("date is required")
	}
	if d.Calories < 0 {
		return fmt.Errorf("calories must be non-negative")
	}
	if d.Protein < 0 {
		return fmt.Errorf("protein must be non-negative")
	}
	if d.Fat < 0 {
		return fmt.Errorf("fat must be non-negative")
	}
	if d.Carbs < 0 {
		return fmt.Errorf("carbs must be non-negative")
	}
	if d.Weight != nil && (*d.Weight <= 0 || *d.Weight > 500) {
		return fmt.Errorf("weight must be between 0 and 500 kg")
	}
	if d.Steps < 0 {
		return fmt.Errorf("steps must be non-negative")
	}
	if d.WorkoutDuration != nil && *d.WorkoutDuration < 0 {
		return fmt.Errorf("workout_duration must be non-negative")
	}
	return nil
}

// WeeklyPlan represents a weekly nutrition plan assigned by a curator
type WeeklyPlan struct {
	ID           string    `json:"id" db:"id"`
	UserID       int64     `json:"user_id" db:"user_id"`
	CuratorID    int64     `json:"curator_id" db:"curator_id"`
	CaloriesGoal int       `json:"calories_goal" db:"calories_goal"`
	ProteinGoal  int       `json:"protein_goal" db:"protein_goal"`
	FatGoal      *int      `json:"fat_goal,omitempty" db:"fat_goal"`
	CarbsGoal    *int      `json:"carbs_goal,omitempty" db:"carbs_goal"`
	StepsGoal    *int      `json:"steps_goal,omitempty" db:"steps_goal"`
	StartDate    time.Time `json:"start_date" db:"start_date"`
	EndDate      time.Time `json:"end_date" db:"end_date"`
	IsActive     bool      `json:"is_active" db:"is_active"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
	CreatedBy    int64     `json:"created_by" db:"created_by"`
}

// Validate validates the weekly plan fields
func (w *WeeklyPlan) Validate() error {
	if w.UserID <= 0 {
		return fmt.Errorf("user_id is required and must be positive")
	}
	if w.CuratorID <= 0 {
		return fmt.Errorf("curator_id is required and must be positive")
	}
	if w.CaloriesGoal <= 0 {
		return fmt.Errorf("calories_goal is required and must be positive")
	}
	if w.ProteinGoal <= 0 {
		return fmt.Errorf("protein_goal is required and must be positive")
	}
	if w.FatGoal != nil && *w.FatGoal < 0 {
		return fmt.Errorf("fat_goal must be non-negative")
	}
	if w.CarbsGoal != nil && *w.CarbsGoal < 0 {
		return fmt.Errorf("carbs_goal must be non-negative")
	}
	if w.StepsGoal != nil && *w.StepsGoal < 0 {
		return fmt.Errorf("steps_goal must be non-negative")
	}
	if w.StartDate.IsZero() {
		return fmt.Errorf("start_date is required")
	}
	if w.EndDate.IsZero() {
		return fmt.Errorf("end_date is required")
	}
	if w.EndDate.Before(w.StartDate) {
		return fmt.Errorf("end_date must be on or after start_date")
	}
	if w.CreatedBy <= 0 {
		return fmt.Errorf("created_by is required and must be positive")
	}
	return nil
}

// TaskStatus represents the status of a task
type TaskStatus string

const (
	TaskStatusActive    TaskStatus = "active"
	TaskStatusCompleted TaskStatus = "completed"
	TaskStatusOverdue   TaskStatus = "overdue"
)

// IsValid checks if the task status is valid
func (t TaskStatus) IsValid() bool {
	switch t {
	case TaskStatusActive, TaskStatusCompleted, TaskStatusOverdue:
		return true
	}
	return false
}

// Task represents a task assigned by a curator to a client
type Task struct {
	ID             string           `json:"id" db:"id"`
	UserID         int64            `json:"user_id" db:"user_id"`
	CuratorID      int64            `json:"curator_id" db:"curator_id"`
	Title          string           `json:"title" db:"title"`
	Description    *string          `json:"description,omitempty" db:"description"`
	Type           string           `json:"type" db:"type"`
	WeekNumber     int              `json:"week_number" db:"week_number"`
	AssignedAt     time.Time        `json:"assigned_at" db:"assigned_at"`
	DueDate        time.Time        `json:"due_date" db:"due_date"`
	CompletedAt    *time.Time       `json:"completed_at,omitempty" db:"completed_at"`
	Status         TaskStatus       `json:"status" db:"status"`
	Recurrence     string           `json:"recurrence" db:"recurrence"`
	RecurrenceDays []int            `json:"recurrence_days,omitempty" db:"recurrence_days"`
	Completions    []TaskCompletion `json:"completions,omitempty"`
	CreatedAt      time.Time        `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time        `json:"updated_at" db:"updated_at"`
}

// TaskCompletion represents a single completion record for a recurring task
type TaskCompletion struct {
	ID            string    `json:"id" db:"id"`
	TaskID        string    `json:"task_id" db:"task_id"`
	CompletedDate string    `json:"completed_date" db:"completed_date"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
}

// ReportFeedback represents curator feedback on a weekly report
type ReportFeedback struct {
	ReportID string  `json:"report_id"`
	Feedback *string `json:"feedback"`
}

// Validate validates the task fields
func (t *Task) Validate() error {
	if t.UserID <= 0 {
		return fmt.Errorf("user_id is required and must be positive")
	}
	if t.CuratorID <= 0 {
		return fmt.Errorf("curator_id is required and must be positive")
	}
	if t.Title == "" {
		return fmt.Errorf("title is required")
	}
	if len(t.Title) > 255 {
		return fmt.Errorf("title must be 255 characters or less")
	}
	if t.Description != nil && len(*t.Description) > 1000 {
		return fmt.Errorf("description must be 1000 characters or less")
	}
	if t.WeekNumber <= 0 {
		return fmt.Errorf("week_number is required and must be positive")
	}
	if t.DueDate.IsZero() {
		return fmt.Errorf("due_date is required")
	}
	if !t.Status.IsValid() {
		return fmt.Errorf("invalid status: %s", t.Status)
	}
	return nil
}

// WeeklyReport represents a weekly report submitted by a client to a curator
type WeeklyReport struct {
	ID              string     `json:"id" db:"id"`
	UserID          int64      `json:"user_id" db:"user_id"`
	CuratorID       int64      `json:"curator_id" db:"curator_id"`
	WeekStart       time.Time  `json:"week_start" db:"week_start"`
	WeekEnd         time.Time  `json:"week_end" db:"week_end"`
	WeekNumber      int        `json:"week_number" db:"week_number"`
	Summary         string     `json:"summary" db:"summary"` // JSONB stored as string
	PhotoURL        *string    `json:"photo_url,omitempty" db:"photo_url"`
	SubmittedAt     time.Time  `json:"submitted_at" db:"submitted_at"`
	ReviewedAt      *time.Time `json:"reviewed_at,omitempty" db:"reviewed_at"`
	CuratorFeedback *string    `json:"curator_feedback,omitempty" db:"curator_feedback"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
}

// Validate validates the weekly report fields
func (w *WeeklyReport) Validate() error {
	if w.UserID <= 0 {
		return fmt.Errorf("user_id is required and must be positive")
	}
	if w.CuratorID <= 0 {
		return fmt.Errorf("curator_id is required and must be positive")
	}
	if w.WeekStart.IsZero() {
		return fmt.Errorf("week_start is required")
	}
	if w.WeekEnd.IsZero() {
		return fmt.Errorf("week_end is required")
	}
	if w.WeekEnd.Before(w.WeekStart) {
		return fmt.Errorf("week_end must be on or after week_start")
	}
	if w.WeekNumber <= 0 {
		return fmt.Errorf("week_number is required and must be positive")
	}
	if w.Summary == "" {
		return fmt.Errorf("summary is required")
	}
	if w.PhotoURL != nil && len(*w.PhotoURL) > 500 {
		return fmt.Errorf("photo_url must be 500 characters or less")
	}
	if w.CuratorFeedback != nil && len(*w.CuratorFeedback) > 2000 {
		return fmt.Errorf("curator_feedback must be 2000 characters or less")
	}
	return nil
}

// PhotoData represents weekly photo upload data
type PhotoData struct {
	ID             string    `json:"id" db:"id"`
	UserID         int64     `json:"user_id" db:"user_id"`
	WeekStart      time.Time `json:"week_start" db:"week_start"`
	WeekEnd        time.Time `json:"week_end" db:"week_end"`
	WeekIdentifier string    `json:"week_identifier" db:"week_identifier"`
	PhotoURL       string    `json:"photo_url" db:"photo_url"`
	FileSize       int       `json:"file_size" db:"file_size"`
	MimeType       string    `json:"mime_type" db:"mime_type"`
	UploadedAt     time.Time `json:"uploaded_at" db:"uploaded_at"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
}

// Validate validates the photo data fields
func (p *PhotoData) Validate() error {
	if p.UserID <= 0 {
		return fmt.Errorf("user_id is required and must be positive")
	}
	if p.WeekStart.IsZero() {
		return fmt.Errorf("week_start is required")
	}
	if p.WeekEnd.IsZero() {
		return fmt.Errorf("week_end is required")
	}
	if p.WeekEnd.Before(p.WeekStart) {
		return fmt.Errorf("week_end must be on or after week_start")
	}
	if p.WeekIdentifier == "" {
		return fmt.Errorf("week_identifier is required")
	}
	if p.PhotoURL == "" {
		return fmt.Errorf("photo_url is required")
	}
	if len(p.PhotoURL) > 500 {
		return fmt.Errorf("photo_url must be 500 characters or less")
	}
	if p.FileSize <= 0 {
		return fmt.Errorf("file_size is required and must be positive")
	}
	if p.FileSize > 10*1024*1024 { // 10MB
		return fmt.Errorf("file_size must be 10MB or less")
	}
	if p.MimeType == "" {
		return fmt.Errorf("mime_type is required")
	}
	// Validate mime type is image
	validMimeTypes := map[string]bool{
		"image/jpeg": true,
		"image/png":  true,
		"image/webp": true,
	}
	if !validMimeTypes[p.MimeType] {
		return fmt.Errorf("mime_type must be image/jpeg, image/png, or image/webp")
	}
	return nil
}

// MetricUpdateType represents the type of metric update
type MetricUpdateType string

const (
	MetricUpdateTypeNutrition MetricUpdateType = "nutrition"
	MetricUpdateTypeWeight    MetricUpdateType = "weight"
	MetricUpdateTypeSteps     MetricUpdateType = "steps"
	MetricUpdateTypeWorkout   MetricUpdateType = "workout"
)

// IsValid checks if the metric update type is valid
func (m MetricUpdateType) IsValid() bool {
	switch m {
	case MetricUpdateTypeNutrition, MetricUpdateTypeWeight, MetricUpdateTypeSteps, MetricUpdateTypeWorkout:
		return true
	}
	return false
}

// MetricUpdate represents a metric update request
type MetricUpdate struct {
	Type MetricUpdateType `json:"type" binding:"required"`
	Data interface{}      `json:"data" binding:"required"`
}

// NutritionData represents nutrition metric data
type NutritionData struct {
	Calories int `json:"calories" binding:"required,min=0"`
	Protein  int `json:"protein" binding:"required,min=0"`
	Fat      int `json:"fat" binding:"required,min=0"`
	Carbs    int `json:"carbs" binding:"required,min=0"`
}

// WeightData represents weight metric data
type WeightData struct {
	Weight float64 `json:"weight" binding:"required,gt=0,lte=500"`
}

// StepsData represents steps metric data
type StepsData struct {
	Steps int `json:"steps" binding:"required,min=0"`
}

// WorkoutData represents workout metric data
type WorkoutData struct {
	Completed bool    `json:"completed" binding:"required"`
	Type      *string `json:"type,omitempty"`
	Duration  *int    `json:"duration,omitempty" binding:"omitempty,min=0"`
}

// CreateWeeklyPlanRequest represents the request to create a weekly plan
type CreateWeeklyPlanRequest struct {
	UserID       int64     `json:"user_id" binding:"required,gt=0"`
	CaloriesGoal int       `json:"calories_goal" binding:"required,gt=0"`
	ProteinGoal  int       `json:"protein_goal" binding:"required,gt=0"`
	FatGoal      *int      `json:"fat_goal,omitempty" binding:"omitempty,min=0"`
	CarbsGoal    *int      `json:"carbs_goal,omitempty" binding:"omitempty,min=0"`
	StepsGoal    *int      `json:"steps_goal,omitempty" binding:"omitempty,min=0"`
	StartDate    time.Time `json:"start_date" binding:"required"`
	EndDate      time.Time `json:"end_date" binding:"required"`
}

// CreateTaskRequest represents the request to create a task
type CreateTaskRequest struct {
	UserID      int64     `json:"user_id" binding:"required,gt=0"`
	Title       string    `json:"title" binding:"required,max=255"`
	Description *string   `json:"description,omitempty" binding:"omitempty,max=1000"`
	WeekNumber  int       `json:"week_number" binding:"required,gt=0"`
	DueDate     time.Time `json:"due_date" binding:"required"`
}

// UpdateTaskStatusRequest represents the request to update task status
type UpdateTaskStatusRequest struct {
	Status TaskStatus `json:"status" binding:"required,oneof=active completed overdue"`
}

// SubmitWeeklyReportRequest represents the request to submit a weekly report
type SubmitWeeklyReportRequest struct {
	WeekStart time.Time `json:"week_start" binding:"required"`
	WeekEnd   time.Time `json:"week_end" binding:"required"`
}

// WeightTrendPoint represents a single weight data point
type WeightTrendPoint struct {
	Date   string  `json:"date"`
	Weight float64 `json:"weight"`
}

// ProgressData represents progress metrics for the dashboard
type ProgressData struct {
	WeightTrend        []WeightTrendPoint `json:"weight_trend"`
	NutritionAdherence float64            `json:"nutrition_adherence"`
	TargetWeight       *float64           `json:"target_weight"`
}
