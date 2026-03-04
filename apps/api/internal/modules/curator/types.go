package curator

// ClientCard represents a summary view of a client for the curator dashboard
type ClientCard struct {
	ID           int64       `json:"id"`
	Name         string      `json:"name"`
	AvatarURL    string      `json:"avatar_url,omitempty"`
	TodayKBZHU   *DailyKBZHU `json:"today_kbzhu"`
	Plan         *PlanKBZHU  `json:"plan"`
	Alerts       []Alert     `json:"alerts"`
	UnreadCount  int         `json:"unread_count"`
	LastWeight   *float64    `json:"last_weight"`
	WeightTrend  string      `json:"weight_trend"`
	TargetWeight      *float64    `json:"target_weight"`
	TodayWater        *WaterView  `json:"today_water"`
	Email             string      `json:"email,omitempty"`
	Height            *float64    `json:"height,omitempty"`
	Timezone          string      `json:"timezone,omitempty"`
	TelegramUsername  string      `json:"telegram_username,omitempty"`
	InstagramUsername string      `json:"instagram_username,omitempty"`
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
