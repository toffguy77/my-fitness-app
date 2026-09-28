package curatoraccess

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func day(y int, m time.Month, d int) time.Time {
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

func ptr(t time.Time) *time.Time { return &t }

// Право следует из связи и её срока: три случая, которые ничем другим не
// различаются.
func TestAllowedOn(t *testing.T) {
	today := day(2026, time.October, 15)

	cases := []struct {
		name    string
		state   State
		allowed bool
	}{
		{
			name:    "связи нет",
			state:   State{},
			allowed: false,
		},
		{
			name:    "активна, срок в будущем",
			state:   State{CuratorID: 7, Status: StatusActive, ExpiresAt: ptr(day(2026, time.November, 1))},
			allowed: true,
		},
		{
			name:    "активна, срока нет",
			state:   State{CuratorID: 7, Status: StatusActive},
			allowed: true,
		},
		{
			// Последний день действует целиком: ошибка здесь стоит денег тому,
			// кто заплатил.
			name:    "последний день",
			state:   State{CuratorID: 7, Status: StatusActive, ExpiresAt: ptr(today)},
			allowed: true,
		},
		{
			name:    "день после последнего",
			state:   State{CuratorID: 7, Status: StatusActive, ExpiresAt: ptr(day(2026, time.October, 14))},
			allowed: false,
		},
		{
			// Задача уже сняла право: статус важнее даты, которая ещё не
			// наступила, — снятие могло быть и ручным, за возврат денег.
			name:    "снято вручную до срока",
			state:   State{CuratorID: 7, Status: StatusInactive, ExpiresAt: ptr(day(2026, time.November, 1))},
			allowed: false,
		},
		{
			name:    "связь в ожидании правом не является",
			state:   State{CuratorID: 7, Status: "pending"},
			allowed: false,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assert.Equal(t, c.allowed, c.state.AllowedOn(today))
		})
	}
}

// Отсутствие куратора и истёкшее право — разные состояния: первому нужно
// предложение купить, второму — предложение продлить и доступ к переписке.
func TestExpiredDiffersFromNeverAssigned(t *testing.T) {
	never := State{}
	assert.False(t, never.Assigned())
	assert.False(t, never.Expired(), "куратора никогда не было — это не истёкшее право")

	expired := State{CuratorID: 7, Status: StatusInactive, ExpiresAt: ptr(day(2020, time.January, 1))}
	assert.True(t, expired.Assigned())
	assert.True(t, expired.Expired())
}

func TestPerpetual(t *testing.T) {
	assert.True(t, State{CuratorID: 7, Status: StatusActive}.Perpetual(),
		"связь без предельной даты бессрочна: так живут служебные учётные записи")
	assert.False(t, State{CuratorID: 7, Status: StatusActive, ExpiresAt: ptr(day(2026, time.December, 1))}.Perpetual())
	assert.False(t, State{}.Perpetual(), "без куратора бессрочного права не бывает")
}

// Предельная дата приходит из базы меткой времени в UTC, а сравнивается с
// московской датой. Время суток обязано отбрасываться, иначе «последний день»
// кончается в полночь UTC — то есть на три часа раньше обещанного.
func TestDateOfDropsTimeOfDay(t *testing.T) {
	late := time.Date(2026, time.October, 15, 23, 59, 59, 0, time.UTC)
	state := State{CuratorID: 7, Status: StatusActive, ExpiresAt: &late}

	assert.True(t, state.AllowedOn(time.Date(2026, time.October, 15, 0, 0, 0, 0, time.UTC)))
	assert.False(t, state.AllowedOn(time.Date(2026, time.October, 16, 0, 0, 0, 0, time.UTC)))
}

func TestTodayIsAMoscowDate(t *testing.T) {
	loc, err := time.LoadLocation(Moscow)
	if err != nil {
		t.Skip("tzdata недоступна в этой среде")
	}
	assert.Equal(t, DateOf(time.Now().In(loc)), Today())
}
