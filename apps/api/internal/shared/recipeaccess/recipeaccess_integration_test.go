//go:build integration

package recipeaccess_test

import (
	"context"
	"sort"
	"testing"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/recipeaccess"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func user(t *testing.T, db *database.DB, email, role string) int64 {
	t.Helper()
	var id int64
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO users (email, password, name, role) VALUES ($1, 'x', $1, $2) RETURNING id`,
		email, role).Scan(&id))
	return id
}

func food(t *testing.T, db *database.DB, name string) string {
	t.Helper()
	var id string
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO food_items (name, category, calories_per_100, protein_per_100, fat_per_100, carbs_per_100)
		 VALUES ($1, 'test', 100, 10, 5, 10) RETURNING id::text`, name).Scan(&id))
	return id
}

// recipe inserts a recipe with one version in the given state.
func recipe(t *testing.T, db *database.DB, name, status, state string, allergens []string, foodID string) string {
	t.Helper()
	ctx := context.Background()
	var recipeID, versionID string
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO recipes (status) VALUES ($1) RETURNING id::text`, status).Scan(&recipeID))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO recipe_versions (recipe_id, version, state, name, meal_types, allergens)
		 VALUES ($1, 1, $2, $3, '{lunch}', COALESCE($4, '{}'::TEXT[])) RETURNING id::text`,
		recipeID, state, name, allergens).Scan(&versionID))
	_, err := db.ExecContext(ctx,
		`INSERT INTO recipe_ingredients (version_id, position, food_id, grams) VALUES ($1, 1, $2, 100)`,
		versionID, foodID)
	require.NoError(t, err)
	return recipeID
}

func visible(t *testing.T, db *database.DB, userID int64) []string {
	t.Helper()
	rows, err := db.QueryContext(context.Background(),
		`SELECT v.name FROM `+recipeaccess.Join("r", "v")+
			` WHERE `+recipeaccess.Available("r", "v", "$1"), userID)
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()
	var names []string
	for rows.Next() {
		var n string
		require.NoError(t, rows.Scan(&n))
		names = append(names, n)
	}
	require.NoError(t, rows.Err())
	sort.Strings(names)
	return names
}

// Сценарий «Все ограничения сразу» на настоящей базе: у клиента аллерген,
// исключённый продукт, скрытый куратором и отклонённый рецепт — в выдаче нет
// ни одного рецепта, попадающего под любое из ограничений. Второй клиент без
// ограничений видит всё опубликованное и одобренное: правило действует на
// одного человека, а не на каталог.
func TestAllRestrictionsAtOnce(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "recipeaccess")
	ctx := context.Background()

	clientA := user(t, db, "a@example.test", "client")
	clientB := user(t, db, "b@example.test", "client")
	curator := user(t, db, "c@example.test", "coordinator")

	plain := food(t, db, "Рис")
	excluded := food(t, db, "Грибы")

	recipe(t, db, "1 ok", "published", "approved", []string{"eggs"}, plain)
	recipe(t, db, "2 nuts", "published", "approved", []string{"nuts", "eggs"}, plain)
	recipe(t, db, "3 excluded food", "published", "approved", nil, excluded)
	hidden := recipe(t, db, "4 hidden", "published", "approved", nil, plain)
	rejected := recipe(t, db, "5 rejected", "published", "approved", nil, plain)
	recipe(t, db, "6 unpublished", "unpublished", "approved", nil, plain)
	recipe(t, db, "7 review only", "published", "review", nil, plain)
	recipe(t, db, "8 superseded only", "published", "superseded", nil, plain)

	_, err := db.ExecContext(ctx,
		`INSERT INTO user_food_restrictions (user_id, allergens) VALUES ($1, '{nuts}')`, clientA)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx,
		`INSERT INTO user_excluded_foods (user_id, food_id) VALUES ($1, $2)`, clientA, excluded)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx,
		`INSERT INTO client_hidden_recipes (client_id, recipe_id, hidden_by) VALUES ($1, $2, $3)`,
		clientA, hidden, curator)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx,
		`INSERT INTO user_rejected_recipes (user_id, recipe_id) VALUES ($1, $2)`, clientA, rejected)
	require.NoError(t, err)

	assert.Equal(t, []string{"1 ok"}, visible(t, db, clientA))
	assert.Equal(t,
		[]string{"1 ok", "2 nuts", "3 excluded food", "4 hidden", "5 rejected"},
		visible(t, db, clientB))
}
