package support

import (
	"context"
	"fmt"
	"testing"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/upload"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubBridge struct {
	clientID   int64
	toTelegram bool
	found      bool
	err        error
}

func (s stubBridge) TargetForReply(context.Context, int64, int64) (int64, bool, bool, error) {
	return s.clientID, s.toTelegram, s.found, s.err
}
func (stubBridge) RelayFromTelegram(context.Context, int64, string, string) error { return nil }

type stubDelivery struct{ to []int64 }

func (s *stubDelivery) ToPlatform(_ context.Context, clientID, _ int64, _ string) error {
	s.to = append(s.to, clientID)
	return nil
}

type stubCurators struct{ id int64 }

func (s stubCurators) ByTelegramChat(context.Context, int64) (int64, bool, error) {
	return s.id, s.id != 0, nil
}

// Сообщение в теме, за которой никого нет, — это разговор кураторов между
// собой. Молчим, а не гадаем, кому его доставить.
func TestReplyWithNoTargetIsIgnored(t *testing.T) {
	delivery := &stubDelivery{}
	service := NewService(nil, logger.New(), nil, nil, nil, 0).
		WithBridge(stubBridge{found: false}, delivery, stubCurators{})

	require.NoError(t, service.HandleCuratorReply(context.Background(), CuratorReply{ThreadID: 1}))

	assert.Empty(t, delivery.to, "доставили ответ неизвестно кому")
}

// Без моста ответы из группы никуда не идут — и это не ошибка.
func TestReplyWithoutABridgeIsSilent(t *testing.T) {
	service := NewService(nil, logger.New(), nil, nil, nil, 0)
	assert.NoError(t, service.HandleCuratorReply(context.Background(), CuratorReply{ThreadID: 1}))
}

// Ответ на сообщение из приложения уходит в переписку платформы.
func TestReplyForTheAppGoesToThePlatform(t *testing.T) {
	delivery := &stubDelivery{}
	service := NewService(nil, logger.New(), nil, nil, nil, 0).
		WithBridge(stubBridge{clientID: 42, toTelegram: false, found: true}, delivery, stubCurators{id: 7})

	require.NoError(t, service.HandleCuratorReply(context.Background(),
		CuratorReply{ThreadID: 1, Text: "ответ"}))

	assert.Equal(t, []int64{42}, delivery.to)
}

// Отказ моста не проглатывается: доставить ответ мы не смогли, и это видно.
func TestReplyReportsABridgeFailure(t *testing.T) {
	service := NewService(nil, logger.New(), nil, nil, nil, 0).
		WithBridge(stubBridge{err: fmt.Errorf("база недоступна")}, &stubDelivery{}, stubCurators{})

	err := service.HandleCuratorReply(context.Background(), CuratorReply{ThreadID: 1})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "база недоступна")
}

type stubMedia struct {
	saved    int
	platform int
	err      error
}

func (s *stubMedia) SaveIncoming(context.Context, int64, string, string) (string, upload.Kind, error) {
	if s.err != nil {
		return "", "", s.err
	}
	s.saved++
	return "ключ", upload.KindPNG, nil
}
func (s *stubMedia) RelayFileFromTelegram(context.Context, int64, string, string, upload.Kind, string) error {
	return nil
}
func (s *stubMedia) StoreOnPlatform(context.Context, int64, string, upload.Kind, string) error {
	s.platform++
	return nil
}

// Вложение от куратора сохраняется у нас: пересылать чужой file_id нельзя.
func TestCuratorAttachmentIsStored(t *testing.T) {
	media := &stubMedia{}
	service := NewService(nil, logger.New(), nil, nil, nil, 0).
		WithBridge(stubBridge{clientID: 42, found: true}, &stubDelivery{}, stubCurators{id: 7}).
		WithMedia(media)

	require.NoError(t, service.HandleCuratorReply(context.Background(),
		CuratorReply{ThreadID: 1, FileID: "f1", FileName: "снимок.png", Text: "вот"}))

	assert.Equal(t, 1, media.saved)
	assert.Equal(t, 1, media.platform, "вложение куратора не попало в переписку платформы")
}

// Заявка в постороннюю группу не решается.
//
// Бот может состоять в нескольких группах, и решать за чужие он не вправе: там
// свои правила, и наша роль куратора к ним отношения не имеет.
func TestJoinRequestToAnotherGroupIsIgnored(t *testing.T) {
	members := &stubMembership{}
	service := NewService(nil, logger.New(), nil, nil, nil, 0).
		WithMembership(members).WithGroup(-100390)

	require.NoError(t, service.HandleJoinRequest(context.Background(), -100999, 42, "ник"))

	assert.Zero(t, members.calls, "решили судьбу заявки в чужую группу")
}

// Заявка в нашу группу передаётся на решение.
func TestJoinRequestToOurGroupIsDecided(t *testing.T) {
	members := &stubMembership{}
	service := NewService(nil, logger.New(), nil, nil, nil, 0).
		WithMembership(members).WithGroup(-100390)

	require.NoError(t, service.HandleJoinRequest(context.Background(), -100390, 42, "ник"))

	assert.Equal(t, 1, members.calls)
}

// Без подключённого состава заявки никуда не идут — и это не ошибка.
func TestJoinRequestWithoutMembershipIsSilent(t *testing.T) {
	service := NewService(nil, logger.New(), nil, nil, nil, 0)
	assert.NoError(t, service.HandleJoinRequest(context.Background(), -1, 42, "ник"))
}

type stubMembership struct{ calls int }

func (s *stubMembership) OnJoinRequest(context.Context, int64, string) error {
	s.calls++
	return nil
}
