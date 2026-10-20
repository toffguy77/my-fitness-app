//go:build integration

package content

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// notification-targets: уведомление о статье вставляется здесь же, мимо
// notifications.CreateNotification. Без явного target колонка взяла бы
// значение по умолчанию, и пуш открывал бы список уведомлений.
func TestPublishedArticleNotificationTargetsTheArticle(t *testing.T) {
	s, db, author := slugFixture(t)
	ctx := context.Background()
	var client int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('reader@example.test', 'x', 'Читатель', 'client') RETURNING id`,
	).Scan(&client))

	a := createArticle(t, s, author, "Белок на завтрак", "all")
	publish(t, s, author, a.ID)

	var target string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT target::text FROM notifications WHERE user_id = $1 AND type = 'new_content'`, client).Scan(&target))
	assert.JSONEq(t, `{"kind":"article","ids":{"article_id":"`+a.ID+`","slug":"`+a.Slug+`"}}`, target)
}
