package notifications

import (
	"encoding/json"
	"strings"
	"time"
)

// pushMessage is one push as both transports see it, before it is encoded for
// either.
type pushMessage struct {
	// notificationID is empty for a chat message: it is not a notification.
	notificationID   string
	notificationType NotificationType
	title            string
	body             string
	// actionURL is the web path; only the browser uses it.
	actionURL string
	target    Target
	badge     int
	// passive: inside the recipient's quiet hours. An iPhone shows the push in
	// Notification Centre without sound and without lighting the screen.
	passive bool
	// countedAt is when badge was counted: a change after it leaves the
	// phone's badge marked stale.
	countedAt time.Time
}

// Push categories. The app registers them with their actions; a push without
// a category has none.
const (
	categoryChatMessage      = "CHAT_MESSAGE"
	categoryTask             = "TASK"
	categoryTaskWorkout      = "TASK_WORKOUT"
	categorySupportEscalated = "SUPPORT_ESCALATED"
)

// categoryFor picks the actions a push offers. A workout task gets its own
// category: «Выполнено» from the lock screen cannot record the type and length
// a workout needs, so it only offers to open the task.
func categoryFor(m pushMessage) string {
	switch m.notificationType {
	case TypeChatMessage:
		return categoryChatMessage
	case TypeTaskAssigned, TypeTaskOverdue:
		if m.target.IDs["task_type"] == "workout" {
			return categoryTaskWorkout
		}
		return categoryTask
	case TypeSupportEscalated:
		return categorySupportEscalated
	}
	return ""
}

// threadIDFor groups pushes in Notification Centre: by conversation for chat
// and support, by screen for the rest.
func threadIDFor(target Target) string {
	switch target.Kind {
	case TargetChat:
		return "conversation:" + target.IDs["conversation_id"]
	case TargetSupportConversation:
		return "support:" + target.IDs["conversation_id"]
	case "":
		return string(TargetNotifications)
	}
	return string(target.Kind)
}

type apnsAlert struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

type apsDictionary struct {
	Alert             *apnsAlert `json:"alert,omitempty"`
	Sound             string     `json:"sound,omitempty"`
	Badge             *int       `json:"badge,omitempty"`
	ThreadID          string     `json:"thread-id,omitempty"`
	Category          string     `json:"category,omitempty"`
	InterruptionLevel string     `json:"interruption-level,omitempty"`
	ContentAvailable  int        `json:"content-available,omitempty"`
}

// apnsPayload is what the phone receives. `aps` is Apple's; the rest is ours,
// read by the app to open the right screen. Nothing else goes in: no address,
// no weight, no calories — only the text of the notification itself, which is
// already on the lock screen.
type apnsPayload struct {
	APS            apsDictionary `json:"aps"`
	Target         *Target       `json:"target,omitempty"`
	NotificationID string        `json:"notification_id,omitempty"`
}

// newAPNSPayload encodes an alert push.
func newAPNSPayload(m pushMessage) ([]byte, error) {
	badge := m.badge
	target := m.target
	if target.Kind == "" {
		target.Kind = TargetNotifications
	}
	p := apnsPayload{
		APS: apsDictionary{
			Alert:    &apnsAlert{Title: m.title, Body: m.body},
			Badge:    &badge,
			ThreadID: threadIDFor(target),
			Category: categoryFor(m),
		},
		Target:         &target,
		NotificationID: m.notificationID,
	}
	if m.passive {
		// Quiet hours: delivered now, silently. No sound key at all — an empty
		// one would still be a sound.
		p.APS.InterruptionLevel = "passive"
	} else {
		p.APS.Sound = "default"
	}
	return json.Marshal(p)
}

// newBadgePayload encodes a silent badge update: no alert, no sound.
func newBadgePayload(badge int) ([]byte, error) {
	return json.Marshal(apnsPayload{APS: apsDictionary{Badge: &badge, ContentAvailable: 1}})
}

// webPushPayload is what the service worker receives.
type webPushPayload struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url,omitempty"`
	Tag   string `json:"tag,omitempty"`
}

func newWebPushPayload(m pushMessage) ([]byte, error) {
	tag := m.notificationID
	if tag == "" {
		// One banner per conversation in the browser: the latest message
		// replaces the previous one rather than stacking up.
		tag = threadIDFor(m.target)
	}
	return json.Marshal(webPushPayload{Title: m.title, Body: m.body, URL: m.actionURL, Tag: tag})
}

// Chat push wording. The lock screen shows it, so it never carries a diary
// value: a food entry is «КБЖУ запись», not its calories.
const (
	chatBodyLimit    = 180
	chatBodyPhoto    = "Фото"
	chatBodyFile     = "Файл"
	chatBodyFood     = "КБЖУ запись"
	chatHiddenPrefix = "Новое сообщение от "
	chatUnnamed      = "Сообщение"
)

// chatBody is what a chat push says about a message.
func chatBody(messageType, content, senderName string, showText bool) string {
	if !showText {
		return chatHiddenPrefix + senderName
	}
	switch messageType {
	case "image":
		return chatBodyPhoto
	case "file":
		return chatBodyFile
	case "food_entry":
		return chatBodyFood
	}
	return truncateRunes(strings.TrimSpace(content), chatBodyLimit)
}

// truncateRunes cuts by characters, not bytes: a Russian letter is two bytes,
// and a cut through one is a broken character on the lock screen.
func truncateRunes(text string, limit int) string {
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return string(runes[:limit-1]) + "…"
}
