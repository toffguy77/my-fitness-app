package recipes

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// Подписи — из записанного ответа ВкусВилла (testdata).
func TestParseQuantity(t *testing.T) {
	grams := func(v float64) Quantity { return Quantity{Grams: &v} }
	pieces := func(v float64) Quantity { return Quantity{Pieces: &v} }

	tests := []struct {
		label string
		want  Quantity
	}{
		// Сценарий «Граммовка из подписи».
		{"50 г", grams(50)},
		{"200 г", grams(200)},
		{"0,5 кг", grams(500)},
		{"50 мл", grams(50)},
		{"1 л", grams(1000)},
		{"0,5 л", grams(500)},
		{"4 шт.", pieces(4)},
		{"0,5 шт.", pieces(0.5)},
		{"1/2 шт.", pieces(0.5)},
		{"по вкусу", Quantity{ToTaste: true}},
		{"По  вкусу", Quantity{ToTaste: true}},
		{"2 ст. л.", Quantity{}},
		{"1/3 ч. л.", Quantity{}},
		{"1 уп.", Quantity{}},
		{"1 щеп.", Quantity{}},
		{"", Quantity{}},
		{"0 г", Quantity{}},
	}
	for _, tt := range tests {
		t.Run(tt.label, func(t *testing.T) {
			assert.Equal(t, tt.want, ParseQuantity(tt.label))
		})
	}
}
