package curator

import "encoding/json"

// ClientCard represents a summary view of a client for the curator dashboard
type ClientCard struct {
	ID                int64       `json:"id"`
	Name              string      `json:"name"`
	AvatarURL         string      `json:"avatar_url,omitempty"`
	TodayKBZHU        *DailyKBZHU `json:"today_kbzhu"`
	Plan              *PlanKBZHU  `json:"plan"`
	Alerts            []Alert     `json:"alerts"`
	UnreadCount       int         `json:"unread_count"`
	LastWeight        *float64    `json:"last_weight"`
	WeightTrend       string      `json:"weight_trend"`
	TargetWeight      *float64    `json:"target_weight"`
	TodayWater        *WaterView  `json:"today_water"`
	Email             string      `json:"email,omitempty"`
	Height            *float64    `json:"height,omitempty"`
	Timezone          string      `json:"timezone,omitempty"`
	TelegramUsername  string      `json:"telegram_username,omitempty"`
	InstagramUsername string      `json:"instagram_username,omitempty"`
	BirthDate         *string     `json:"birth_date,omitempty"`
	BiologicalSex     *string     `json:"biological_sex,omitempty"`
	ActivityLevel     *string     `json:"activity_level,omitempty"`
	FitnessGoal       *string     `json:"fitness_goal,omitempty"`
}

// DailyKBZHU represents daily nutrition totals (calories, protein, fat, carbs)
type DailyKBZHU struct {
	Calories float64 `json:"calories"`
	Protein  float64 `json:"protein"`
	Fat      float64 `json:"fat"`
	Carbs    float64 `json:"carbs"`
}

// PlanKBZHU represents the weekly plan nutrition targets
type PlanKBZHU struct {
	Calories float64 `json:"calories"`
	Protein  float64 `json:"protein"`
	Fat      float64 `json:"fat"`
	Carbs    float64 `json:"carbs"`
}

// Alert represents a nutrition deviation alert
type Alert struct {
	Level   string `json:"level"` // "red", "yellow", "green"
	Message string `json:"message"`
}

// WeightHistoryPoint represents a single weight data point for history
type WeightHistoryPoint struct {
	Date   string  `json:"date"`
	Weight float64 `json:"weight"`
}

// ClientDetail represents a detailed view of a single client for the curator
type ClientDetail struct {
	ClientCard
	Days          []DayDetail          `json:"days"`
	WeeklyPlan    *PlanKBZHU           `json:"weekly_plan"`
	WeightHistory []WeightHistoryPoint `json:"weight_history"`
	Photos        []PhotoView          `json:"photos"`
	WaterGoal     *int                 `json:"water_goal"`
}

// DayDetail represents a single day's data for the curator client view
type DayDetail struct {
	Date        string          `json:"date"`
	KBZHU       *DailyKBZHU     `json:"kbzhu"`
	Plan        *PlanKBZHU      `json:"plan"`
	Alerts      []Alert         `json:"alerts"`
	FoodEntries []FoodEntryView `json:"food_entries"`
	Water       *WaterView      `json:"water"`
	Steps       int             `json:"steps"`
	Workout     *WorkoutView    `json:"workout"`
}

// WaterView represents water intake data for a day
type WaterView struct {
	Glasses   int `json:"glasses"`
	Goal      int `json:"goal"`
	GlassSize int `json:"glass_size"`
}

// WorkoutView represents workout data for a day
type WorkoutView struct {
	Completed bool   `json:"completed"`
	Type      string `json:"type"`
	Duration  int    `json:"duration"`
}

// PhotoView represents a weekly photo for the curator
type PhotoView struct {
	ID         string `json:"id"`
	PhotoURL   string `json:"photo_url"`
	WeekStart  string `json:"week_start"`
	WeekEnd    string `json:"week_end"`
	UploadedAt string `json:"uploaded_at"`
}

// FoodEntryView represents a single food entry as seen by the curator
type FoodEntryView struct {
	ID        string  `json:"id"`
	FoodName  string  `json:"food_name"`
	MealType  string  `json:"meal_type"`
	Calories  float64 `json:"calories"`
	Protein   float64 `json:"protein"`
	Fat       float64 `json:"fat"`
	Carbs     float64 `json:"carbs"`
	Weight    float64 `json:"weight"`
	CreatedBy *int64  `json:"created_by,omitempty"`
	Time      string  `json:"time"`
}

// CreateTaskRequest represents the request to create a task for a client
type CreateTaskRequest struct {
	Title          string `json:"title" binding:"required,max=200"`
	Type           string `json:"type" binding:"required,oneof=nutrition workout habit measurement"`
	Description    string `json:"description"`
	Deadline       string `json:"deadline" binding:"required"`
	Recurrence     string `json:"recurrence" binding:"required,oneof=once daily weekly"`
	RecurrenceDays []int  `json:"recurrence_days,omitempty"`
}

// UpdateTaskRequest represents the request to update a task
type UpdateTaskRequest struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Deadline    *string `json:"deadline"`
	Status      *string `json:"status"`
}

// TaskView represents a task as returned to the curator
type TaskView struct {
	ID             string   `json:"id"`
	Title          string   `json:"title"`
	Type           string   `json:"type"`
	Description    string   `json:"description,omitempty"`
	Deadline       string   `json:"deadline"`
	Recurrence     string   `json:"recurrence"`
	RecurrenceDays []int    `json:"recurrence_days,omitempty"`
	Status         string   `json:"status"`
	Completions    []string `json:"completions,omitempty"`
	CreatedAt      string   `json:"created_at"`
}

// CategoryRating represents a rating for a specific category in weekly report feedback
type CategoryRating struct {
	Rating  string `json:"rating" binding:"required,oneof=excellent good needs_improvement"`
	Comment string `json:"comment"`
}

// SubmitFeedbackRequest represents the request to submit feedback on a weekly report
type SubmitFeedbackRequest struct {
	Nutrition       *CategoryRating `json:"nutrition"`
	Activity        *CategoryRating `json:"activity"`
	Water           *CategoryRating `json:"water"`
	PhotoUploaded   *bool           `json:"photo_uploaded"`
	Summary         string          `json:"summary" binding:"required"`
	Recommendations string          `json:"recommendations"`
}

// WeeklyReportView represents a weekly report as seen by the curator
type WeeklyReportView struct {
	ID              string           `json:"id"`
	WeekStart       string           `json:"week_start"`
	WeekEnd         string           `json:"week_end"`
	WeekNumber      int              `json:"week_number"`
	Summary         json.RawMessage  `json:"summary"`
	SubmittedAt     string           `json:"submitted_at"`
	CuratorFeedback *json.RawMessage `json:"curator_feedback,omitempty"`
	HasFeedback     bool             `json:"has_feedback"`
}

// CreateWeeklyPlanRequest represents the request to create a weekly plan for a client
type CreateWeeklyPlanRequest struct {
	Calories  float64 `json:"calories" binding:"required,gt=0"`
	Protein   float64 `json:"protein" binding:"required,gte=0"`
	Fat       float64 `json:"fat" binding:"required,gte=0"`
	Carbs     float64 `json:"carbs" binding:"required,gte=0"`
	StartDate string  `json:"start_date" binding:"required"`
	EndDate   string  `json:"end_date" binding:"required"`
	Comment   string  `json:"comment"`
}

// UpdateWeeklyPlanRequest represents the request to update a weekly plan
type UpdateWeeklyPlanRequest struct {
	Calories *float64 `json:"calories"`
	Protein  *float64 `json:"protein"`
	Fat      *float64 `json:"fat"`
	Carbs    *float64 `json:"carbs"`
	Comment  *string  `json:"comment"`
}

// WeeklyPlanView represents a weekly plan as returned to the client
type WeeklyPlanView struct {
	ID        string  `json:"id"`
	Calories  float64 `json:"calories"`
	Protein   float64 `json:"protein"`
	Fat       float64 `json:"fat"`
	Carbs     float64 `json:"carbs"`
	StartDate string  `json:"start_date"`
	EndDate   string  `json:"end_date"`
	Comment   string  `json:"comment,omitempty"`
	IsActive  bool    `json:"is_active"`
	CreatedAt string  `json:"created_at"`
}
