package foodtracker

import (
	"fmt"
	"time"
)

// MealType represents meal categories
type MealType string

const (
	MealBreakfast MealType = "breakfast"
	MealLunch     MealType = "lunch"
	MealDinner    MealType = "dinner"
	MealSnack     MealType = "snack"
)

// IsValid checks if the meal type is valid
func (m MealType) IsValid() bool {
	switch m {
	case MealBreakfast, MealLunch, MealDinner, MealSnack:
		return true
	}
	return false
}

// Label returns the Russian label for the meal type
func (m MealType) Label() string {
	switch m {
	case MealBreakfast:
		return "Завтрак"
	case MealLunch:
		return "Обед"
	case MealDinner:
		return "Ужин"
	case MealSnack:
		return "Перекус"
	default:
		return ""
	}
}

// PortionType represents portion measurement types
type PortionType string

const (
	PortionGrams       PortionType = "grams"
	PortionMilliliters PortionType = "milliliters"
	PortionPortion     PortionType = "portion"
)

// IsValid checks if the portion type is valid
func (p PortionType) IsValid() bool {
	switch p {
	case PortionGrams, PortionMilliliters, PortionPortion:
		return true
	}
	return false
}

// Label returns the Russian label for the portion type
func (p PortionType) Label() string {
	switch p {
	case PortionGrams:
		return "Граммы"
	case PortionMilliliters:
		return "Миллилитры"
	case PortionPortion:
		return "Порция"
	default:
		return ""
	}
}

// FoodSource represents the source of food data
type FoodSource string

const (
	SourceDatabase      FoodSource = "database"
	SourceUSDA          FoodSource = "usda"
	SourceOpenFoodFacts FoodSource = "openfoodfacts"
	SourceUser          FoodSource = "user"
)

// IsValid checks if the food source is valid
func (s FoodSource) IsValid() bool {
	switch s {
	case SourceDatabase, SourceUSDA, SourceOpenFoodFacts, SourceUser:
		return true
	}
	return false
}

// NutrientCategory represents nutrient category types
type NutrientCategory string

const (
	NutrientCategoryVitamins NutrientCategory = "vitamins"
	NutrientCategoryMinerals NutrientCategory = "minerals"
	NutrientCategoryLipids   NutrientCategory = "lipids"
	NutrientCategoryFiber    NutrientCategory = "fiber"
	NutrientCategoryPlant    NutrientCategory = "plant"
	NutrientCategoryCustom   NutrientCategory = "custom"
)

// IsValid checks if the nutrient category is valid
func (c NutrientCategory) IsValid() bool {
	switch c {
	case NutrientCategoryVitamins, NutrientCategoryMinerals, NutrientCategoryLipids,
		NutrientCategoryFiber, NutrientCategoryPlant, NutrientCategoryCustom:
		return true
	}
	return false
}

// Label returns the Russian label for the nutrient category
func (c NutrientCategory) Label() string {
	switch c {
	case NutrientCategoryVitamins:
		return "Витамины"
	case NutrientCategoryMinerals:
		return "Минералы"
	case NutrientCategoryLipids:
		return "Липиды"
	case NutrientCategoryFiber:
		return "Клетчатка"
	case NutrientCategoryPlant:
		return "Растительность"
	case NutrientCategoryCustom:
		return "Пользовательские"
	default:
		return ""
	}
}

// NutrientUnit represents units for nutrient measurements
type NutrientUnit string

const (
	UnitGrams      NutrientUnit = "г"
	UnitMilligrams NutrientUnit = "мг"
	UnitMicrograms NutrientUnit = "мкг"
	UnitIU         NutrientUnit = "МЕ"
)

// IsValid checks if the nutrient unit is valid
func (u NutrientUnit) IsValid() bool {
	switch u {
	case UnitGrams, UnitMilligrams, UnitMicrograms, UnitIU:
		return true
	}
	return false
}

// ============================================================================
// Core Data Types
// ============================================================================

// KBZHU represents nutritional values (Калории, Белки, Жиры, Углеводы)
type KBZHU struct {
	Calories float64 `json:"calories" db:"calories"`
	Protein  float64 `json:"protein" db:"protein"`
	Fat      float64 `json:"fat" db:"fat"`
	Carbs    float64 `json:"carbs" db:"carbs"`
}

// Validate validates the KBZHU values
func (k *KBZHU) Validate() error {
	if k.Calories < 0 {
		return fmt.Errorf("калории не могут быть отрицательными")
	}
	if k.Protein < 0 {
		return fmt.Errorf("белки не могут быть отрицательными")
	}
	if k.Fat < 0 {
		return fmt.Errorf("жиры не могут быть отрицательными")
	}
	if k.Carbs < 0 {
		return fmt.Errorf("углеводы не могут быть отрицательными")
	}
	return nil
}

// FoodItem represents a food item from the database
type FoodItem struct {
	ID              string     `json:"id" db:"id"`
	Name            string     `json:"name" db:"name"`
	Brand           *string    `json:"brand,omitempty" db:"brand"`
	Category        string     `json:"category" db:"category"`
	ServingSize     float64    `json:"servingSize" db:"serving_size"`
	ServingUnit     string     `json:"servingUnit" db:"serving_unit"`
	NutritionPer100 KBZHU      `json:"nutritionPer100"`
	CaloriesPer100  float64    `json:"-" db:"calories_per_100"`
	ProteinPer100   float64    `json:"-" db:"protein_per_100"`
	FatPer100       float64    `json:"-" db:"fat_per_100"`
	CarbsPer100     float64    `json:"-" db:"carbs_per_100"`
	FiberPer100     *float64   `json:"fiber_per_100,omitempty" db:"fiber_per_100"`
	SugarPer100     *float64   `json:"sugar_per_100,omitempty" db:"sugar_per_100"`
	SodiumPer100    *float64   `json:"sodium_per_100,omitempty" db:"sodium_per_100"`
	Barcode         *string    `json:"barcode,omitempty" db:"barcode"`
	Source          FoodSource `json:"source" db:"source"`
	Verified        bool       `json:"verified" db:"verified"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
}

// Validate validates the food item fields
func (f *FoodItem) Validate() error {
	if f.Name == "" {
		return fmt.Errorf("название продукта обязательно")
	}
	if len(f.Name) > 255 {
		return fmt.Errorf("название продукта должно быть не более 255 символов")
	}
	if f.Category == "" {
		return fmt.Errorf("категория продукта обязательна")
	}
	if f.ServingSize <= 0 {
		return fmt.Errorf("размер порции должен быть положительным числом")
	}
	if f.ServingUnit == "" {
		return fmt.Errorf("единица измерения порции обязательна")
	}
	if err := f.NutritionPer100.Validate(); err != nil {
		return err
	}
	if !f.Source.IsValid() {
		return fmt.Errorf("недопустимый источник данных: %s", f.Source)
	}
	return nil
}

// PopulateNutrition populates NutritionPer100 from individual fields
func (f *FoodItem) PopulateNutrition() {
	f.NutritionPer100 = KBZHU{
		Calories: f.CaloriesPer100,
		Protein:  f.ProteinPer100,
		Fat:      f.FatPer100,
		Carbs:    f.CarbsPer100,
	}
}

// FoodEntry represents a food entry in user's log
type FoodEntry struct {
	ID            string      `json:"id" db:"id"`
	UserID        int64       `json:"userId" db:"user_id"`
	FoodID        string      `json:"foodId" db:"food_id"`
	FoodName      string      `json:"foodName" db:"food_name"`
	MealType      MealType    `json:"mealType" db:"meal_type"`
	PortionType   PortionType `json:"portionType" db:"portion_type"`
	PortionAmount float64     `json:"portionAmount" db:"portion_amount"`
	Nutrition     KBZHU       `json:"nutrition"`
	Calories      float64     `json:"-" db:"calories"`
	Protein       float64     `json:"-" db:"protein"`
	Fat           float64     `json:"-" db:"fat"`
	Carbs         float64     `json:"-" db:"carbs"`
	Time          string      `json:"time" db:"time"`
	Date          string      `json:"date" db:"date"`
	CreatedAt     time.Time   `json:"createdAt" db:"created_at"`
	UpdatedAt     time.Time   `json:"updatedAt" db:"updated_at"`
}

// Validate validates the food entry fields
func (e *FoodEntry) Validate() error {
	if e.UserID <= 0 {
		return fmt.Errorf("идентификатор пользователя обязателен")
	}
	if e.FoodID == "" {
		return fmt.Errorf("идентификатор продукта обязателен")
	}
	if e.FoodName == "" {
		return fmt.Errorf("название продукта обязательно")
	}
	if !e.MealType.IsValid() {
		return fmt.Errorf("тип приёма пищи должен быть: завтрак, обед, ужин или перекус")
	}
	if !e.PortionType.IsValid() {
		return fmt.Errorf("тип порции должен быть: граммы, миллилитры или порция")
	}
	if e.PortionAmount <= 0 {
		return fmt.Errorf("размер порции должен быть положительным числом")
	}
	if e.Time == "" {
		return fmt.Errorf("время обязательно")
	}
	if e.Date == "" {
		return fmt.Errorf("дата обязательна")
	}
	return nil
}

// PopulateNutrition populates Nutrition from individual fields
func (e *FoodEntry) PopulateNutrition() {
	e.Nutrition = KBZHU{
		Calories: e.Calories,
		Protein:  e.Protein,
		Fat:      e.Fat,
		Carbs:    e.Carbs,
	}
}

// UserFood represents a custom food item created by a user
type UserFood struct {
	ID             string    `json:"id" db:"id"`
	UserID         int64     `json:"user_id" db:"user_id"`
	Name           string    `json:"name" db:"name"`
	CaloriesPer100 float64   `json:"calories_per_100" db:"calories_per_100"`
	ProteinPer100  float64   `json:"protein_per_100" db:"protein_per_100"`
	FatPer100      float64   `json:"fat_per_100" db:"fat_per_100"`
	CarbsPer100    float64   `json:"carbs_per_100" db:"carbs_per_100"`
	ServingSize    float64   `json:"serving_size" db:"serving_size"`
	ServingUnit    string    `json:"serving_unit" db:"serving_unit"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
}

// Validate validates the user food fields
func (u *UserFood) Validate() error {
	if u.UserID <= 0 {
		return fmt.Errorf("идентификатор пользователя обязателен")
	}
	if u.Name == "" {
		return fmt.Errorf("название продукта обязательно")
	}
	if len(u.Name) > 255 {
		return fmt.Errorf("название продукта должно быть не более 255 символов")
	}
	if u.CaloriesPer100 < 0 {
		return fmt.Errorf("калории не могут быть отрицательными")
	}
	if u.ProteinPer100 < 0 {
		return fmt.Errorf("белки не могут быть отрицательными")
	}
	if u.FatPer100 < 0 {
		return fmt.Errorf("жиры не могут быть отрицательными")
	}
	if u.CarbsPer100 < 0 {
		return fmt.Errorf("углеводы не могут быть отрицательными")
	}
	return nil
}

// WaterLog represents daily water intake tracking
type WaterLog struct {
	ID        string    `json:"id" db:"id"`
	UserID    int64     `json:"user_id" db:"user_id"`
	Date      string    `json:"date" db:"date"`
	Glasses   int       `json:"glasses" db:"glasses"`
	Goal      int       `json:"goal" db:"goal"`
	GlassSize int       `json:"glass_size" db:"glass_size"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// Validate validates the water log fields
func (w *WaterLog) Validate() error {
	if w.UserID <= 0 {
		return fmt.Errorf("идентификатор пользователя обязателен")
	}
	if w.Date == "" {
		return fmt.Errorf("дата обязательна")
	}
	if w.Glasses < 0 {
		return fmt.Errorf("количество стаканов не может быть отрицательным")
	}
	if w.Goal <= 0 {
		return fmt.Errorf("цель по воде должна быть положительным числом")
	}
	if w.GlassSize <= 0 {
		return fmt.Errorf("размер стакана должен быть положительным числом")
	}
	return nil
}

// BarcodeCache represents cached barcode lookup data
type BarcodeCache struct {
	Barcode   string    `json:"barcode" db:"barcode"`
	FoodData  string    `json:"food_data" db:"food_data"` // JSONB stored as string
	Source    string    `json:"source" db:"source"`
	CachedAt  time.Time `json:"cached_at" db:"cached_at"`
	ExpiresAt time.Time `json:"expires_at" db:"expires_at"`
}

// NutrientRecommendation represents a nutrient recommendation
type NutrientRecommendation struct {
	ID                    string           `json:"id" db:"id"`
	Name                  string           `json:"name" db:"name"`
	Category              NutrientCategory `json:"category" db:"category"`
	DailyTarget           float64          `json:"daily_target" db:"daily_target"`
	Unit                  string           `json:"unit" db:"unit"`
	IsWeekly              bool             `json:"is_weekly" db:"is_weekly"`
	Description           *string          `json:"description,omitempty" db:"description"`
	Benefits              *string          `json:"benefits,omitempty" db:"benefits"`
	Effects               *string          `json:"effects,omitempty" db:"effects"`
	MinRecommendation     *float64         `json:"min_recommendation,omitempty" db:"min_recommendation"`
	OptimalRecommendation *float64         `json:"optimal_recommendation,omitempty" db:"optimal_recommendation"`
}

// UserNutrientPreference represents user's nutrient tracking preference
type UserNutrientPreference struct {
	UserID     int64  `json:"user_id" db:"user_id"`
	NutrientID string `json:"nutrient_id" db:"nutrient_id"`
	IsTracked  bool   `json:"is_tracked" db:"is_tracked"`
}

// UserCustomRecommendation represents a custom nutrient recommendation created by user
type UserCustomRecommendation struct {
	ID          string       `json:"id" db:"id"`
	UserID      int64        `json:"user_id" db:"user_id"`
	Name        string       `json:"name" db:"name"`
	DailyTarget float64      `json:"daily_target" db:"daily_target"`
	Unit        NutrientUnit `json:"unit" db:"unit"`
	CreatedAt   time.Time    `json:"created_at" db:"created_at"`
}

// Validate validates the custom recommendation fields
func (c *UserCustomRecommendation) Validate() error {
	if c.UserID <= 0 {
		return fmt.Errorf("идентификатор пользователя обязателен")
	}
	if c.Name == "" {
		return fmt.Errorf("название рекомендации обязательно")
	}
	if len(c.Name) > 100 {
		return fmt.Errorf("название рекомендации должно быть не более 100 символов")
	}
	if c.DailyTarget <= 0 {
		return fmt.Errorf("дневная норма должна быть положительным числом")
	}
	if !c.Unit.IsValid() {
		return fmt.Errorf("единица измерения должна быть: г, мг, мкг или МЕ")
	}
	return nil
}

// MealTemplate represents a saved meal template
type MealTemplate struct {
	ID            string    `json:"id" db:"id"`
	UserID        int64     `json:"user_id" db:"user_id"`
	Name          string    `json:"name" db:"name"`
	MealType      MealType  `json:"meal_type" db:"meal_type"`
	Entries       string    `json:"entries" db:"entries"` // JSONB stored as string
	TotalCalories float64   `json:"total_calories" db:"total_calories"`
	TotalProtein  float64   `json:"total_protein" db:"total_protein"`
	TotalFat      float64   `json:"total_fat" db:"total_fat"`
	TotalCarbs    float64   `json:"total_carbs" db:"total_carbs"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
}

// Validate validates the meal template fields
func (t *MealTemplate) Validate() error {
	if t.UserID <= 0 {
		return fmt.Errorf("идентификатор пользователя обязателен")
	}
	if t.Name == "" {
		return fmt.Errorf("название шаблона обязательно")
	}
	if len(t.Name) > 100 {
		return fmt.Errorf("название шаблона должно быть не более 100 символов")
	}
	if !t.MealType.IsValid() {
		return fmt.Errorf("тип приёма пищи должен быть: завтрак, обед, ужин или перекус")
	}
	return nil
}

// UserFavoriteFood represents a user's favorite food
type UserFavoriteFood struct {
	UserID  int64     `json:"user_id" db:"user_id"`
	FoodID  string    `json:"food_id" db:"food_id"`
	AddedAt time.Time `json:"added_at" db:"added_at"`
}

// ============================================================================
// Request Types
// ============================================================================

// CreateEntryRequest represents the request to create a food entry
type CreateEntryRequest struct {
	FoodID        string      `json:"foodId" binding:"required"`
	MealType      MealType    `json:"mealType" binding:"required,oneof=breakfast lunch dinner snack"`
	PortionType   PortionType `json:"portionType" binding:"required,oneof=grams milliliters portion"`
	PortionAmount float64     `json:"portionAmount" binding:"required,gt=0"`
	Time          string      `json:"time" binding:"required"`
	Date          string      `json:"date" binding:"required"`
	// Optional overrides — if provided, use these instead of DB-calculated values
	FoodName *string  `json:"foodName,omitempty"`
	Calories *float64 `json:"calories,omitempty" binding:"omitempty,gte=0"`
	Protein  *float64 `json:"protein,omitempty" binding:"omitempty,gte=0"`
	Fat      *float64 `json:"fat,omitempty" binding:"omitempty,gte=0"`
	Carbs    *float64 `json:"carbs,omitempty" binding:"omitempty,gte=0"`
}

// Validate validates the create entry request
func (r *CreateEntryRequest) Validate() error {
	if r.FoodID == "" {
		return fmt.Errorf("идентификатор продукта обязателен")
	}
	if !r.MealType.IsValid() {
		return fmt.Errorf("тип приёма пищи должен быть: завтрак, обед, ужин или перекус")
	}
	if !r.PortionType.IsValid() {
		return fmt.Errorf("тип порции должен быть: граммы, миллилитры или порция")
	}
	if r.PortionAmount <= 0 {
		return fmt.Errorf("размер порции должен быть положительным числом")
	}
	if r.Time == "" {
		return fmt.Errorf("время обязательно")
	}
	if r.Date == "" {
		return fmt.Errorf("дата обязательна")
	}
	return nil
}

// UpdateEntryRequest represents the request to update a food entry
type UpdateEntryRequest struct {
	MealType      *MealType    `json:"mealType,omitempty" binding:"omitempty,oneof=breakfast lunch dinner snack"`
	PortionType   *PortionType `json:"portionType,omitempty" binding:"omitempty,oneof=grams milliliters portion"`
	PortionAmount *float64     `json:"portionAmount,omitempty" binding:"omitempty,gt=0"`
	Time          *string      `json:"time,omitempty"`
	// Optional overrides — if provided, use these instead of recalculating from DB
	FoodName *string  `json:"foodName,omitempty"`
	Calories *float64 `json:"calories,omitempty" binding:"omitempty,gte=0"`
	Protein  *float64 `json:"protein,omitempty" binding:"omitempty,gte=0"`
	Fat      *float64 `json:"fat,omitempty" binding:"omitempty,gte=0"`
	Carbs    *float64 `json:"carbs,omitempty" binding:"omitempty,gte=0"`
}

// Validate validates the update entry request
func (r *UpdateEntryRequest) Validate() error {
	if r.MealType != nil && !r.MealType.IsValid() {
		return fmt.Errorf("тип приёма пищи должен быть: завтрак, обед, ужин или перекус")
	}
	if r.PortionType != nil && !r.PortionType.IsValid() {
		return fmt.Errorf("тип порции должен быть: граммы, миллилитры или порция")
	}
	if r.PortionAmount != nil && *r.PortionAmount <= 0 {
		return fmt.Errorf("размер порции должен быть положительным числом")
	}
	return nil
}

// SearchFoodsRequest represents the request to search for foods
type SearchFoodsRequest struct {
	Query  string `form:"q" binding:"required,min=2"`
	Limit  int    `form:"limit" binding:"omitempty,min=1,max=50"`
	Offset int    `form:"offset" binding:"omitempty,min=0"`
}

// Validate validates the search foods request
func (r *SearchFoodsRequest) Validate() error {
	if r.Query == "" {
		return fmt.Errorf("поисковый запрос обязателен")
	}
	if len(r.Query) < 2 {
		return fmt.Errorf("поисковый запрос должен содержать минимум 2 символа")
	}
	return nil
}

// GetEntriesRequest represents the request to get food entries
type GetEntriesRequest struct {
	Date string `form:"date" binding:"required"`
}

// Validate validates the get entries request
func (r *GetEntriesRequest) Validate() error {
	if r.Date == "" {
		return fmt.Errorf("дата обязательна")
	}
	return nil
}

// AddWaterRequest represents the request to add water intake
type AddWaterRequest struct {
	Date    string `json:"date" binding:"required"`
	Glasses int    `json:"glasses" binding:"omitempty,min=1"`
}

// Validate validates the add water request
func (r *AddWaterRequest) Validate() error {
	if r.Date == "" {
		return fmt.Errorf("дата обязательна")
	}
	if r.Glasses < 0 {
		return fmt.Errorf("количество стаканов не может быть отрицательным")
	}
	return nil
}

// GetWaterRequest represents the request to get water intake
type GetWaterRequest struct {
	Date string `form:"date" binding:"required"`
}

// UpdateNutrientPreferencesRequest represents the request to update nutrient preferences
type UpdateNutrientPreferencesRequest struct {
	NutrientIDs []string `json:"nutrient_ids" binding:"required"`
}

// Validate validates the update nutrient preferences request
func (r *UpdateNutrientPreferencesRequest) Validate() error {
	if len(r.NutrientIDs) == 0 {
		return fmt.Errorf("список нутриентов не может быть пустым")
	}
	return nil
}

// CreateCustomRecommendationRequest represents the request to create a custom recommendation
type CreateCustomRecommendationRequest struct {
	Name        string       `json:"name" binding:"required,max=100"`
	DailyTarget float64      `json:"daily_target" binding:"required,gt=0"`
	Unit        NutrientUnit `json:"unit" binding:"required,oneof=г мг мкг МЕ"`
}

// Validate validates the create custom recommendation request
func (r *CreateCustomRecommendationRequest) Validate() error {
	if r.Name == "" {
		return fmt.Errorf("название рекомендации обязательно")
	}
	if len(r.Name) > 100 {
		return fmt.Errorf("название рекомендации должно быть не более 100 символов")
	}
	if r.DailyTarget <= 0 {
		return fmt.Errorf("дневная норма должна быть положительным числом")
	}
	if !r.Unit.IsValid() {
		return fmt.Errorf("единица измерения должна быть: г, мг, мкг или МЕ")
	}
	return nil
}

// CreateUserFoodRequest represents the request to create a custom food item
type CreateUserFoodRequest struct {
	Name           string  `json:"name" binding:"required,max=255"`
	CaloriesPer100 float64 `json:"calories_per_100" binding:"required,min=0"`
	ProteinPer100  float64 `json:"protein_per_100" binding:"omitempty,min=0"`
	FatPer100      float64 `json:"fat_per_100" binding:"omitempty,min=0"`
	CarbsPer100    float64 `json:"carbs_per_100" binding:"omitempty,min=0"`
	ServingSize    float64 `json:"serving_size" binding:"omitempty,gt=0"`
	ServingUnit    string  `json:"serving_unit" binding:"omitempty"`
}

// Validate validates the create user food request
func (r *CreateUserFoodRequest) Validate() error {
	if r.Name == "" {
		return fmt.Errorf("название продукта обязательно")
	}
	if len(r.Name) > 255 {
		return fmt.Errorf("название продукта должно быть не более 255 символов")
	}
	if r.CaloriesPer100 < 0 {
		return fmt.Errorf("калории не могут быть отрицательными")
	}
	if r.ProteinPer100 < 0 {
		return fmt.Errorf("белки не могут быть отрицательными")
	}
	if r.FatPer100 < 0 {
		return fmt.Errorf("жиры не могут быть отрицательными")
	}
	if r.CarbsPer100 < 0 {
		return fmt.Errorf("углеводы не могут быть отрицательными")
	}
	if r.ServingSize < 0 {
		return fmt.Errorf("размер порции не может быть отрицательным")
	}
	return nil
}

// SaveMealTemplateRequest represents the request to save a meal as template
type SaveMealTemplateRequest struct {
	Name     string   `json:"name" binding:"required,max=100"`
	MealType MealType `json:"meal_type" binding:"required,oneof=breakfast lunch dinner snack"`
}

// Validate validates the save meal template request
func (r *SaveMealTemplateRequest) Validate() error {
	if r.Name == "" {
		return fmt.Errorf("название шаблона обязательно")
	}
	if len(r.Name) > 100 {
		return fmt.Errorf("название шаблона должно быть не более 100 символов")
	}
	if !r.MealType.IsValid() {
		return fmt.Errorf("тип приёма пищи должен быть: завтрак, обед, ужин или перекус")
	}
	return nil
}

// ApplyMealTemplateRequest represents the request to apply a meal template
type ApplyMealTemplateRequest struct {
	TemplateID string   `json:"template_id" binding:"required"`
	MealType   MealType `json:"meal_type" binding:"required,oneof=breakfast lunch dinner snack"`
	Date       string   `json:"date" binding:"required"`
}

// Validate validates the apply meal template request
func (r *ApplyMealTemplateRequest) Validate() error {
	if r.TemplateID == "" {
		return fmt.Errorf("идентификатор шаблона обязателен")
	}
	if !r.MealType.IsValid() {
		return fmt.Errorf("тип приёма пищи должен быть: завтрак, обед, ужин или перекус")
	}
	if r.Date == "" {
		return fmt.Errorf("дата обязательна")
	}
	return nil
}

// MoveEntryRequest represents the request to move an entry to a different meal slot
type MoveEntryRequest struct {
	MealType MealType `json:"meal_type" binding:"required,oneof=breakfast lunch dinner snack"`
}

// Validate validates the move entry request
func (r *MoveEntryRequest) Validate() error {
	if !r.MealType.IsValid() {
		return fmt.Errorf("тип приёма пищи должен быть: завтрак, обед, ужин или перекус")
	}
	return nil
}

// ============================================================================
// Response Types
// ============================================================================

// GetEntriesResponse represents the response for getting food entries
type GetEntriesResponse struct {
	Entries     map[MealType][]FoodEntry `json:"entries"`
	DailyTotals KBZHU                    `json:"dailyTotals"`
	TargetGoals *KBZHU                   `json:"targetGoals,omitempty"`
}

// SearchFoodsResponse represents the response for searching foods
type SearchFoodsResponse struct {
	Foods []FoodItem `json:"items"`
	Total int        `json:"total"`
}

// GetWaterResponse represents the response for getting water intake
type GetWaterResponse struct {
	Glasses   int `json:"glasses"`
	Goal      int `json:"goal"`
	GlassSize int `json:"glass_size"`
}

// GetRecommendationsResponse represents the response for getting nutrient recommendations
type GetRecommendationsResponse struct {
	Daily  map[NutrientCategory][]NutrientRecommendationWithProgress `json:"daily"`
	Weekly []NutrientRecommendationWithProgress                      `json:"weekly"`
	Custom []UserCustomRecommendation                                `json:"custom"`
}

// NutrientRecommendationWithProgress represents a recommendation with current progress
type NutrientRecommendationWithProgress struct {
	NutrientRecommendation
	CurrentIntake float64 `json:"current_intake"`
	Percentage    float64 `json:"percentage"`
}

// NutrientDetailResponse represents the response for getting nutrient details
type NutrientDetailResponse struct {
	NutrientRecommendation
	CurrentIntake float64            `json:"current_intake"`
	Sources       []FoodSourceInDiet `json:"sources"`
}

// FoodSourceInDiet represents a food source contributing to nutrient intake
type FoodSourceInDiet struct {
	FoodName     string  `json:"food_name"`
	Amount       float64 `json:"amount"`
	Unit         string  `json:"unit"`
	Contribution float64 `json:"contribution"`
}

// GetRecentFoodsResponse represents the response for getting recent foods
type GetRecentFoodsResponse struct {
	Foods []FoodItem `json:"foods"`
}

// GetFavoriteFoodsResponse represents the response for getting favorite foods
type GetFavoriteFoodsResponse struct {
	Foods []FoodItem `json:"foods"`
}

// GetMealTemplatesResponse represents the response for getting meal templates
type GetMealTemplatesResponse struct {
	Templates []MealTemplate `json:"templates"`
}

// RecognizedFood represents a food item recognized by AI
type RecognizedFood struct {
	Name            string     `json:"name"`
	Confidence      float64    `json:"confidence"`
	EstimatedWeight float64    `json:"estimated_weight"`
	Nutrition       KBZHU      `json:"nutrition"`
	Alternatives    []FoodItem `json:"alternatives,omitempty"`
}

// AIRecognitionResponse represents the response from AI food recognition
type AIRecognitionResponse struct {
	Foods   []RecognizedFood `json:"foods"`
	Success bool             `json:"success"`
	Error   *string          `json:"error,omitempty"`
}

// BarcodeResponse represents the response for barcode lookup
type BarcodeResponse struct {
	Found   bool      `json:"found"`
	Food    *FoodItem `json:"food,omitempty"`
	Cached  bool      `json:"cached"`
	Message *string   `json:"message,omitempty"`
}

// DailyTotalsResponse represents the response for daily totals
type DailyTotalsResponse struct {
	Totals       KBZHU  `json:"totals"`
	Goals        *KBZHU `json:"goals,omitempty"`
	WaterGlasses int    `json:"water_glasses"`
	WaterGoal    int    `json:"water_goal"`
}

// WeeklyAnalyticsResponse represents the response for weekly analytics
type WeeklyAnalyticsResponse struct {
	AverageCalories   float64    `json:"average_calories"`
	AverageProtein    float64    `json:"average_protein"`
	AverageFat        float64    `json:"average_fat"`
	AverageCarbs      float64    `json:"average_carbs"`
	DaysLogged        int        `json:"days_logged"`
	GoalAdherence     float64    `json:"goal_adherence"`
	MostFrequentFoods []FoodItem `json:"most_frequent_foods"`
	Insights          []string   `json:"insights"`
}
