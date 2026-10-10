//go:build integration

package router

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/burcev/api/internal/config"
	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/modules/recipes"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Сценарии «Скрытие для чужого клиента» и «Куратор чужого клиента» через
// настоящий движок и настоящую базу: группа /curator/clients/:id закрывает
// маршруты recipes, хотя обработчики живут в другом модуле. Свой клиент —
// проходит, чужой — 403, и в базе ничего не появляется.
func TestCuratorRecipeRoutesRespectTheRelationship(t *testing.T) {
	f := newAccessFixture(t, "recipes_relationship")
	ctx := context.Background()
	log := logger.New()
	f.engine = New(Deps{
		Cfg:             &config.Config{Env: "test", JWTSecret: "test-secret"},
		Log:             log,
		DB:              f.db,
		AuthRateLimiter: middleware.NewAuthRateLimiter(),
		Recipes: recipes.NewHandler(&config.Config{}, log,
			recipes.NewService(f.db, log, foodtracker.NewService(f.db, log), nil, nil)),
	})
	f.link(t, "active", nil)

	var stranger int64
	require.NoError(t, f.db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('stranger@example.test', 'x', 'Чужой', 'client')
		 RETURNING id`).Scan(&stranger))
	var recipeID string
	require.NoError(t, f.db.QueryRowContext(ctx,
		`INSERT INTO recipes DEFAULT VALUES RETURNING id::text`).Scan(&recipeID))
	// Скрыть можно только рецепт, который клиент вообще мог бы увидеть.
	_, err := f.db.ExecContext(ctx,
		`INSERT INTO recipe_versions (recipe_id, version, state, name, meal_types)
		 VALUES ($1, 1, 'approved', 'Рецепт', '{lunch}')`, recipeID)
	require.NoError(t, err)

	hide := func(client int64) int {
		return f.do(t, http.MethodPut,
			fmt.Sprintf("/api/v1/curator/clients/%d/hidden-recipes/%s", client, recipeID),
			"", f.curatorID, "coordinator").Code
	}
	restrict := func(client int64) int {
		return f.do(t, http.MethodPut,
			fmt.Sprintf("/api/v1/curator/clients/%d/food-restrictions", client),
			`{"allergens":["nuts"]}`, f.curatorID, "coordinator").Code
	}

	assert.Equal(t, http.StatusForbidden, hide(stranger))
	assert.Equal(t, http.StatusForbidden, restrict(stranger))
	assert.Equal(t, http.StatusForbidden, f.do(t, http.MethodGet,
		fmt.Sprintf("/api/v1/curator/clients/%d/food-restrictions", stranger), "", f.curatorID, "coordinator").Code)

	var n int
	require.NoError(t, f.db.QueryRowContext(ctx,
		`SELECT (SELECT COUNT(*) FROM client_hidden_recipes) + (SELECT COUNT(*) FROM user_food_restrictions)`).Scan(&n))
	assert.Zero(t, n, "a refused request must not have written anything")

	assert.Equal(t, http.StatusNoContent, hide(f.clientID))
	assert.Equal(t, http.StatusOK, restrict(f.clientID))
	require.NoError(t, f.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM client_hidden_recipes WHERE client_id = $1 AND hidden_by = $2`,
		f.clientID, f.curatorID).Scan(&n))
	assert.Equal(t, 1, n)
}
