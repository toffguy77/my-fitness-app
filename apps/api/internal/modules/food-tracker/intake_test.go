package foodtracker

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Правил в подсчёте три — годность значения, пересчёт на съеденное и покрытие, — и
// каждое проверяется отдельно. В SQL они превратились бы в одно выражение,
// которое нельзя проверить по частям.

func ptr(value float64) *float64 { return &value }

func entryWithJSON(grams float64, values map[string]float64) dayEntry {
	return dayEntry{PortionAmount: grams, Additional: values}
}

func TestIntakeSumsOverEntries(t *testing.T) {
	entries := []dayEntry{
		// 0,00333 г железа на 100 г, съедено 200 г → 0,00666 г.
		entryWithJSON(200, map[string]float64{"iron": 0.00333}),
		// 0,001 г на 100 г, съедено 50 г → 0,0005 г.
		entryWithJSON(50, map[string]float64{"iron": 0.001}),
	}

	got := intakeFromEntries(entries, "json:iron")

	require.NotNil(t, got)
	assert.InDelta(t, 0.00716, got.Value, 1e-9)
	assert.Equal(t, 2, got.CountedEntries)
	assert.Equal(t, 2, got.TotalEntries)
}

// Главный случай, ради которого всё и делается: содержание известно у части
// записей. Сумма считается по ним, а покрытие говорит, по какой части дня.
func TestIntakeCountsWhatItKnows(t *testing.T) {
	entries := []dayEntry{
		entryWithJSON(100, map[string]float64{"iron": 0.002}),
		entryWithJSON(100, nil),
		entryWithJSON(100, map[string]float64{"calcium": 0.1}),
	}

	got := intakeFromEntries(entries, "json:iron")

	require.NotNil(t, got)
	assert.InDelta(t, 0.002, got.Value, 1e-9)
	assert.Equal(t, 1, got.CountedEntries, "посчитана одна запись из трёх")
	assert.Equal(t, 3, got.TotalEntries)
}

// Ноль здесь прочитали бы как «вы не добрали».
func TestIntakeIsNilWhenNothingKnown(t *testing.T) {
	entries := []dayEntry{
		entryWithJSON(100, nil),
		entryWithJSON(100, map[string]float64{"calcium": 0.1}),
	}

	assert.Nil(t, intakeFromEntries(entries, "json:iron"))
}

func TestIntakeIsNilWithoutEntries(t *testing.T) {
	assert.Nil(t, intakeFromEntries(nil, "json:iron"))
}

func TestIntakeIsNilForKBZHUSources(t *testing.T) {
	entries := []dayEntry{entryWithJSON(100, map[string]float64{"iron": 0.002})}

	assert.Nil(t, intakeFromEntries(entries, "kbzhu:protein"),
		"КБЖУ считается из дневных итогов, а не отсюда")
}

// Часть не тяжелее целого: в справочнике продуктов есть 1 200 000 г витамина C на
// 100 г. Такая запись считается записью без известного содержания.
func TestImpossibleContentIsNotUsed(t *testing.T) {
	entries := []dayEntry{
		entryWithJSON(100, map[string]float64{"vitamin_c": 1200000}),
		entryWithJSON(100, map[string]float64{"vitamin_c": 0.05}),
	}

	got := intakeFromEntries(entries, "json:vitamin_c")

	require.NotNil(t, got)
	assert.InDelta(t, 0.05, got.Value, 1e-9)
	assert.Equal(t, 1, got.CountedEntries, "невозможное значение не посчитано")
	assert.Equal(t, 2, got.TotalEntries)
}

func TestContentOnTheEdgeOfPossibleIsUsed(t *testing.T) {
	entries := []dayEntry{entryWithJSON(100, map[string]float64{"vitamin_c": 100})}

	got := intakeFromEntries(entries, "json:vitamin_c")

	require.NotNil(t, got)
	assert.InDelta(t, 100, got.Value, 1e-9)
}

func TestNegativeContentIsNotUsed(t *testing.T) {
	entries := []dayEntry{entryWithJSON(100, map[string]float64{"iron": -1})}

	assert.Nil(t, intakeFromEntries(entries, "json:iron"))
}

func TestIntakeFromOwnColumns(t *testing.T) {
	entries := []dayEntry{
		{PortionAmount: 200, FiberPer100: ptr(10), SodiumPer100: ptr(0.5)},
		{PortionAmount: 100, FiberPer100: nil, SodiumPer100: ptr(0.2)},
	}

	fiber := intakeFromEntries(entries, "column:fiber_per_100")
	require.NotNil(t, fiber)
	assert.InDelta(t, 20, fiber.Value, 1e-9)
	assert.Equal(t, 1, fiber.CountedEntries)

	sodium := intakeFromEntries(entries, "column:sodium_per_100")
	require.NotNil(t, sodium)
	assert.InDelta(t, 1.2, sodium.Value, 1e-9)
	assert.Equal(t, 2, sodium.CountedEntries)
}

func TestUnknownMechanismIsIgnored(t *testing.T) {
	entries := []dayEntry{entryWithJSON(100, map[string]float64{"iron": 0.002})}

	assert.Nil(t, intakeFromEntries(entries, "json"), "без ключа брать нечего")
	assert.Nil(t, intakeFromEntries(entries, "магия:iron"))
	assert.Nil(t, intakeFromEntries(entries, ""))
}

// Справочник продуктов хранит граммы, нормы заданы в миллиграммах и микрограммах.
func TestUnitFactors(t *testing.T) {
	for unit, want := range map[string]float64{"g": 1, "mg": 1_000, "mcg": 1_000_000} {
		factor, ok := intakeUnitFactor(unit)
		require.True(t, ok, unit)
		assert.InDelta(t, want, factor, 1e-9, unit)
	}

	_, ok := intakeUnitFactor("IU")
	assert.False(t, ok, "МЕ переводить нечем — потребление не показывается вовсе")
}

// Значения в справочнике бывают строками: краудсорс. Битая строка не должна
// лишать человека всего дня.
func TestAdditionalNutrientsParsing(t *testing.T) {
	values := parseAdditional([]byte(`{"iron": 0.003, "calcium": "0.04", "zinc": "не число", "vitamin_c": null}`))

	assert.InDelta(t, 0.003, values["iron"], 1e-9)
	assert.InDelta(t, 0.04, values["calcium"], 1e-9)
	assert.NotContains(t, values, "zinc")
	assert.NotContains(t, values, "vitamin_c")
}

func TestBrokenJSONIsNotFatal(t *testing.T) {
	assert.Nil(t, parseAdditional([]byte(`{это не json`)))
}

// Ноль в колонке и ноль в jsonb — разные вещи, и это наблюдение, а не вкус: у
// гречки из таблицы products `fiber` равна нулю при десяти граммах клетчатки на
// 100 г, а ключ jsonb появляется только когда импортёру было что записать.
func TestZeroInColumnIsUnknown(t *testing.T) {
	entries := []dayEntry{
		{PortionAmount: 100, FiberPer100: ptr(0)},
		{PortionAmount: 100, FiberPer100: ptr(0)},
	}

	assert.Nil(t, intakeFromEntries(entries, "column:fiber_per_100"),
		"ноль в колонке нельзя показывать как измеренный")
}

func TestZeroInColumnDoesNotDiluteWhatIsKnown(t *testing.T) {
	entries := []dayEntry{
		{PortionAmount: 100, FiberPer100: ptr(10)},
		{PortionAmount: 100, FiberPer100: ptr(0)},
	}

	got := intakeFromEntries(entries, "column:fiber_per_100")

	require.NotNil(t, got)
	assert.InDelta(t, 10, got.Value, 1e-9)
	assert.Equal(t, 1, got.CountedEntries, "запись с нулём в колонке считается неизвестной")
	assert.Equal(t, 2, got.TotalEntries)
}

func TestZeroInJSONIsMeasured(t *testing.T) {
	entries := []dayEntry{
		entryWithJSON(100, map[string]float64{"sodium": 0}),
		entryWithJSON(100, map[string]float64{"sodium": 0.5}),
	}

	got := intakeFromEntries(entries, "json:sodium")

	require.NotNil(t, got)
	assert.InDelta(t, 0.5, got.Value, 1e-9)
	assert.Equal(t, 2, got.CountedEntries, "ключ в jsonb есть — значит значение измерено")
}
