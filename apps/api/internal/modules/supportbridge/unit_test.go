package supportbridge

import (
	"context"
	"net/url"
	"os"
	"path/filepath"
	"strings"
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

// Выключенный мост не трогает файлы.
func TestDisabledBridgeIgnoresFiles(t *testing.T) {
	service := NewService(nil, nil, logger.New(), 0, "")
	assert.NoError(t, service.RelayFile(context.Background(), 1, "Имя", SourceApp, "ключ", "image/png", ""))
	assert.NoError(t, service.RelayFileFromTelegram(context.Background(), 1, "Имя", "ключ", "image/png", ""))
	assert.NoError(t, service.StoreOnPlatform(context.Background(), 1, "ключ", "image/png", ""))
}

// Форма Relay для каждого канала подставляет свой источник.
func TestRelayHelpersCarryTheirSource(t *testing.T) {
	service := NewService(nil, nil, logger.New(), 0, "")
	// Мост выключен, поэтому обе формы молчат — проверяем, что они не падают и
	// вызываются, а разницу источников покрывает тест на живой базе.
	require.NoError(t, service.RelayFromApp(context.Background(), 1, "Имя", "текст"))
	require.NoError(t, service.RelayFromTelegram(context.Background(), 1, "Имя", "текст"))
}

// Без заданной группы состав не ведётся — и ни одна из веток не падает.
//
// Это не формальность: половина сред живёт без группы (на проде её не было
// неделю), и любой из этих вызовов там происходит по-настоящему.
func TestMembershipDisabledDoesNothing(t *testing.T) {
	ctx := context.Background()
	service := NewService(nil, &noSender{}, logger.New(), 0, "")

	link, err := service.InviteFor(ctx, 1, "Имя")
	require.NoError(t, err)
	assert.Empty(t, link)

	link, err = service.InviteLinkFor(ctx, 1)
	require.NoError(t, err)
	assert.Empty(t, link)

	require.NoError(t, service.OnRoleGranted(ctx, 1, "Имя"))
	require.NoError(t, service.OnRoleRevoked(ctx, 1))
	require.NoError(t, service.OnJoinRequest(ctx, 1, "ник"))

	removed, err := service.Reconcile(ctx)
	require.NoError(t, err)
	assert.Zero(t, removed)
}

// Ведение состава требует и группы, и того, кто умеет её менять.
func TestMembershipEnabledNeedsBoth(t *testing.T) {
	assert.False(t, NewService(nil, nil, logger.New(), 0, "").membershipEnabled(),
		"без группы состав считается управляемым")
	assert.False(t, NewService(nil, nil, logger.New(), -100, "").membershipEnabled(),
		"без клиента Telegram состав считается управляемым")

	s := NewService(nil, nil, logger.New(), -100, "")
	s.members = &noMembers{}
	assert.True(t, s.membershipEnabled())

	var absent *Service
	assert.False(t, absent.membershipEnabled(), "нулевой мост должен молчать, а не падать")
}

type noMembers struct{}

func (noMembers) CreateInviteLink(context.Context, int64, string) (telegram.InviteLink, error) {
	return telegram.InviteLink{}, nil
}
func (noMembers) ApproveJoinRequest(context.Context, int64, int64) error { return nil }
func (noMembers) DeclineJoinRequest(context.Context, int64, int64) error { return nil }
func (noMembers) RemoveMember(context.Context, int64, int64) error       { return nil }
func (noMembers) Administrators(context.Context, int64) ([]telegram.Member, error) {
	return nil, nil
}

// Ссылка на руководство куратора ведёт в существующий файл.
//
// Её отправляют живому человеку в момент, когда он только стал куратором:
// переименование файла сломает её молча, а заметит это тот, кому в первый
// рабочий день покажут «404» вместо «с чего начать».
func TestCuratorGuideURLPointsAtAFileThatExists(t *testing.T) {
	const prefix = "https://github.com/toffguy77/my-fitness-app/blob/main/"
	require.True(t, strings.HasPrefix(CuratorGuideURL, prefix),
		"ссылка ведёт не в этот репозиторий: %s", CuratorGuideURL)

	decoded, err := url.PathUnescape(strings.TrimPrefix(CuratorGuideURL, prefix))
	require.NoError(t, err)

	// Пять уровней вверх: internal/modules/supportbridge внутри apps/api.
	_, err = os.Stat(filepath.Join("..", "..", "..", "..", "..", filepath.FromSlash(decoded)))
	require.NoError(t, err, "файл руководства не найден: %s", decoded)
}
