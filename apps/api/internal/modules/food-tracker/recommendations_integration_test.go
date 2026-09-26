//go:build integration

package foodtracker_test

import (
	"context"
	"testing"
	"time"

	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Справочник наполняет миграция 082 из МР 2.3.1.0253-21, поэтому тесты работают
// с настоящими строками, а не со своими выдумками: так проверяется и механика, и
// то, что уехало в базу. Свои фикстуры показали бы только, что код умеет читать
// то, что сам же и записал.
func recommendationFixtures(t *testing.T) (*foodtracker.Service, *database.DB, int64) {
	t.Helper()

	db := testsupport.SchemaWithMigrations(t, "recommendations")
	ctx := context.Background()

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('rec@example.test', 'x', 'Едок', 'client')
		 RETURNING id`).Scan(&userID))

	return foodtracker.NewService(db, logger.New()), db, userID
}

// Профиль: пол и дата рождения. Оба необязательны, и у большинства живых
// аккаунтов их нет — на проде заполнены у 2 из 9.
func setProfile(t *testing.T, db *database.DB, userID int64, sex string, age int) {
	t.Helper()

	var birth interface{}
	if age > 0 {
		birth = time.Now().AddDate(-age, 0, -1).Format("2006-01-02")
	}
	var sexValue interface{}
	if sex != "" {
		sexValue = sex
	}

	_, err := db.ExecContext(context.Background(),
		`INSERT INTO user_settings (user_id, biological_sex, birth_date)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id) DO UPDATE SET biological_sex = $2, birth_date = $3`,
		userID, sexValue, birth)
	require.NoError(t, err)
}

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

// ============================================================================
// Справочник
// ============================================================================

// Ровно это состояние функция и прожила: таблица создана миграцией 009,
// обработчики написаны, вкладка нарисована, строк нет — и никто не заметил.
func TestCatalogueIsFilled(t *testing.T) {
	_, db, _ := recommendationFixtures(t)

	var nutrients, norms int
	require.NoError(t, db.QueryRowContext(context.Background(),
		`SELECT count(*) FROM nutrient_recommendations`).Scan(&nutrients))
	require.NoError(t, db.QueryRowContext(context.Background(),
		`SELECT count(*) FROM nutrient_norms`).Scan(&norms))

	assert.Positive(t, nutrients, "справочник нутриентов пуст — функция рекомендаций без него не работает")
	assert.Positive(t, norms, "нормы не заведены — показывать будет нечего")
}

func TestEveryNutrientHasANorm(t *testing.T) {
	_, db, _ := recommendationFixtures(t)

	rows, err := db.QueryContext(context.Background(), `
		SELECT nr.name
		FROM nutrient_recommendations nr
		LEFT JOIN nutrient_norms nn ON nn.nutrient_id = nr.id
		WHERE nn.id IS NULL
	`)
	require.NoError(t, err)
	defer rows.Close()

	var orphans []string
	for rows.Next() {
		var name string
		require.NoError(t, rows.Scan(&name))
		orphans = append(orphans, name)
	}
	assert.Empty(t, orphans, "у этих нутриентов нет ни одной нормы")
}

func TestEveryNormNamesItsSource(t *testing.T) {
	_, db, _ := recommendationFixtures(t)

	var sourceless int
	require.NoError(t, db.QueryRowContext(context.Background(),
		`SELECT count(*) FROM nutrient_norms WHERE source = '' OR source_version = ''`).Scan(&sourceless))

	assert.Zero(t, sourceless, "норма без источника — цифра, происхождение которой не проверить")
}

// ============================================================================
// Норма под профиль
// ============================================================================

// Железа женщине нужно 18 мг, мужчине 10 — разница в 1,8 раза. Это та самая
// причина, по которой числа уехали из справочника в таблицу норм.
func TestIronNormFollowsSex(t *testing.T) {
	service, db, userID := recommendationFixtures(t)
	ctx := context.Background()

	setProfile(t, db, userID, "female", 30)
	resp, err := service.GetRecommendations(ctx, userID)
	require.NoError(t, err)
	iron := find(resp, "Железо")
	require.NotNil(t, iron)
	require.NotNil(t, iron.DailyTarget, "норма железа для женщины должна быть выбрана")
	assert.InDelta(t, 18.0, *iron.DailyTarget, 1e-9)
	assert.False(t, iron.NormNeedsProfile)

	setProfile(t, db, userID, "male", 30)
	resp, err = service.GetRecommendations(ctx, userID)
	require.NoError(t, err)
	iron = find(resp, "Железо")
	require.NotNil(t, iron)
	require.NotNil(t, iron.DailyTarget)
	assert.InDelta(t, 10.0, *iron.DailyTarget, 1e-9)
}

func TestVitaminDNormFollowsAge(t *testing.T) {
	service, db, userID := recommendationFixtures(t)
	ctx := context.Background()

	setProfile(t, db, userID, "male", 40)
	resp, err := service.GetRecommendations(ctx, userID)
	require.NoError(t, err)
	d := find(resp, "Витамин D")
	require.NotNil(t, d)
	require.NotNil(t, d.DailyTarget)
	assert.InDelta(t, 15.0, *d.DailyTarget, 1e-9)

	// С 65 лет источник называет другую величину.
	setProfile(t, db, userID, "male", 70)
	resp, err = service.GetRecommendations(ctx, userID)
	require.NoError(t, err)
	d = find(resp, "Витамин D")
	require.NotNil(t, d)
	require.NotNil(t, d.DailyTarget)
	assert.InDelta(t, 20.0, *d.DailyTarget, 1e-9)
}

func TestSameNormForEveryAdult(t *testing.T) {
	service, db, userID := recommendationFixtures(t)
	ctx := context.Background()

	for _, profile := range []struct {
		sex string
		age int
	}{
		{"male", 25}, {"female", 25}, {"female", 70},
	} {
		setProfile(t, db, userID, profile.sex, profile.age)
		resp, err := service.GetRecommendations(ctx, userID)
		require.NoError(t, err)
		c := find(resp, "Витамин C")
		require.NotNil(t, c)
		require.NotNil(t, c.DailyTarget, "%s %d: норма витамина C одна для всех взрослых", profile.sex, profile.age)
		assert.InDelta(t, 100.0, *c.DailyTarget, 1e-9)
	}
}

// Пол не указан — а норма от него зависит. Подставить 10 или 18 значило бы
// выдать догадку за норму; у женщины это занижение вдвое того, чего ей и так
// обычно не хватает.
func TestNormIsNotGuessedWithoutProfile(t *testing.T) {
	service, _, userID := recommendationFixtures(t)

	resp, err := service.GetRecommendations(context.Background(), userID)
	require.NoError(t, err)

	iron := find(resp, "Железо")
	require.NotNil(t, iron, "нутриент должен остаться в ответе: скрыть его значило бы сделать вид, что железа в справочнике нет")
	assert.Nil(t, iron.DailyTarget, "норма не должна быть выбрана наугад")
	assert.True(t, iron.NormNeedsProfile, "надо сказать, что не хватает профиля")

	// А норма, от пола не зависящая, приходит обычным числом.
	c := find(resp, "Витамин C")
	require.NotNil(t, c)
	require.NotNil(t, c.DailyTarget)
	assert.False(t, c.NormNeedsProfile)
}

func TestAgeDependentNormNeedsAge(t *testing.T) {
	service, db, userID := recommendationFixtures(t)

	// Пол есть, даты рождения нет: у витамина D две возрастные полосы.
	setProfile(t, db, userID, "male", 0)

	resp, err := service.GetRecommendations(context.Background(), userID)
	require.NoError(t, err)

	d := find(resp, "Витамин D")
	require.NotNil(t, d)
	assert.Nil(t, d.DailyTarget)
	assert.True(t, d.NormNeedsProfile)
}

func TestNormCarriesItsSource(t *testing.T) {
	service, db, userID := recommendationFixtures(t)
	setProfile(t, db, userID, "female", 30)

	resp, err := service.GetRecommendations(context.Background(), userID)
	require.NoError(t, err)

	iron := find(resp, "Железо")
	require.NotNil(t, iron)
	require.NotNil(t, iron.NormSource)
	assert.Contains(t, *iron.NormSource, "МР 2.3.1.0253-21")
	require.NotNil(t, iron.NormNote, "в примечании — где в источнике эта величина")
}

// Норма своего пола важнее общей. В наших данных такого нутриента нет — каждый
// либо общий, либо разделённый по полу, — поэтому правило проверяется на
// заведённом здесь нутриенте: иначе его бы держал только фильтр запроса, а само
// правило осталось бы непроверенным.
func TestOwnSexNormBeatsTheCommonOne(t *testing.T) {
	service, db, userID := recommendationFixtures(t)
	ctx := context.Background()

	var id string
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, source, source_version)
		 VALUES ('Проверочный нутриент', 'minerals', 'mg', false, 'тест', 'тест')
		 RETURNING id::text`).Scan(&id))
	_, err := db.ExecContext(ctx,
		`INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, source, source_version)
		 VALUES ($1, 'any', 18, 1, 'тест', 'тест'), ($1, 'female', 18, 2, 'тест', 'тест')`, id)
	require.NoError(t, err)

	setProfile(t, db, userID, "female", 30)
	resp, err := service.GetRecommendations(ctx, userID)
	require.NoError(t, err)

	item := find(resp, "Проверочный нутриент")
	require.NotNil(t, item)
	require.NotNil(t, item.DailyTarget)
	assert.InDelta(t, 2.0, *item.DailyTarget, 1e-9, "должна выбираться норма своего пола, а не общая")
}

// ============================================================================
// Потребление
// ============================================================================

// «0 из 100 мг» — это не «мы не считали», это «вы не добрали». Человек в
// продукте о здоровье примет второе за измерение.
func TestIntakeIsUnknownNotZero(t *testing.T) {
	service, db, userID := recommendationFixtures(t)
	setProfile(t, db, userID, "female", 30)

	resp, err := service.GetRecommendations(context.Background(), userID)
	require.NoError(t, err)

	for _, name := range []string{"Витамин C", "Железо", "Кальций"} {
		item := find(resp, name)
		require.NotNil(t, item, name)
		assert.Nil(t, item.CurrentIntake, "%s: потребление микронутриентов не считается, ноль выглядел бы как измерение", name)
		assert.Nil(t, item.Percentage, "%s: процент от неизвестного — не процент", name)
	}
}

// ============================================================================
// Предпочтения
// ============================================================================

func TestRecommendationsTrackEverythingByDefault(t *testing.T) {
	service, _, userID := recommendationFixtures(t)

	resp, err := service.GetRecommendations(context.Background(), userID)
	require.NoError(t, err)

	var seen int
	for _, list := range resp.Daily {
		for _, item := range list {
			seen++
			assert.True(t, item.IsTracked, "нутриент %q должен отслеживаться по умолчанию", item.Name)
		}
	}
	assert.Positive(t, seen)
}

// Выключенный нутриент обязан приходить в ответе с признаком, а не исчезать:
// иначе экран настроек не может показать текущее состояние, а
// UpdateNutrientPreferences ждёт от него полный список отслеживаемых — то есть
// первое же сохранение стёрло бы выбор, которого экран не видел.
func TestUntrackedNutrientStaysInResponse(t *testing.T) {
	service, db, userID := recommendationFixtures(t)
	ctx := context.Background()

	var vitaminC string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT id::text FROM nutrient_recommendations WHERE name = 'Витамин C'`).Scan(&vitaminC))

	require.NoError(t, service.UpdateNutrientPreferences(ctx, userID, []string{vitaminC}))

	resp, err := service.GetRecommendations(ctx, userID)
	require.NoError(t, err)

	on := find(resp, "Витамин C")
	require.NotNil(t, on)
	assert.True(t, on.IsTracked)

	off := find(resp, "Железо")
	require.NotNil(t, off, "выключенный нутриент пропал из ответа")
	assert.False(t, off.IsTracked)
}

// Первая снятая галочка не сохранялась: сброс трогал только существующие строки,
// а у человека, ни разу не менявшего настройки, их нет.
func TestFirstUncheckPersists(t *testing.T) {
	service, db, userID := recommendationFixtures(t)
	ctx := context.Background()

	var rows int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM user_nutrient_preferences WHERE user_id = $1`, userID).Scan(&rows))
	require.Zero(t, rows, "предпосылка теста: настройки ещё не менялись")

	var vitaminC string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT id::text FROM nutrient_recommendations WHERE name = 'Витамин C'`).Scan(&vitaminC))

	require.NoError(t, service.UpdateNutrientPreferences(ctx, userID, []string{vitaminC}))

	resp, err := service.GetRecommendations(ctx, userID)
	require.NoError(t, err)

	kept := find(resp, "Витамин C")
	require.NotNil(t, kept)
	assert.True(t, kept.IsTracked)

	for _, name := range []string{"Железо", "Кальций", "Витамин D"} {
		item := find(resp, name)
		require.NotNil(t, item, name)
		assert.False(t, item.IsTracked, "снятая галочка по %q не сохранилась", name)
	}
}

func TestPreferencesCanBeTurnedBackOn(t *testing.T) {
	service, db, userID := recommendationFixtures(t)
	ctx := context.Background()

	var vitaminC, iron string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT id::text FROM nutrient_recommendations WHERE name = 'Витамин C'`).Scan(&vitaminC))
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT id::text FROM nutrient_recommendations WHERE name = 'Железо'`).Scan(&iron))

	require.NoError(t, service.UpdateNutrientPreferences(ctx, userID, []string{vitaminC}))
	require.NoError(t, service.UpdateNutrientPreferences(ctx, userID, []string{vitaminC, iron}))

	resp, err := service.GetRecommendations(ctx, userID)
	require.NoError(t, err)

	back := find(resp, "Железо")
	require.NotNil(t, back)
	assert.True(t, back.IsTracked, "нутриент, включённый обратно, должен отслеживаться")
}

// ============================================================================
// Пустой справочник
// ============================================================================

// Сервис, отказывающийся работать из-за пустого справочника, уронил бы продукт
// из-за функции не на критическом пути. Поэтому непустоту сторожит тест выше, а
// здесь проверяется, что с пустым справочником всё остальное живо.
func TestEmptyCatalogueDoesNotBreakTheRest(t *testing.T) {
	service, db, userID := recommendationFixtures(t)
	ctx := context.Background()

	_, err := db.ExecContext(ctx, `DELETE FROM nutrient_recommendations`)
	require.NoError(t, err)

	resp, err := service.GetRecommendations(ctx, userID)
	require.NoError(t, err, "пустой справочник — не ошибка сервера")
	require.NotNil(t, resp)
	for category, list := range resp.Daily {
		assert.Empty(t, list, "категория %s", category)
	}
	assert.Empty(t, resp.Weekly)
}
