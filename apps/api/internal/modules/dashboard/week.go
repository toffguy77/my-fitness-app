package dashboard

import (
	"bytes"
	"encoding/json"
	"fmt"
	"time"
)

// Неделя фото и отчёта — с понедельника по воскресенье, как во всём
// дашборде (календарь веба, «Сегодня» в приложении, date_trunc('week') в
// SQL). Раньше фото записывалось в неделю с воскресенья, отсчитанную от
// времени сервера, а отчёт искал фото по неделе с понедельника: проверка
// «фото недели загружено» не сходилась никогда.

const weekDateLayout = "2006-01-02"

// calendarWeek — неделя с понедельника, содержащая календарную дату t в её
// собственном часовом поясе («как написано»: 2026-10-12T00:00:00+03:00 —
// это 12 октября, а не 11-е по UTC). Возвращает полночь UTC понедельника и
// воскресенья — значения для столбцов типа date.
func calendarWeek(t time.Time) (start, end time.Time) {
	day := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
	offset := (int(day.Weekday()) + 6) % 7 // понедельник — 0
	start = day.AddDate(0, 0, -offset)
	return start, start.AddDate(0, 0, 6)
}

// isoWeekIdentifier — «2026-W42» для понедельника недели. Клиенты считают
// идентификатор по-разному (веб — не по ISO), поэтому сервер хранит свой.
func isoWeekIdentifier(monday time.Time) string {
	year, week := monday.ISOWeek()
	return fmt.Sprintf("%04d-W%02d", year, week)
}

// reportWeekNumber — номер недели отчёта от 1 января года её понедельника.
func reportWeekNumber(monday time.Time) int {
	return int(monday.Sub(time.Date(monday.Year(), 1, 1, 0, 0, 0, 0, time.UTC)).Hours()/24/7) + 1
}

// WeekDate — дата недели в запросе: «2026-10-12» (так шлёт веб) или
// RFC 3339 (так шлёт приложение: полночь в поясе профиля). Берётся
// календарная дата как написано, без перевода в UTC.
type WeekDate struct {
	time.Time
}

// UnmarshalJSON принимает дату без времени и RFC 3339.
func (d *WeekDate) UnmarshalJSON(raw []byte) error {
	if bytes.Equal(raw, []byte("null")) {
		d.Time = time.Time{}
		return nil
	}
	var text string
	if err := json.Unmarshal(raw, &text); err != nil {
		return fmt.Errorf("дата недели должна быть строкой: %w", err)
	}
	if day, err := time.Parse(weekDateLayout, text); err == nil {
		d.Time = day
		return nil
	}
	moment, err := time.Parse(time.RFC3339, text)
	if err != nil {
		return fmt.Errorf("дата недели %q: ожидается ГГГГ-ММ-ДД или RFC 3339", text)
	}
	d.Time = moment
	return nil
}
