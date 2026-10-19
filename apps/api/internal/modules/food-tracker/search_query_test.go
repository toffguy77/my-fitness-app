package foodtracker

import (
	"errors"
	"testing"
)

// Поиск — со второго символа (`ios-food-logging`, «Два символа»): «гр» не
// отклоняется, один символ — 400 с ErrSearchQueryTooShort.
func TestSearchQueryStartsAtTwoRunes(t *testing.T) {
	cases := []struct {
		query string
		ok    bool
	}{
		{"гр", true},
		{"ab", true},
		{"г", false},
		{"гречка", true},
	}
	for _, tc := range cases {
		req := SearchFoodsRequest{Query: tc.query}
		err := req.Validate()
		if tc.ok && err != nil {
			t.Errorf("%q: ожидался поиск, получено %v", tc.query, err)
		}
		if !tc.ok && !errors.Is(err, ErrSearchQueryTooShort) {
			t.Errorf("%q: ожидалась ErrSearchQueryTooShort, получено %v", tc.query, err)
		}
	}
}
