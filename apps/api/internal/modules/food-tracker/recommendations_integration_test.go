//go:build integration

package foodtracker_test

import (
	"context"
	"testing"

	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Справочник нутриентов пуст и на dev, и на проде: таблицу создала миграция 009,
// а INSERT в неё нет нигде. Наполнение вынесено в отдельное изменение
// (nutrient-catalogue), поэтому тест заводит свои строки — иначе проверять было
// бы нечего, и зелёный прогон означал бы только то, что справочник пуст.
func recommendationFixtures(t *testing.T) (*foodtracker.Service, *database.DB, int64, map[string]string) {
	t.Helper()

	db := testsupport.SchemaWithMigrations(t, "recommendations")
	ctx := context.Background()

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('rec@example.test', 'x', 'Едок', 'client')
		 RETURNING id`).Scan(&userID))

	nutrients := map[string]string{}
	for _, n := range []struct {
		name     string
		category string
		weekly   bool
	}{
		{"Витамин C", "vitamins", false},
		{"Витамин D", "vitamins", false},
		{"Железо", "minerals", false},
		{"Омега-3", "lipids", true},
	} {
		var id string
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO nutrient_recommendations (name, category, daily_target, unit, is_weekly)
			 VALUES ($1, $2, 100, 'мг', $3) RETURNING id::text`,
			n.name, n.category, n.weekly).Scan(&id))
		nutrients[n.name] = id
	}

	return foodtracker.NewService(db, logger.New()), db, userID, nutrients
}

// Поиск нутриента в ответе по имени — по всем категориям и недельным.
func find(resp *foodtracker.GetRecommendationsResponse, name string) *foodtracker.NutrientRecommendationWithProgress {
	for _, list := range resp.Daily {
		for i := range list {
			if list[i].Name == name {
				return &list[i]
			}
		}
	}
	for i := range resp.Weekly {
		if resp.Weekly[i].Name == name {
			return &resp.Weekly[i]
		}
	}
	return nil
}

// По умолчанию отслеживается всё: человек, который ни разу не заходил в
// настройки, должен видеть справочник целиком, а не пустую вкладку.
func TestRecommendationsTrackEverythingByDefault(t *testing.T) {
	service, _, userID, nutrients := recommendationFixtures(t)

	resp, err := service.GetRecommendations(context.Background(), userID)
	require.NoError(t, err)

	for name := range nutrients {
		rec := find(resp, name)
		require.NotNil(t, rec, "нутриент %q не пришёл в ответе", name)
		assert.True(t, rec.IsTracked, "нутриент %q должен отслеживаться по умолчанию", name)
	}
}

// Выключенный нутриент обязан приходить в ответе с признаком, а не исчезать:
// иначе экран настроек не может показать текущее состояние, а PUT
// /recommendations/preferences ждёт от него полный список отслеживаемых — то
// есть первое же сохранение стёрло бы выбор, которого экран не видел.
func TestRecommendationsKeepUntrackedNutrientsWithFlag(t *testing.T) {
	service, _, userID, nutrients := recommendationFixtures(t)
	ctx := context.Background()

	// Отслеживаем всё, кроме витамина D.
	var tracked []string
	for name, id := range nutrients {
		if name != "Витамин D" {
			tracked = append(tracked, id)
		}
	}
	require.NoError(t, service.UpdateNutrientPreferences(ctx, userID, tracked))

	resp, err := service.GetRecommendations(ctx, userID)
	require.NoError(t, err)

	off := find(resp, "Витамин D")
	require.NotNil(t, off, "выключенный нутриент пропал из ответа — экран настроек не сможет показать его состояние")
	assert.False(t, off.IsTracked)

	on := find(resp, "Витамин C")
	require.NotNil(t, on)
	assert.True(t, on.IsTracked)
}

// Тот же случай для недельных: у них фильтр стоял прямо в SQL.
func TestRecommendationsKeepUntrackedWeeklyNutrients(t *testing.T) {
	service, _, userID, nutrients := recommendationFixtures(t)
	ctx := context.Background()

	var tracked []string
	for name, id := range nutrients {
		if name != "Омега-3" {
			tracked = append(tracked, id)
		}
	}
	require.NoError(t, service.UpdateNutrientPreferences(ctx, userID, tracked))

	resp, err := service.GetRecommendations(ctx, userID)
	require.NoError(t, err)

	weekly := find(resp, "Омега-3")
	require.NotNil(t, weekly, "выключенный недельный нутриент пропал из ответа")
	assert.False(t, weekly.IsTracked)
}

// Первая снятая галочка не сохранялась: сброс трогал только существующие
// строки, а у человека, ни разу не менявшего настройки, их нет — вставлялось
// только выбранное, и невыбранное снова читалось как отслеживаемое из-за
// COALESCE(unp.is_tracked, true).
func TestFirstUncheckPersists(t *testing.T) {
	service, db, userID, nutrients := recommendationFixtures(t)
	ctx := context.Background()

	var rows int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM user_nutrient_preferences WHERE user_id = $1`, userID).Scan(&rows))
	require.Zero(t, rows, "предпосылка теста: настройки ещё не менялись")

	// Оставляем только витамин C.
	require.NoError(t, service.UpdateNutrientPreferences(ctx, userID, []string{nutrients["Витамин C"]}))

	resp, err := service.GetRecommendations(ctx, userID)
	require.NoError(t, err)

	kept := find(resp, "Витамин C")
	require.NotNil(t, kept)
	assert.True(t, kept.IsTracked)

	for _, name := range []string{"Витамин D", "Железо", "Омега-3"} {
		rec := find(resp, name)
		require.NotNil(t, rec, "нутриент %q пропал из ответа", name)
		assert.False(t, rec.IsTracked, "снятая галочка по %q не сохранилась", name)
	}
}

// Повторное сохранение не должно зависеть от того, есть ли уже строки.
func TestPreferencesCanBeTurnedBackOn(t *testing.T) {
	service, _, userID, nutrients := recommendationFixtures(t)
	ctx := context.Background()

	require.NoError(t, service.UpdateNutrientPreferences(ctx, userID, []string{nutrients["Витамин C"]}))
	require.NoError(t, service.UpdateNutrientPreferences(ctx, userID,
		[]string{nutrients["Витамин C"], nutrients["Железо"]}))

	resp, err := service.GetRecommendations(ctx, userID)
	require.NoError(t, err)

	iron := find(resp, "Железо")
	require.NotNil(t, iron)
	assert.True(t, iron.IsTracked, "нутриент, включённый обратно, должен отслеживаться")

	d := find(resp, "Витамин D")
	require.NotNil(t, d)
	assert.False(t, d.IsTracked)
}
