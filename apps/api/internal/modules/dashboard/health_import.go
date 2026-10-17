package dashboard

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Импорт данных Apple Здоровья (health-import, daily-metric-source).
//
// Приложение на iPhone присылает пачки записей: дневные суммы шагов, первое
// взвешивание даты, тренировки и удаления тренировок. Пачка повторяема:
// очередь на телефоне досылает её после обрыва сети, и повтор ничего не
// меняет — шаги и вес пишутся по ключу (пользователь, дата), тренировка — по
// (пользователь, external_id), удаление несуществующего — пустая операция.

// Границы пачки и записи.
const (
	HealthImportMaxItems   = 500
	HealthImportMaxAgeDays = 366
	healthMinWeightKg      = 20
	healthMaxWeightKg      = 500
	healthMaxSteps         = 100000
	healthMinWorkoutMin    = 1
	healthMaxWorkoutMin    = 600
	healthMaxExternalIDLen = 255
)

// Виды записей пачки.
const (
	HealthKindSteps          = "steps"
	HealthKindWeight         = "weight"
	HealthKindWorkout        = "workout"
	HealthKindWorkoutDeleted = "workout_deleted"
)

// ErrHealthNotConnected: признак apple_health_enabled снят — приложение
// отключило Здоровье, а очередь на телефоне досылает пачку. Ничего не
// сохраняется.
var ErrHealthNotConnected = fmt.Errorf("%w: apple health is not connected", apperrors.ErrConflict)

// HealthImportRequest — тело POST /api/v1/health/import.
//
// Записи разбираются поштучно, а не целиком: запись с полем не того типа
// отклоняется одна, а не вместе со всей пачкой.
type HealthImportRequest struct {
	Items []json.RawMessage `json:"items"`
}

// HealthImportRejection — отклонённая запись: её индекс в пачке и код.
type HealthImportRejection struct {
	Index int    `json:"index"`
	Code  string `json:"code"`
}

// HealthImportResult — ответ импорта.
//
// accepted считает все прошедшие проверку записи, в том числе те, что ничего
// не изменили: значение с ручным источником, повтор той же пачки.
type HealthImportResult struct {
	Accepted int                     `json:"accepted"`
	Rejected []HealthImportRejection `json:"rejected"`

	// Даты, у которых изменился вес или тренировка дня, — по ним
	// пересчитывается норма; workoutAdded — те из них, где тренировка дня
	// теперь есть (по ним отмечаются задачи куратора). Не часть ответа.
	weightDates  []string
	workoutDates []string
	workoutAdded []string
}

// healthItem — запись пачки как её присылает приложение.
type healthItem struct {
	Kind        string   `json:"kind"`
	Date        string   `json:"date"`
	Value       *float64 `json:"value"`
	ValueKg     *float64 `json:"value_kg"`
	ExternalID  string   `json:"external_id"`
	StartedAt   string   `json:"started_at"`
	Type        string   `json:"type"`
	DurationMin *float64 `json:"duration_min"`
}

// healthRecord — проверенная запись.
type healthRecord struct {
	kind        string
	date        string // YYYY-MM-DD в поясе профиля
	steps       int
	weightKg    float64
	externalID  string
	startedAt   time.Time
	workoutType string // наш код вида тренировки
	durationMin int
}

// healthWorkoutTypes переводит HKWorkoutActivityType (имя случая в Swift) в
// наш код вида тренировки — те же коды, что пишет форма (миграция 062).
// Перевод на сервере, а не в приложении: таблицу можно поправить без
// выпуска приложения. Наши собственные коды принимаются как есть.
var healthWorkoutTypes = map[string]string{
	"traditionalStrengthTraining":   "strength",
	"functionalStrengthTraining":    "strength",
	"running":                       "running",
	"cycling":                       "cycling",
	"swimming":                      "swimming",
	"yoga":                          "yoga",
	"flexibility":                   "stretching",
	"highIntensityIntervalTraining": "hiit",
	"elliptical":                    "cardio",
	"rowing":                        "cardio",
	"stairClimbing":                 "cardio",
	"stairs":                        "cardio",
	"stepTraining":                  "cardio",
	"mixedCardio":                   "cardio",
	// Наши коды.
	"strength":   "strength",
	"cardio":     "cardio",
	"hiit":       "hiit",
	"stretching": "stretching",
	"other":      "other",
}

// HealthWorkoutType — наш код для вида тренировки из Здоровья; всё
// незнакомое — «Другое».
func HealthWorkoutType(activity string) string {
	if code, ok := healthWorkoutTypes[strings.TrimSpace(activity)]; ok {
		return code
	}
	return "other"
}

// parseHealthItem проверяет запись. today — сегодняшняя дата в поясе профиля.
func parseHealthItem(raw json.RawMessage, today time.Time) (healthRecord, bool) {
	var item healthItem
	if err := json.Unmarshal(raw, &item); err != nil {
		return healthRecord{}, false
	}
	rec := healthRecord{kind: item.Kind}

	if item.Kind == HealthKindWorkoutDeleted {
		rec.externalID = strings.TrimSpace(item.ExternalID)
		return rec, validExternalID(rec.externalID)
	}

	date, ok := parseHealthDate(item.Date, today)
	if !ok {
		return healthRecord{}, false
	}
	rec.date = date

	switch item.Kind {
	case HealthKindSteps:
		if item.Value == nil || *item.Value < 0 || *item.Value > healthMaxSteps {
			return healthRecord{}, false
		}
		rec.steps = int(math.Round(*item.Value))
	case HealthKindWeight:
		if item.ValueKg == nil || *item.ValueKg < healthMinWeightKg || *item.ValueKg > healthMaxWeightKg {
			return healthRecord{}, false
		}
		rec.weightKg = math.Round(*item.ValueKg*100) / 100
	case HealthKindWorkout:
		rec.externalID = strings.TrimSpace(item.ExternalID)
		if !validExternalID(rec.externalID) || item.DurationMin == nil {
			return healthRecord{}, false
		}
		minutes := int(math.Round(*item.DurationMin))
		if minutes < healthMinWorkoutMin || minutes > healthMaxWorkoutMin {
			return healthRecord{}, false
		}
		started, err := time.Parse(time.RFC3339, item.StartedAt)
		if err != nil {
			return healthRecord{}, false
		}
		rec.durationMin = minutes
		rec.startedAt = started
		rec.workoutType = HealthWorkoutType(item.Type)
	default:
		return healthRecord{}, false
	}
	return rec, true
}

func validExternalID(id string) bool {
	return id != "" && len(id) <= healthMaxExternalIDLen
}

// parseHealthDate принимает дату YYYY-MM-DD не позже сегодняшней и не старше
// HealthImportMaxAgeDays дней по поясу профиля.
func parseHealthDate(value string, today time.Time) (string, bool) {
	date, err := time.ParseInLocation("2006-01-02", value, today.Location())
	if err != nil {
		return "", false
	}
	if date.After(today) || date.Before(today.AddDate(0, 0, -HealthImportMaxAgeDays)) {
		return "", false
	}
	return date.Format("2006-01-02"), true
}

// ImportHealth сохраняет пачку записей Здоровья для пользователя.
//
// Признак apple_health_enabled проверяется под блокировкой строки настроек,
// и вся пачка пишется одной транзакцией: импорты одного пользователя идут
// по очереди (иначе два одновременных пересчёта тренировки дня не видели бы
// тренировок друг друга), а отключение Здоровья не проскакивает посреди пачки.
// Сбой посреди пачки откатывает её целиком — повтор той же пачки безопасен.
func (s *Service) ImportHealth(ctx context.Context, userID int64, now time.Time, items []json.RawMessage) (*HealthImportResult, error) {
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin health import: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var enabled bool
	err = tx.QueryRowContext(ctx,
		`SELECT COALESCE(apple_health_enabled, false) FROM user_settings WHERE user_id = $1 FOR UPDATE`,
		userID).Scan(&enabled)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("read apple_health_enabled: %w", err)
	}
	if !enabled {
		return nil, ErrHealthNotConnected
	}

	result := &HealthImportResult{Rejected: make([]HealthImportRejection, 0)}
	weightDates := map[string]bool{}
	workoutDirty := map[string]bool{}

	for index, raw := range items {
		rec, ok := parseHealthItem(raw, today)
		if !ok {
			result.Rejected = append(result.Rejected, HealthImportRejection{Index: index, Code: apperrors.CodeValidation})
			continue
		}
		result.Accepted++

		switch rec.kind {
		case HealthKindSteps:
			if err := importSteps(ctx, tx, userID, rec); err != nil {
				return nil, err
			}
		case HealthKindWeight:
			changed, err := importWeight(ctx, tx, userID, rec)
			if err != nil {
				return nil, err
			}
			if changed {
				weightDates[rec.date] = true
			}
		case HealthKindWorkout:
			dates, err := upsertHealthWorkout(ctx, tx, userID, rec)
			if err != nil {
				return nil, err
			}
			for _, d := range dates {
				workoutDirty[d] = true
			}
		case HealthKindWorkoutDeleted:
			date, err := deleteHealthWorkout(ctx, tx, userID, rec.externalID)
			if err != nil {
				return nil, err
			}
			if date != "" {
				workoutDirty[date] = true
			}
		}
	}

	for _, date := range sortedKeys(workoutDirty) {
		changed, present, err := recomputeWorkoutOfDay(ctx, tx, userID, date)
		if err != nil {
			return nil, err
		}
		if changed {
			result.workoutDates = append(result.workoutDates, date)
			if present {
				result.workoutAdded = append(result.workoutAdded, date)
			}
		}
	}
	result.weightDates = sortedKeys(weightDates)

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit health import: %w", err)
	}

	s.log.LogBusinessEvent("health_imported", map[string]interface{}{
		"user_id":  userID,
		"accepted": result.Accepted,
		"rejected": len(result.Rejected),
	})
	return result, nil
}

// importSteps пишет дневную сумму шагов, если у даты нет ручного значения.
// Ноль шагов — значения нет: источник снимается, новая строка не заводится.
func importSteps(ctx context.Context, tx *sql.Tx, userID int64, rec healthRecord) error {
	if rec.steps == 0 {
		if _, err := tx.ExecContext(ctx, `
			UPDATE daily_metrics SET steps = 0, steps_source = NULL, updated_at = NOW()
			WHERE user_id = $1 AND date = $2::date AND steps_source = 'healthkit'`,
			userID, rec.date); err != nil {
			return fmt.Errorf("clear imported steps: %w", err)
		}
		return nil
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO daily_metrics (user_id, date, steps, steps_source)
		VALUES ($1, $2::date, $3, 'healthkit')
		ON CONFLICT (user_id, date) DO UPDATE
		SET steps = EXCLUDED.steps, steps_source = 'healthkit', updated_at = NOW()
		WHERE daily_metrics.steps_source IS DISTINCT FROM 'manual'
		  AND (daily_metrics.steps IS DISTINCT FROM EXCLUDED.steps
		       OR daily_metrics.steps_source IS DISTINCT FROM 'healthkit')`,
		userID, rec.date, rec.steps); err != nil {
		return fmt.Errorf("import steps: %w", err)
	}
	return nil
}

// importWeight пишет вес даты, если у неё нет ручного значения. Сообщает,
// изменился ли вес: от него зависит норма.
func importWeight(ctx context.Context, tx *sql.Tx, userID int64, rec healthRecord) (bool, error) {
	var one int
	err := tx.QueryRowContext(ctx, `
		INSERT INTO daily_metrics (user_id, date, weight, weight_source)
		VALUES ($1, $2::date, $3, 'healthkit')
		ON CONFLICT (user_id, date) DO UPDATE
		SET weight = EXCLUDED.weight, weight_source = 'healthkit', updated_at = NOW()
		WHERE daily_metrics.weight_source IS DISTINCT FROM 'manual'
		  AND (daily_metrics.weight IS DISTINCT FROM EXCLUDED.weight
		       OR daily_metrics.weight_source IS DISTINCT FROM 'healthkit')
		RETURNING 1`,
		userID, rec.date, rec.weightKg).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("import weight: %w", err)
	}
	return true, nil
}

// upsertHealthWorkout сохраняет тренировку по её UUID и возвращает даты,
// тренировку дня которых нужно пересчитать: новую и, если тренировку
// перенесли на другую дату, прежнюю. Неизменная тренировка дат не даёт.
func upsertHealthWorkout(ctx context.Context, tx *sql.Tx, userID int64, rec healthRecord) ([]string, error) {
	var previous sql.NullString
	err := tx.QueryRowContext(ctx,
		`SELECT to_char(date, 'YYYY-MM-DD') FROM health_workouts WHERE user_id = $1 AND external_id = $2`,
		userID, rec.externalID).Scan(&previous)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("read health workout: %w", err)
	}

	var one int
	err = tx.QueryRowContext(ctx, `
		INSERT INTO health_workouts (user_id, external_id, date, type, duration_min, started_at)
		VALUES ($1, $2, $3::date, $4, $5, $6)
		ON CONFLICT (user_id, external_id) DO UPDATE
		SET date = EXCLUDED.date, type = EXCLUDED.type, duration_min = EXCLUDED.duration_min,
		    started_at = EXCLUDED.started_at, updated_at = NOW()
		WHERE (health_workouts.date, health_workouts.type, health_workouts.duration_min, health_workouts.started_at)
		      IS DISTINCT FROM (EXCLUDED.date, EXCLUDED.type, EXCLUDED.duration_min, EXCLUDED.started_at)
		RETURNING 1`,
		userID, rec.externalID, rec.date, rec.workoutType, rec.durationMin, rec.startedAt).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("upsert health workout: %w", err)
	}

	dates := []string{rec.date}
	if previous.Valid && previous.String != rec.date {
		dates = append(dates, previous.String)
	}
	return dates, nil
}

// deleteHealthWorkout убирает тренировку, удалённую в Здоровье, и возвращает
// её дату. Незнакомый UUID — пустая операция: удаление тоже повторяемо.
func deleteHealthWorkout(ctx context.Context, tx *sql.Tx, userID int64, externalID string) (string, error) {
	var date string
	err := tx.QueryRowContext(ctx,
		`DELETE FROM health_workouts WHERE user_id = $1 AND external_id = $2
		 RETURNING to_char(date, 'YYYY-MM-DD')`,
		userID, externalID).Scan(&date)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("delete health workout: %w", err)
	}
	return date, nil
}

// recomputeWorkoutOfDay выводит тренировку дня из тренировок Здоровья за дату:
// виды с длительностью («running:45,strength:30» — формат формы) и сумма минут.
// Ручную тренировку дня не трогает. Сообщает, изменилась ли тренировка дня и
// есть ли она теперь.
func recomputeWorkoutOfDay(ctx context.Context, tx *sql.Tx, userID int64, date string) (changed, present bool, err error) {
	parts, total, readErr := func() ([]string, int, error) {
		rows, err := tx.QueryContext(ctx, `
			SELECT type, SUM(duration_min)::int
			FROM health_workouts
			WHERE user_id = $1 AND date = $2::date
			GROUP BY type
			ORDER BY MIN(started_at), type`, userID, date)
		if err != nil {
			return nil, 0, fmt.Errorf("read workouts of day: %w", err)
		}
		defer rows.Close()

		var parts []string
		total := 0
		for rows.Next() {
			var kind string
			var minutes int
			if err := rows.Scan(&kind, &minutes); err != nil {
				return nil, 0, fmt.Errorf("scan workouts of day: %w", err)
			}
			parts = append(parts, fmt.Sprintf("%s:%d", kind, minutes))
			total += minutes
		}
		return parts, total, rows.Err()
	}()
	if readErr != nil {
		return false, false, readErr
	}

	if len(parts) == 0 {
		res, err := tx.ExecContext(ctx, `
			UPDATE daily_metrics
			SET workout_completed = false, workout_type = NULL, workout_duration = NULL,
			    workout_source = NULL, updated_at = NOW()
			WHERE user_id = $1 AND date = $2::date AND workout_source = 'healthkit'`,
			userID, date)
		if err != nil {
			return false, false, fmt.Errorf("clear workout of day: %w", err)
		}
		n, err := res.RowsAffected()
		if err != nil {
			return false, false, fmt.Errorf("clear workout of day: %w", err)
		}
		return n > 0, false, nil
	}

	var one int
	err = tx.QueryRowContext(ctx, `
		INSERT INTO daily_metrics (user_id, date, workout_completed, workout_type, workout_duration, workout_source)
		VALUES ($1, $2::date, true, $3, $4, 'healthkit')
		ON CONFLICT (user_id, date) DO UPDATE
		SET workout_completed = true, workout_type = EXCLUDED.workout_type,
		    workout_duration = EXCLUDED.workout_duration, workout_source = 'healthkit', updated_at = NOW()
		WHERE daily_metrics.workout_source IS DISTINCT FROM 'manual'
		  AND (daily_metrics.workout_completed IS DISTINCT FROM true
		       OR daily_metrics.workout_type IS DISTINCT FROM EXCLUDED.workout_type
		       OR daily_metrics.workout_duration IS DISTINCT FROM EXCLUDED.workout_duration
		       OR daily_metrics.workout_source IS DISTINCT FROM 'healthkit')
		RETURNING 1`,
		userID, date, strings.Join(parts, ","), total).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, true, nil
	}
	if err != nil {
		return false, false, fmt.Errorf("write workout of day: %w", err)
	}
	return true, true, nil
}

func sortedKeys(set map[string]bool) []string {
	keys := make([]string, 0, len(set))
	for k := range set {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// ImportHealth handles POST /api/v1/health/import.
//
// 400 validation — тело не разобрать или в пачке больше 500 записей (ничего не
// сохранено); 409 conflict — Здоровье не подключено (apple_health_enabled
// снят, ничего не сохранено); 200 {accepted, rejected} — остальное, плохие
// записи отклоняются поштучно.
func (h *Handler) ImportHealth(c *gin.Context) {
	userIDValue, exists := c.Get("user_id")
	userID, ok := userIDValue.(int64)
	if !exists || !ok {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	var req HealthImportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ErrorCode(c, http.StatusBadRequest, apperrors.CodeValidation, "Неверные данные запроса", nil)
		return
	}
	if len(req.Items) > HealthImportMaxItems {
		response.ErrorCode(c, http.StatusBadRequest, apperrors.CodeValidation,
			fmt.Sprintf("В пачке больше %d записей", HealthImportMaxItems),
			map[string]any{"max_items": HealthImportMaxItems})
		return
	}

	ctx := c.Request.Context()
	loc := middleware.GetUserTimezone(ctx, h.db, userID)
	result, err := h.service.ImportHealth(ctx, userID, time.Now().In(loc), req.Items)
	if err != nil {
		if errors.Is(err, apperrors.ErrConflict) {
			response.Fail(c, http.StatusConflict, err, "Здоровье не подключено")
			return
		}
		h.log.Errorw("Failed to import health data", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось сохранить данные Здоровья")
		return
	}

	h.afterHealthImport(ctx, userID, loc, result)
	response.Success(c, http.StatusOK, result)
}

// afterHealthImport делает то же, что ручной ввод после сохранения: пересчитывает
// норму дат, где изменился вес или тренировка, и отмечает подходящие задачи
// куратора. Сбой здесь не отменяет импорт — данные уже сохранены.
func (h *Handler) afterHealthImport(ctx context.Context, userID int64, loc *time.Location, result *HealthImportResult) {
	recalc := map[string]bool{}
	for _, d := range result.weightDates {
		recalc[d] = true
	}
	for _, d := range result.workoutDates {
		recalc[d] = true
	}
	for _, d := range sortedKeys(recalc) {
		date, err := time.ParseInLocation("2006-01-02", d, loc)
		if err != nil {
			continue
		}
		if h.nutritionCalcSvc != nil {
			if _, err := h.nutritionCalcSvc.RecalculateForDate(ctx, userID, date); err != nil {
				h.log.Errorw("Failed to recalculate KBJU after health import", "error", err, "user_id", userID, "date", d)
			}
		}
	}

	complete := func(dates []string, taskType string) {
		for _, d := range dates {
			date, err := time.ParseInLocation("2006-01-02", d, loc)
			if err != nil {
				continue
			}
			if err := h.service.AutoCompleteMatchingTasks(ctx, userID, taskType, date); err != nil {
				h.log.Errorw("Failed to auto-complete tasks after health import", "error", err, "user_id", userID)
			}
		}
	}
	complete(result.weightDates, "measurement")
	complete(result.workoutAdded, "workout")
}
