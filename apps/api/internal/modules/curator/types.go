package curator

// ClientCard represents a summary view of a client for the curator dashboard
type ClientCard struct {
	ID          int64       `json:"id"`
	Name        string      `json:"name"`
	AvatarURL   string      `json:"avatar_url,omitempty"`
	TodayKBZHU  *DailyKBZHU `json:"today_kbzhu"`
	Plan        *PlanKBZHU  `json:"plan"`
	Alerts      []Alert     `json:"alerts"`
	UnreadCount int         `json:"unread_count"`
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

// ClientDetail represents a detailed view of a single client for the curator
type ClientDetail struct {
	ClientCard
	FoodEntries []FoodEntryView `json:"food_entries"`
	WeeklyPlan  *PlanKBZHU      `json:"weekly_plan"`
	LastWeight  *float64        `json:"last_weight"`
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
