package supportbridge

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/telegram"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Имя темы обязано различать тёзок.
//
// Две «Анны К.» в списке тем — это две темы, которые невозможно развести
// глазами, и куратор отвечает не тому.
func TestTopicName(t *testing.T) {
	assert.Contains(t, topicName(42, "Анна К."), "Анна К.")
	assert.Contains(t, topicName(42, "Анна К."), "#42")
	assert.Contains(t, topicName(7, ""), "Без имени", "безымянный клиент дал бы пустой заголовок")
	assert.Contains(t, topicName(7, ""), "#7")
}

// Источник должен пережить запись в базу и чтение обратно.
//
// От него зависит, куда уйдёт ответ куратора: перепутанный код отправит ответ
// не в тот канал, и человек его не увидит.
func TestSourceSurvivesARoundTrip(t *testing.T) {
	for _, source := range []Source{SourceApp, SourceTelegram} {
		assert.Equal(t, source, sourceFromCode(source.code()),
			"источник %q не пережил запись и чтение", source)
	}
	assert.Equal(t, "app", SourceApp.code())
	assert.Equal(t, "telegram", SourceTelegram.code())
}

// Ноль вместо группы — это «выключено», а не «сломано».
func TestEnabled(t *testing.T) {
	sender := &noSender{}
	assert.False(t, NewService(nil, sender, logger.New(), 0, "").Enabled(),
		"мост без группы считает себя рабочим")
	assert.False(t, NewService(nil, nil, logger.New(), -100, "").Enabled(),
		"мост без отправителя считает себя рабочим")
	assert.True(t, NewService(nil, sender, logger.New(), -100, "").Enabled())

	var absent *Service
	assert.False(t, absent.Enabled(), "нулевой мост должен молчать, а не падать")
}

// Выключенный мост ничего не делает и ни на что не жалуется.
func TestDisabledBridgeIsSilent(t *testing.T) {
	service := NewService(nil, nil, logger.New(), 0, "")
	ctx := context.Background()

	require.NoError(t, service.Relay(ctx, 1, "Имя", SourceApp, "текст"))
	require.NoError(t, service.Close(ctx, 1))
	require.NoError(t, service.Healthy(ctx))

	target, err := service.TargetFor(ctx, 1, 0)
	require.NoError(t, err)
	assert.Nil(t, target)
}

// Без хранилища вложение отклоняется названной ошибкой, а не общей.
//
// Человеку надо сказать, что случилось: молчание в ответ на фотографию читается
// как поломка.
func TestSaveIncomingWithoutStorage(t *testing.T) {
	_, _, err := NewService(nil, &noSender{}, logger.New(), -100, "").
		SaveIncoming(context.Background(), 1, "file", "имя.jpg")

	assert.ErrorIs(t, err, ErrStorageOff)
}

type noSender struct{}

func (noSender) CreateForumTopic(context.Context, int64, string) (int64, error) { return 1, nil }
func (noSender) CloseForumTopic(context.Context, int64, int64) error            { return nil }
func (noSender) SendToTopic(context.Context, int64, int64, string) (int64, error) {
	return 1, nil
}
func (noSender) CheckForum(context.Context, int64) (telegram.ForumState, error) {
	return telegram.ForumState{}, nil
}
