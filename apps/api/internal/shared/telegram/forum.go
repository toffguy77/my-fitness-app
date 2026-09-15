package telegram

import (
	"context"
	"encoding/json"
	"fmt"
)

// Форум-группа: тема на клиента.
//
// Тема (`message_thread_id`) — единственный способ держать переписку клиента в
// одном месте, когда он пишет и в приложение, и в бот. Всё здесь требует, чтобы
// бот был администратором группы с правом управления темами: обычный участник
// тему не создаст, и отказ придёт не при настройке, а при первом обращении
// клиента.

// SendToTopic отправляет сообщение в тему форума.
//
// threadID == 0 означает общую ленту группы: так уходят сообщения, которым тема
// ещё не нужна или уже не положена.
func (c *Client) SendToTopic(ctx context.Context, chatID, threadID int64, text string) error {
	payload := map[string]any{
		"chat_id":                  chatID,
		"text":                     text,
		"disable_web_page_preview": true,
	}
	if threadID != 0 {
		payload["message_thread_id"] = threadID
	}
	_, err := c.call(ctx, "sendMessage", payload)
	return err
}

// CreateForumTopic заводит тему и возвращает её идентификатор.
func (c *Client) CreateForumTopic(ctx context.Context, chatID int64, name string) (int64, error) {
	raw, err := c.call(ctx, "createForumTopic", map[string]any{
		"chat_id": chatID,
		"name":    name,
	})
	if err != nil {
		return 0, err
	}

	var result struct {
		MessageThreadID int64 `json:"message_thread_id"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return 0, fmt.Errorf("read created topic: %w", err)
	}
	if result.MessageThreadID == 0 {
		return 0, fmt.Errorf("telegram created a topic without an id")
	}
	return result.MessageThreadID, nil
}

// CloseForumTopic закрывает тему: история остаётся, новых сообщений не будет.
func (c *Client) CloseForumTopic(ctx context.Context, chatID, threadID int64) error {
	_, err := c.call(ctx, "closeForumTopic", map[string]any{
		"chat_id":           chatID,
		"message_thread_id": threadID,
	})
	return err
}

// ForumState описывает, годна ли группа для работы.
type ForumState struct {
	IsForum        bool
	BotIsAdmin     bool
	CanManageTopic bool
}

// Usable отвечает, можно ли вести переписку в этой группе.
func (s ForumState) Usable() bool {
	return s.IsForum && s.BotIsAdmin && s.CanManageTopic
}

// CheckForum спрашивает у Telegram, годна ли группа и хватает ли боту прав.
//
// Спрашивается именно у Telegram, а не выводится из настроек: право можно снять
// в интерфейсе группы, и тогда мост замолчит, ничем не отличаясь от исправного.
// Ровно так уже молчал вебхук.
func (c *Client) CheckForum(ctx context.Context, chatID int64) (ForumState, error) {
	var state ForumState

	raw, err := c.call(ctx, "getChat", map[string]any{"chat_id": chatID})
	if err != nil {
		return state, err
	}
	var chat struct {
		IsForum bool `json:"is_forum"`
	}
	if err := json.Unmarshal(raw, &chat); err != nil {
		return state, fmt.Errorf("read chat: %w", err)
	}
	state.IsForum = chat.IsForum

	raw, err = c.call(ctx, "getMe", nil)
	if err != nil {
		return state, err
	}
	var me struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(raw, &me); err != nil {
		return state, fmt.Errorf("read bot identity: %w", err)
	}

	raw, err = c.call(ctx, "getChatMember", map[string]any{
		"chat_id": chatID,
		"user_id": me.ID,
	})
	if err != nil {
		return state, err
	}
	var member struct {
		Status         string `json:"status"`
		CanManageTopic bool   `json:"can_manage_topics"`
	}
	if err := json.Unmarshal(raw, &member); err != nil {
		return state, fmt.Errorf("read bot membership: %w", err)
	}
	state.BotIsAdmin = member.Status == "administrator" || member.Status == "creator"
	state.CanManageTopic = member.CanManageTopic

	return state, nil
}
