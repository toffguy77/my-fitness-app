//go:build integration

package main

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Сеятель не должен уметь дотянуться до боевой базы.
//
// Фикстуры создаются с паролем стоимостью `bcrypt.MinCost` — 4 вместо 10. Для
// тестов это правильно, иначе прогон тратит секунды на хэширование. В боевой
// базе такая же строка — учётная запись с полными правами и намеренно
// ослабленным паролем, причём одна из фикстур имеет роль super_admin.
//
// Ошибиться легко и незаметно: DATABASE_URL живёт в окружении, а окружение
// переживает смену задачи. Проверяется содержимое базы, а не имя хоста: имя
// хоста легко перепутать и так же легко молча поправить.
func TestRefusesToSeedWhereRealPeopleLive(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "seed_guard")
	ctx := context.Background()

	// Пустая база и база с одними фикстурами — законные цели.
	require.NoError(t, refuseIfNotATestDatabase(ctx, db.DB),
		"пустая база должна приниматься")

	_, err := db.ExecContext(ctx,
		`INSERT INTO users (email, password, name, role)
		 VALUES ('e2e-client@burcev.test', 'x', 'Фикстура', 'client')`)
	require.NoError(t, err)
	require.NoError(t, refuseIfNotATestDatabase(ctx, db.DB),
		"база с одними фикстурами должна приниматься")

	// Один настоящий человек — и это больше не тестовая база.
	_, err = db.ExecContext(ctx,
		`INSERT INTO users (email, password, name, role)
		 VALUES ('человек@burcev.team', 'x', 'Живой человек', 'client')`)
	require.NoError(t, err)

	err = refuseIfNotATestDatabase(ctx, db.DB)

	require.Error(t, err, "сеятель согласился сеять туда, где живут люди")
	assert.Contains(t, err.Error(), "не тестовая база")
	assert.Contains(t, err.Error(), allowRealAccounts,
		"отказ обязан называть способ его снять — иначе его снимут правкой кода")
}

// Обход существует намеренно и должен работать: запрет, который нельзя снять,
// снимают удалением запрета.
func TestOverrideIsHonoured(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "seed_guard_override")
	ctx := context.Background()

	_, err := db.ExecContext(ctx,
		`INSERT INTO users (email, password, name, role)
		 VALUES ('человек@burcev.team', 'x', 'Живой человек', 'client')`)
	require.NoError(t, err)

	t.Setenv(allowRealAccounts, "1")

	assert.NoError(t, refuseIfNotATestDatabase(ctx, db.DB))
}

// Удалённые учётные записи не делают базу боевой: важно, кто в ней живёт.
func TestDeletedAccountsDoNotCount(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "seed_guard_deleted")
	ctx := context.Background()

	_, err := db.ExecContext(ctx,
		`INSERT INTO users (email, password, name, role, deleted_at)
		 VALUES ('ушёл@burcev.team', 'x', 'Ушедший', 'client', NOW())`)
	require.NoError(t, err)

	assert.NoError(t, refuseIfNotATestDatabase(ctx, db.DB))
}
