package support

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Тред обращения отдаёт заявку теми же snake_case-ключами, что весь API:
// веб и приложение читают id, email, last_step.
func TestLeadSummaryUsesSnakeCaseKeys(t *testing.T) {
	raw, err := json.Marshal(LeadSummary{ID: "l1", Email: "nina@mail.ru", Name: "Нина", LastStep: "contact", Summary: "цель: loss"})
	require.NoError(t, err)
	var got map[string]any
	require.NoError(t, json.Unmarshal(raw, &got))
	assert.Equal(t, map[string]any{"id": "l1", "email": "nina@mail.ru", "name": "Нина", "last_step": "contact", "summary": "цель: loss"}, got)
}
