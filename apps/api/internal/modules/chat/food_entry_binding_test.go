package chat

import (
	"testing"

	"github.com/gin-gonic/gin/binding"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Куриная грудка — это 0 г углеводов. С `required` на нутриентах такая
// запись по фото отвечала 400: для числа `required` значит «не ноль».
func TestCreateFoodEntryRequest_AcceptsZeroNutrients(t *testing.T) {
	var req CreateFoodEntryRequest
	body := []byte(`{"food_name":"Куриная грудка","meal_type":"lunch","weight":150,"calories":229,"protein":46,"fat":5,"carbs":0}`)
	require.NoError(t, binding.JSON.BindBody(body, &req))
	assert.Equal(t, 0.0, req.Carbs)
}

func TestCreateFoodEntryRequest_StillRejectsBadInput(t *testing.T) {
	cases := map[string]string{
		"no name":          `{"meal_type":"lunch","weight":150,"calories":1,"protein":1,"fat":1,"carbs":1}`,
		"zero weight":      `{"food_name":"x","meal_type":"lunch","weight":0,"calories":1,"protein":1,"fat":1,"carbs":1}`,
		"negative protein": `{"food_name":"x","meal_type":"lunch","weight":10,"calories":1,"protein":-1,"fat":1,"carbs":1}`,
		"unknown meal":     `{"food_name":"x","meal_type":"brunch","weight":10,"calories":1,"protein":1,"fat":1,"carbs":1}`,
	}
	for name, body := range cases {
		var req CreateFoodEntryRequest
		assert.Error(t, binding.JSON.BindBody([]byte(body), &req), name)
	}
}
