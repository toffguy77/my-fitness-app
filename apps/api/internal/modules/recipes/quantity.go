package recipes

import (
	"regexp"
	"strconv"
	"strings"
)

// Quantity is what a source's human quantity label tells us.
type Quantity struct {
	// Grams is set when the label is a weight or a volume (г, кг, мл, л).
	// Millilitres count as grams: close enough for the liquids recipes use,
	// and the person confirming the ingredient sees and can correct it.
	Grams *float64
	// Pieces is set for «N шт.»; grams come from the product's piece weight.
	Pieces *float64
	// ToTaste: «по вкусу».
	ToTaste bool
}

var quantityPattern = regexp.MustCompile(
	`^(\d+(?:[.,]\d+)?|\d+/\d+)\s*(г|гр|кг|мл|л|шт)\.?$`)

// ParseQuantity reads labels like «50 г», «0,5 кг», «1 л», «3 шт.», «по вкусу».
// Spoons, packs and pinches give nothing: their weight depends on what is in
// them, and a guess would put a number into КБЖУ that nobody checked.
func ParseQuantity(label string) Quantity {
	s := strings.ToLower(strings.Join(strings.Fields(label), " "))
	if s == "" {
		return Quantity{}
	}
	if s == "по вкусу" {
		return Quantity{ToTaste: true}
	}

	m := quantityPattern.FindStringSubmatch(s)
	if m == nil {
		return Quantity{}
	}
	n, ok := parseNumber(m[1])
	if !ok || n <= 0 {
		return Quantity{}
	}

	switch m[2] {
	case "г", "гр", "мл":
		return Quantity{Grams: &n}
	case "кг", "л":
		g := n * 1000
		return Quantity{Grams: &g}
	case "шт":
		return Quantity{Pieces: &n}
	}
	return Quantity{}
}

func parseNumber(s string) (float64, bool) {
	if num, den, ok := strings.Cut(s, "/"); ok {
		a, err1 := strconv.ParseFloat(num, 64)
		b, err2 := strconv.ParseFloat(den, 64)
		if err1 != nil || err2 != nil || b == 0 {
			return 0, false
		}
		return a / b, true
	}
	v, err := strconv.ParseFloat(strings.ReplaceAll(s, ",", "."), 64)
	return v, err == nil
}
