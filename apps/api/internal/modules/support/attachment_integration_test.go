//go:build integration

package support

import (
	"context"
	"fmt"
	"testing"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/upload"
	"github.com/burcev/api/internal/testsupport"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type sentBot struct{ sent []string }

func (s *sentBot) SendMessage(_ context.Context, _ int64, text string) error {
	s.sent = append(s.sent, text)
	return nil
}

type fakeMedia struct {
	saveErr  error
	relayed  int
	platform int
}

func (f *fakeMedia) SaveIncoming(context.Context, int64, string, string) (string, upload.Kind, error) {
	if f.saveErr != nil {
		return "", "", f.saveErr
	}
	return "support/1/файл.png", upload.KindPNG, nil
}
func (f *fakeMedia) RelayFileFromTelegram(context.Context, int64, string, string, upload.Kind, string) error {
	f.relayed++
	return nil
}
func (f *fakeMedia) StoreOnPlatform(context.Context, int64, string, upload.Kind, string) error {
	f.platform++
	return nil
}

// Фотография принимается, попадает и в тему, и в переписку платформы, и человек
// об этом узнаёт.
//
// Раньше на фотографию не приходило ничего: ни ответа, ни отказа.
func TestAttachmentIsAcceptedAndAnswered(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "attach_ok")
	ctx := context.Background()
	bot := &sentBot{}
	media := &fakeMedia{}
	service := NewService(db.DB, logger.New(), nil, bot, nil, 100).WithMedia(media)

	var client int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email,password,name,role) VALUES ('фото@e.test','x','Ф','client') RETURNING id`).Scan(&client))
	_, err := db.ExecContext(ctx,
		`INSERT INTO support_conversations (chat_id, user_id, status) VALUES (7001, $1, 'open')`, client)
	require.NoError(t, err)

	require.NoError(t, service.HandleAttachment(ctx, Attachment{ChatID: 7001, FileID: "f1", FileName: "еда.jpg"}))

	assert.Equal(t, 1, media.relayed, "вложение не уехало в тему")
	assert.Equal(t, 1, media.platform, "вложение не появилось в переписке платформы")
	require.Len(t, bot.sent, 1, "человеку не ответили на фотографию")
	assert.Contains(t, bot.sent[0], "получил")
}

// Хранилище выключено — внятный отказ, а не молчание.
func TestAttachmentWithoutStorageExplainsItself(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "attach_off")
	ctx := context.Background()
	bot := &sentBot{}
	service := NewService(db.DB, logger.New(), nil, bot, nil, 100)

	_, err := db.ExecContext(ctx,
		`INSERT INTO support_conversations (chat_id, status) VALUES (7002, 'open')`)
	require.NoError(t, err)

	require.NoError(t, service.HandleAttachment(ctx, Attachment{ChatID: 7002, FileID: "f1"}))

	require.Len(t, bot.sent, 1, "на фотографию ответили молчанием")
	assert.Contains(t, bot.sent[0], "вложения")
}

// Снимок с iPhone получает объяснение, а не «неподдерживаемый тип файла».
func TestHEICGetsAnExplanation(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "attach_heic")
	ctx := context.Background()
	bot := &sentBot{}
	service := NewService(db.DB, logger.New(), nil, bot, nil, 100).
		WithMedia(&fakeMedia{saveErr: upload.ErrHEIC})

	var client int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email,password,name,role) VALUES ('айфон@e.test','x','А','client') RETURNING id`).Scan(&client))
	_, err := db.ExecContext(ctx,
		`INSERT INTO support_conversations (chat_id, user_id, status) VALUES (7003, $1, 'open')`, client)
	require.NoError(t, err)

	require.NoError(t, service.HandleAttachment(ctx, Attachment{ChatID: 7003, FileID: "f1", FileName: "IMG_0001.HEIC"}))

	require.Len(t, bot.sent, 1)
	assert.Contains(t, bot.sent[0], "HEIC")
}

// Неудача сохранения тоже объясняется.
func TestFailedAttachmentIsExplained(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "attach_fail")
	ctx := context.Background()
	bot := &sentBot{}
	service := NewService(db.DB, logger.New(), nil, bot, nil, 100).
		WithMedia(&fakeMedia{saveErr: fmt.Errorf("s3 down")})

	var client int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email,password,name,role) VALUES ('сбой@e.test','x','С','client') RETURNING id`).Scan(&client))
	_, err := db.ExecContext(ctx,
		`INSERT INTO support_conversations (chat_id, user_id, status) VALUES (7004, $1, 'open')`, client)
	require.NoError(t, err)

	require.NoError(t, service.HandleAttachment(ctx, Attachment{ChatID: 7004, FileID: "f1"}))

	require.Len(t, bot.sent, 1, "на неудачу ответили молчанием")
	assert.Contains(t, bot.sent[0], "Не смог сохранить")
}
