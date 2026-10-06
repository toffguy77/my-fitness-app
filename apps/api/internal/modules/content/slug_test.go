package content

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

// slugCases are shared with the migration test: the SQL that fills slugs for
// existing articles must agree with this function on every one of them.
var slugCases = []struct {
	title string
	want  string
}{
	{"Что такое КБЖУ и зачем его считать?", "chto-takoe-kbzhu-i-zachem-ego-schitat"},
	{"Добро пожаловать в BURCEV!", "dobro-pozhalovat-v-burcev"},
	{"7 ошибок новичков в трекинге питания", "7-oshibok-novichkov-v-trekinge-pitaniya"},
	{"Настрой профиль правильно -- от этого зависит точность расчётов", "nastroy-profil-pravilno-ot-etogo-zavisit-tochnost-raschetov"},
	{"Ёжик, щука и подъезд", "ezhik-shchuka-i-podezd"},
	{"Цех: хлеб, чай, юла, яма", "tsekh-khleb-chay-yula-yama"},
	{"  --Пробелы   и   дефисы--  ", "probely-i-defisy"},
	{"Calories & Protein: 101", "calories-protein-101"},
	{"!!!", ""},
}

func TestSlugify(t *testing.T) {
	for _, tc := range slugCases {
		t.Run(tc.title, func(t *testing.T) {
			assert.Equal(t, tc.want, Slugify(tc.title))
		})
	}
}

func TestSlugify_TrimsToWordBoundary(t *testing.T) {
	title := strings.Repeat("питание ", 20) // 8 Latin letters per word after transliteration
	got := Slugify(title)

	assert.LessOrEqual(t, len(got), maxSlugLength)
	assert.False(t, strings.HasSuffix(got, "-"))
	for _, word := range strings.Split(got, "-") {
		assert.Equal(t, "pitanie", word, "a word cut in half")
	}
}

func TestSlugify_LongSingleWordIsCut(t *testing.T) {
	got := Slugify(strings.Repeat("а", 200))
	assert.Len(t, got, maxSlugLength)
}

func TestValidSlug(t *testing.T) {
	valid := []string{"raschet-kbzhu", "a", "7-oshibok", "abc-123-def"}
	invalid := []string{"", "Raschet", "расчёт", "two  words", "-lead", "trail-", "dou--ble", "under_score", strings.Repeat("a", maxSlugLength+1)}

	for _, s := range valid {
		assert.True(t, ValidSlug(s), s)
	}
	for _, s := range invalid {
		assert.False(t, ValidSlug(s), s)
	}
}
