package foodtracker

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// Подсчёт потребления нутриентов по записям дня.
//
// Справочник продуктов хранит содержание микронутриентов в
// `food_items.additional_nutrients` — jsonb, граммы на 100 г, наследство
// OpenFoodFacts. На проде поле заполнено у 1 735 984 продуктов из 1 777 854, и до
// этого файла его не читала ни одна строка Go.
//
// Покрытие неполное: у железа содержание известно примерно у 14 % справочника, у
// витамина E — у 2 %. Поэтому величина здесь — **нижняя граница**, и вместе с ней
// всегда возвращается покрытие: сколько записей дня в неё вошло и сколько записей
// было всего. Число без этого читается как итог дня, а оно им не является.

// Механизмы, которыми справочник описывает происхождение величины
// (`nutrient_recommendations.intake_source`).
const (
	intakeFromKBZHU  = "kbzhu"  // из дневных итогов КБЖУ
	intakeFromColumn = "column" // из своей колонки food_items
	intakeFromJSON   = "json"   // из food_items.additional_nutrients
)

// maxShareOfFood — предел годности значения: часть не тяжелее целого.
//
// В справочнике продуктов есть мусор вплоть до 1 200 000 г витамина C на 100 г.
// Отсекается только арифметически невозможное: правдоподобие — вопрос
// медицинский, а МР 2.3.1.0253-21 верхних допустимых уровней не даёт, и порог
// «больше N суточных норм» пришлось бы придумать. Сушёный шиповник даёт 1,25 г
// витамина C на 100 г, то есть придуманный порог отбросил бы настоящую еду.
const maxShareOfFood = 100.0 // граммов нутриента на 100 г продукта

// dayEntry — запись дня с содержанием нутриентов того продукта, который съели.
type dayEntry struct {
	PortionAmount float64
	FiberPer100   *float64
	SodiumPer100  *float64
	Additional    map[string]float64
}

// nutrientIntake — посчитанная величина и то, по чему она посчитана.
type nutrientIntake struct {
	// Value в единице справочника продуктов: граммы на съеденную порцию.
	Value float64
	// CountedEntries — записей дня, у которых содержание известно и годно.
	CountedEntries int
	// TotalEntries — записей дня всего.
	TotalEntries int
}

// dayEntries читает записи дня вместе с содержанием нутриентов.
//
// Один запрос на день, а не на нутриент: нутриентов 33, записей в дне единицы.
func (s *Service) dayEntries(ctx context.Context, userID int64, date time.Time) ([]dayEntry, error) {
	startTime := time.Now()
	dateStr := date.Format("2006-01-02")

	query := `
		SELECT fe.portion_amount, fi.fiber_per_100, fi.sodium_per_100, fi.additional_nutrients
		FROM food_entries fe
		JOIN food_items fi ON fi.id = fe.food_id
		WHERE fe.user_id = $1 AND fe.date = $2
	`

	rows, err := s.db.QueryContext(ctx, query, userID, dateStr)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
			"date":    dateStr,
		})
		return nil, fmt.Errorf("ошибка при чтении записей дня: %w", err)
	}
	defer rows.Close()

	var entries []dayEntry
	for rows.Next() {
		var entry dayEntry
		var raw []byte
		if err := rows.Scan(&entry.PortionAmount, &entry.FiberPer100, &entry.SodiumPer100, &raw); err != nil {
			s.log.Error("Failed to scan day entry", "error", err)
			continue
		}
		if len(raw) > 0 {
			entry.Additional = parseAdditional(raw)
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ошибка при обработке записей дня: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
		"date":    dateStr,
		"entries": len(entries),
	})

	return entries, nil
}

// parseAdditional разбирает jsonb с содержанием нутриентов.
//
// Значения в справочнике бывают и строками, и числами — краудсорс. Всё, что не
// разбирается в число, считается отсутствующим: это честнее нуля и честнее
// отказа, потому что отказ из-за одной битой строки лишил бы человека всего дня.
func parseAdditional(raw []byte) map[string]float64 {
	var loose map[string]json.RawMessage
	if err := json.Unmarshal(raw, &loose); err != nil {
		return nil
	}

	values := make(map[string]float64, len(loose))
	for key, value := range loose {
		// `null` разбирается в float64 без ошибки и даёт ноль — то есть
		// «неизвестно» превратилось бы в измеренный ноль. Отсекается здесь.
		if string(value) == "null" {
			continue
		}

		var number float64
		if err := json.Unmarshal(value, &number); err == nil {
			values[key] = number
			continue
		}
		var text string
		if err := json.Unmarshal(value, &text); err == nil {
			var parsed float64
			if _, err := fmt.Sscanf(strings.TrimSpace(text), "%g", &parsed); err == nil {
				values[key] = parsed
			}
		}
	}
	return values
}

// contentPer100 — содержание нутриента в 100 г продукта, если оно известно и годно.
func contentPer100(entry dayEntry, source string) (float64, bool) {
	mechanism, key, ok := splitIntakeSource(source)
	if !ok {
		return 0, false
	}

	var value float64
	switch mechanism {
	case intakeFromColumn:
		// В колонке ноль неотличим от «не заполнено», и это не рассуждение, а
		// наблюдение: у гречки из таблицы products `fiber` равна нулю, тогда как
		// клетчатки в гречке около 10 г на 100 г. Поэтому ноль здесь считается
		// неизвестным.
		//
		// Цена: у продукта, в котором клетчатки действительно нет — креветки,
		// масло, — знание тоже теряется, и день из таких продуктов покажет
		// «неизвестно» вместо нуля. Ошибаться в эту сторону правильнее: ноль на
		// экране человек читает как «я не добрал», а не как «мы не знаем».
		switch key {
		case "fiber_per_100":
			if entry.FiberPer100 == nil || *entry.FiberPer100 == 0 {
				return 0, false
			}
			value = *entry.FiberPer100
		case "sodium_per_100":
			if entry.SodiumPer100 == nil || *entry.SodiumPer100 == 0 {
				return 0, false
			}
			value = *entry.SodiumPer100
		default:
			return 0, false
		}
	case intakeFromJSON:
		// В jsonb ключ появляется только когда импортёру было что записать,
		// поэтому ноль здесь — измеренный ноль, а не пропуск.
		found, ok := entry.Additional[key]
		if !ok {
			return 0, false
		}
		value = found
	default:
		return 0, false
	}

	if value < 0 || value > maxShareOfFood {
		// Часть не тяжелее целого. Такая запись считается записью без известного
		// содержания — не нулём.
		return 0, false
	}
	return value, true
}

// splitIntakeSource разбирает `механизм:ключ`.
func splitIntakeSource(source string) (mechanism, key string, ok bool) {
	parts := strings.SplitN(source, ":", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

// intakeFromEntries считает потребление по записям дня.
//
// Пересчёт на съеденное — тот же, что у КБЖУ (`CalculateKBZHU`):
// содержание_на_100 × portion_amount / 100. Иначе на одном экране оказались бы
// два числа, полученных по разным правилам.
func intakeFromEntries(entries []dayEntry, source string) *nutrientIntake {
	if source == "" {
		return nil
	}
	mechanism, _, ok := splitIntakeSource(source)
	if !ok || mechanism == intakeFromKBZHU {
		// КБЖУ считается не отсюда: у него есть дневные итоги.
		return nil
	}

	result := nutrientIntake{TotalEntries: len(entries)}
	for _, entry := range entries {
		content, known := contentPer100(entry, source)
		if !known {
			continue
		}
		result.Value += content * entry.PortionAmount / 100
		result.CountedEntries++
	}

	if result.CountedEntries == 0 {
		// Ничего не посчитано — значит потребление неизвестно. Ноль здесь
		// прочитали бы как «вы не добрали».
		return nil
	}
	return &result
}

// intakeUnitFactor — множитель перевода граммов в единицу нормы.
//
// Справочник продуктов хранит граммы на 100 г, а нормы заданы в миллиграммах,
// микрограммах или граммах.
func intakeUnitFactor(unit string) (float64, bool) {
	switch unit {
	case "g":
		return 1, true
	case "mg":
		return 1_000, true
	case "mcg":
		return 1_000_000, true
	default:
		// МЕ и всё незнакомое переводить нечем: у такого нутриента потребление
		// не показывается вовсе.
		return 0, false
	}
}
