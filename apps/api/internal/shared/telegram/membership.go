package telegram

import (
	"context"
	"encoding/json"
	"fmt"
)

// Состав группы: пригласить, одобрить, удалить, сверить.
//
// Главное ограничение здесь названо в проектировании и проверено у API: бот не
// может добавить человека в группу. Доступны ссылка-заявка, одобрение и
// удаление — и только удаление обходится без участия самого человека.

// InviteLink — персональное приглашение.
type InviteLink struct {
	URL string
}

// CreateInviteLink выпускает персональную ссылку, создающую заявку.
//
// Заявка, а не мгновенное вступление: она даёт точку, где бот сверяется с базой.
// Прямая ссылка означала бы, что любой, кому она попала, уже внутри.
func (c *Client) CreateInviteLink(ctx context.Context, chatID int64, name string) (InviteLink, error) {
	raw, err := c.call(ctx, "createChatInviteLink", map[string]any{
		"chat_id":              chatID,
		"name":                 name,
		"creates_join_request": true,
	})
	if err != nil {
		return InviteLink{}, err
	}
	var link struct {
		InviteLink string `json:"invite_link"`
	}
	if err := json.Unmarshal(raw, &link); err != nil {
		return InviteLink{}, fmt.Errorf("read invite link: %w", err)
	}
	if link.InviteLink == "" {
		return InviteLink{}, fmt.Errorf("telegram created an invite without a link")
	}
	return InviteLink{URL: link.InviteLink}, nil
}

// RevokeInviteLink гасит выпущенную ссылку.
func (c *Client) RevokeInviteLink(ctx context.Context, chatID int64, link string) error {
	_, err := c.call(ctx, "revokeChatInviteLink", map[string]any{
		"chat_id": chatID, "invite_link": link,
	})
	return err
}

// ApproveJoinRequest впускает заявителя.
func (c *Client) ApproveJoinRequest(ctx context.Context, chatID, userID int64) error {
	_, err := c.call(ctx, "approveChatJoinRequest", map[string]any{
		"chat_id": chatID, "user_id": userID,
	})
	return err
}

// DeclineJoinRequest отказывает заявителю.
func (c *Client) DeclineJoinRequest(ctx context.Context, chatID, userID int64) error {
	_, err := c.call(ctx, "declineChatJoinRequest", map[string]any{
		"chat_id": chatID, "user_id": userID,
	})
	return err
}

// RemoveMember убирает человека из группы.
//
// Единственный доступный способ — забанить; бан снимается сразу следом, иначе
// вернуть человека при возвращении роли будет нельзя, а роли возвращают.
//
// `revoke_messages` не используется намеренно: сообщения ушедшего куратора
// остаются, как остаётся переписка клиента при стирании аккаунта.
func (c *Client) RemoveMember(ctx context.Context, chatID, userID int64) error {
	if _, err := c.call(ctx, "banChatMember", map[string]any{
		"chat_id": chatID, "user_id": userID, "revoke_messages": false,
	}); err != nil {
		return err
	}

	// Снятие бана обязательно. Без него человек не сможет вернуться, и это
	// выяснится в тот день, когда роль ему вернут.
	if _, err := c.call(ctx, "unbanChatMember", map[string]any{
		"chat_id": chatID, "user_id": userID, "only_if_banned": true,
	}); err != nil {
		return fmt.Errorf("участник удалён, но бан не снят — вернуться он не сможет: %w", err)
	}
	return nil
}

// Member — участник группы.
type Member struct {
	UserID   int64
	Username string
	Status   string
	IsBot    bool
}

// IsOwner отвечает, владелец ли это группы. Владельца бот удалить не может, и
// это норма, а не отказ.
func (m Member) IsOwner() bool { return m.Status == "creator" }

// Administrators возвращает администраторов группы.
//
// Полного списка участников Bot API не отдаёт. Для группы кураторов этого
// достаточно: люди в ней — администраторы либо обычные участники, и вторых
// сверка находит по заявкам, а не перечислением.
func (c *Client) Administrators(ctx context.Context, chatID int64) ([]Member, error) {
	raw, err := c.call(ctx, "getChatAdministrators", map[string]any{"chat_id": chatID})
	if err != nil {
		return nil, err
	}
	var list []struct {
		Status string `json:"status"`
		User   struct {
			ID       int64  `json:"id"`
			Username string `json:"username"`
			IsBot    bool   `json:"is_bot"`
		} `json:"user"`
	}
	if err := json.Unmarshal(raw, &list); err != nil {
		return nil, fmt.Errorf("read administrators: %w", err)
	}

	members := make([]Member, 0, len(list))
	for _, m := range list {
		members = append(members, Member{
			UserID: m.User.ID, Username: m.User.Username,
			Status: m.Status, IsBot: m.User.IsBot,
		})
	}
	return members, nil
}

// MemberOf возвращает участие конкретного человека.
func (c *Client) MemberOf(ctx context.Context, chatID, userID int64) (Member, error) {
	raw, err := c.call(ctx, "getChatMember", map[string]any{
		"chat_id": chatID, "user_id": userID,
	})
	if err != nil {
		return Member{}, err
	}
	var m struct {
		Status string `json:"status"`
		User   struct {
			ID       int64  `json:"id"`
			Username string `json:"username"`
			IsBot    bool   `json:"is_bot"`
		} `json:"user"`
	}
	if err := json.Unmarshal(raw, &m); err != nil {
		return Member{}, fmt.Errorf("read chat member: %w", err)
	}
	return Member{UserID: m.User.ID, Username: m.User.Username, Status: m.Status, IsBot: m.User.IsBot}, nil
}

// InGroup отвечает, находится ли человек в группе сейчас.
func (m Member) InGroup() bool {
	switch m.Status {
	case "creator", "administrator", "member", "restricted":
		return true
	}
	return false
}
