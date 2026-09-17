// Package supportbridge сводит переписку клиента в одну тему форума Telegram.
//
// У клиента два канала: чат платформы и бот поддержки. Тема привязана к
// клиенту, а не к каналу — разговор у человека один, даже когда он пишет в двух
// местах. Источник каждого сообщения подписывается, потому что от него зависит,
// куда уйдёт ответ куратора.
package supportbridge

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/telegram"
)

// Source — откуда пришло сообщение клиента.
type Source string

const (
	// SourceApp — чат платформы.
	SourceApp Source = "приложение"
	// SourceTelegram — бот поддержки.
	SourceTelegram Source = "telegram"
)

// Sender — то, что умеет Telegram. Интерфейс узкий намеренно: мосту не нужно
// знать, как устроен Bot API.
type Sender interface {
	CreateForumTopic(ctx context.Context, chatID int64, name string) (int64, error)
	CloseForumTopic(ctx context.Context, chatID, threadID int64) error
	SendToTopic(ctx context.Context, chatID, threadID int64, text string) (int64, error)
	CheckForum(ctx context.Context, chatID int64) (telegram.ForumState, error)
}

// Service ведёт темы и переносит в них сообщения.
type Service struct {
	db      *sql.DB
	sender  Sender
	log     *logger.Logger
	groupID int64
	appURL  string
	// store и downloader могут быть nil: без хранилища вложения не ходят.
	store      FileStore
	downloader Downloader
	platform   PlatformAttacher
	// members и messenger могут быть nil: без них состав не ведётся.
	members   Membership
	messenger Messenger
}

func NewService(db *sql.DB, sender Sender, log *logger.Logger, groupID int64, appURL string) *Service {
	return &Service{db: db, sender: sender, log: log, groupID: groupID, appURL: appURL}
}

// Enabled отвечает, настроен ли мост вообще.
//
// Ноль вместо идентификатора — это «выключено», а не «сломано»: переписка идёт
// по-старому, и сообщать об этом надо спокойно.
func (s *Service) Enabled() bool {
	return s != nil && s.groupID != 0 && s.sender != nil
}

// topicFor находит тему клиента или заводит новую.
//
// Имя темы должно позволять узнать человека и не нести его показателей: вес и
// замеры в заголовке темы — это те же данные, только на виду у всей группы.
func (s *Service) topicFor(ctx context.Context, clientID int64, displayName string) (int64, error) {
	var threadID int64
	err := s.db.QueryRowContext(ctx,
		`SELECT thread_id FROM support_topics WHERE client_id = $1 AND closed_at IS NULL`,
		clientID).Scan(&threadID)
	if err == nil {
		return threadID, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, fmt.Errorf("look up topic: %w", err)
	}

	threadID, err = s.sender.CreateForumTopic(ctx, s.groupID, topicName(clientID, displayName))
	if err != nil {
		return 0, fmt.Errorf("create topic: %w", err)
	}

	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO support_topics (client_id, thread_id)
		VALUES ($1, $2)
		ON CONFLICT (client_id) DO UPDATE SET thread_id = EXCLUDED.thread_id, closed_at = NULL`,
		clientID, threadID); err != nil {
		return 0, fmt.Errorf("store topic: %w", err)
	}
	return threadID, nil
}

// topicName собирает заголовок темы.
func topicName(clientID int64, displayName string) string {
	if displayName == "" {
		displayName = "Без имени"
	}
	// Идентификатор рядом с именем: имена повторяются, и две «Анны К.» в списке
	// тем — это две темы, которые невозможно различить.
	return fmt.Sprintf("%s · #%d", displayName, clientID)
}

// Relay переносит сообщение клиента в его тему.
//
// Ошибка возвращается, но вызывающий обязан решить сам, стоит ли она отказа
// человеку: сообщение уже принято, и падать из-за недоступной группы — значит
// терять то, что человек написал.
func (s *Service) Relay(ctx context.Context, clientID int64, displayName string, source Source, text string) error {
	if !s.Enabled() {
		return nil
	}

	threadID, err := s.topicFor(ctx, clientID, displayName)
	if err != nil {
		return err
	}

	// Ссылка на карточку, а не показатели: куратор всё равно откроет карточку,
	// а копия веса и замеров в Telegram переживёт удаление аккаунта.
	body := fmt.Sprintf("[%s] %s\n\n%s/curator/clients/%d", source, text, s.appURL, clientID)
	messageID, err := s.sender.SendToTopic(ctx, s.groupID, threadID, body)
	if err != nil {
		return fmt.Errorf("relay to topic: %w", err)
	}

	// Запоминаем, чем было это сообщение: реплай на него — единственный способ
	// куратора сказать, в какой канал вернуть ответ.
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO support_relays (group_message_id, client_id, source)
		VALUES ($1, $2, $3)
		ON CONFLICT (group_message_id) DO NOTHING`,
		messageID, clientID, source.code()); err != nil {
		s.log.Errorw("Не удалось запомнить зеркалированное сообщение",
			"error", err, "client_id", clientID)
	}
	return nil
}

// code — как источник хранится в базе.
func (s Source) code() string {
	if s == SourceApp {
		return "app"
	}
	return "telegram"
}

func sourceFromCode(code string) Source {
	if code == "app" {
		return SourceApp
	}
	return SourceTelegram
}

// Target описывает, кому и куда возвращать ответ куратора.
type Target struct {
	ClientID int64
	Source   Source
}

// TargetFor решает, куда уйдёт ответ, написанный в теме.
//
// Реплай на конкретное сообщение — точное указание: канал берётся из него.
// Без реплая берётся канал последнего сообщения клиента: в обычном разговоре
// оба правила дают одно и то же, расходятся они только там, где человек писал в
// оба канала — и тогда реплай единственный способ выразить намерение.
func (s *Service) TargetFor(ctx context.Context, threadID int64, replyToMessageID int64) (*Target, error) {
	if !s.Enabled() {
		return nil, nil
	}

	if replyToMessageID != 0 {
		var t Target
		var code string
		err := s.db.QueryRowContext(ctx,
			`SELECT client_id, source FROM support_relays WHERE group_message_id = $1`,
			replyToMessageID).Scan(&t.ClientID, &code)
		if err == nil {
			t.Source = sourceFromCode(code)
			return &t, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("resolve reply target: %w", err)
		}
		// Реплай на что-то постороннее — например, на сообщение другого
		// куратора. Падать не на чем: ниже найдём клиента по теме.
	}

	var clientID int64
	err := s.db.QueryRowContext(ctx,
		`SELECT client_id FROM support_topics WHERE thread_id = $1 AND closed_at IS NULL`,
		threadID).Scan(&clientID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("resolve topic owner: %w", err)
	}

	var code string
	err = s.db.QueryRowContext(ctx,
		`SELECT source FROM support_relays WHERE client_id = $1
		  ORDER BY created_at DESC, group_message_id DESC LIMIT 1`, clientID).Scan(&code)
	if errors.Is(err, sql.ErrNoRows) {
		// Клиент ещё ничего не писал — отвечать в Telegram бессмысленно.
		return &Target{ClientID: clientID, Source: SourceApp}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("resolve last channel: %w", err)
	}
	return &Target{ClientID: clientID, Source: sourceFromCode(code)}, nil
}

// Close закрывает тему клиента: история остаётся, новых сообщений не будет.
//
// Отказ Telegram не отменяет того, ради чего закрытие делалось — стирания
// аккаунта: строка о теме уходит в любом случае, а неудача попадает в журнал.
func (s *Service) Close(ctx context.Context, clientID int64) error {
	if !s.Enabled() {
		return nil
	}

	var threadID int64
	err := s.db.QueryRowContext(ctx,
		`SELECT thread_id FROM support_topics WHERE client_id = $1 AND closed_at IS NULL`,
		clientID).Scan(&threadID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("look up topic to close: %w", err)
	}

	if err := s.sender.CloseForumTopic(ctx, s.groupID, threadID); err != nil {
		s.log.Errorw("Не удалось закрыть тему клиента", "error", err, "client_id", clientID)
	}

	if _, err := s.db.ExecContext(ctx,
		`UPDATE support_topics SET closed_at = NOW() WHERE client_id = $1`, clientID); err != nil {
		return fmt.Errorf("mark topic closed: %w", err)
	}
	return nil
}

// Healthy спрашивает у Telegram, годна ли группа.
//
// Спрашивается именно у Telegram: право управлять темами снимается в интерфейсе
// группы, и настройки об этом не узнают. Переписка тогда перестаёт ходить, ничем
// не отличаясь от исправной, — так уже молчал вебхук.
func (s *Service) Healthy(ctx context.Context) error {
	if !s.Enabled() {
		return nil
	}

	state, err := s.sender.CheckForum(ctx, s.groupID)
	if err != nil {
		return fmt.Errorf("группа поддержки недоступна: %w", err)
	}
	if !state.IsForum {
		return fmt.Errorf("в группе поддержки выключены темы")
	}
	if !state.BotIsAdmin {
		return fmt.Errorf("бот не администратор группы поддержки")
	}
	if !state.CanManageTopic {
		return fmt.Errorf("боту не разрешено управлять темами")
	}
	return nil
}

// TargetForReply — форма, в которой мост нужен поддержке.
//
// Возвращает клиента, признак «отвечать в Telegram» и признак «адресат найден».
// Отдельный признак найденности нужен, чтобы отличить служебную переписку
// кураторов в теме от ответа, который надо доставить.
func (s *Service) TargetForReply(ctx context.Context, threadID, replyToMessageID int64) (int64, bool, bool, error) {
	target, err := s.TargetFor(ctx, threadID, replyToMessageID)
	if err != nil || target == nil {
		return 0, false, false, err
	}
	return target.ClientID, target.Source == SourceTelegram, true, nil
}

// RelayFromTelegram — форма Relay, в которой мост нужен поддержке: без типа
// источника, потому что он здесь всегда один.
func (s *Service) RelayFromTelegram(ctx context.Context, clientID int64, displayName, text string) error {
	return s.Relay(ctx, clientID, displayName, SourceTelegram, text)
}

// RelayFromApp — то же для чата платформы.
func (s *Service) RelayFromApp(ctx context.Context, clientID int64, displayName, text string) error {
	return s.Relay(ctx, clientID, displayName, SourceApp, text)
}
