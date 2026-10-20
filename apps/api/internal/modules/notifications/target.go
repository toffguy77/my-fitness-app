package notifications

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strings"
)

// TargetKind names a screen of the application, independent of the web path
// that happens to show it today.
type TargetKind string

// Screens a notification or a push can open. The web keeps using actionUrl;
// the iPhone app reads this, because web paths change with the web (it already
// happened with /curator/clients/:id?tab=) and some carry no id at all.
const (
	TargetChat                TargetKind = "chat"
	TargetTask                TargetKind = "task"
	TargetWeeklyFeedback      TargetKind = "weekly_feedback"
	TargetPlan                TargetKind = "plan"
	TargetClient              TargetKind = "client"
	TargetSupportConversation TargetKind = "support_conversation"
	TargetLead                TargetKind = "lead"
	TargetArticle             TargetKind = "article"
	TargetExport              TargetKind = "export"
	TargetNotifications       TargetKind = "notifications"
)

// Target is where a notification leads: a screen and the ids it needs. Every
// id is a string — a uuid or a decimal user id — so the app parses one shape.
type Target struct {
	Kind TargetKind        `json:"kind"`
	IDs  map[string]string `json:"ids,omitempty"`
}

// IDs is shorthand for the ids a caller supplies; the kind follows from the
// notification type.
type IDs = map[string]string

// targetKinds maps every notification type to the screen it opens.
//
// TestEveryTypeHasATargetKind fails on a type missing here: a type without a
// screen would open the notification list on the phone, silently.
var targetKinds = map[NotificationType]TargetKind{
	TypeTrainerFeedback:     TargetWeeklyFeedback,
	TypeFeedbackReceived:    TargetWeeklyFeedback,
	TypeTaskAssigned:        TargetTask,
	TypeTaskOverdue:         TargetTask,
	TypePlanUpdated:         TargetPlan,
	TypeSupportEscalated:    TargetSupportConversation,
	TypeCuratorRequested:    TargetLead,
	TypeClientLeft:          TargetClient,
	TypeNewContent:          TargetArticle,
	TypeExportReady:         TargetExport,
	TypeChatMessage:         TargetChat,
	TypeAchievement:         TargetNotifications,
	TypeReminder:            TargetNotifications,
	TypeSystemUpdate:        TargetNotifications,
	TypeNewFeature:          TargetNotifications,
	TypeGeneral:             TargetNotifications,
	TypeCuratorAccessEnding: TargetNotifications,
	TypeCuratorAccessEnded:  TargetNotifications,
}

// requiredIDs is what each screen cannot open without.
var requiredIDs = map[TargetKind][]string{
	TargetChat:                {"conversation_id", "participant_id"},
	TargetTask:                {"task_id"},
	TargetWeeklyFeedback:      {"report_id"},
	TargetPlan:                {"plan_id"},
	TargetClient:              {"client_id"},
	TargetSupportConversation: {"conversation_id"},
	TargetLead:                {"lead_id"},
	TargetArticle:             {"article_id", "slug"},
	TargetExport:              {"export_id"},
	TargetNotifications:       nil,
}

// TargetKindFor returns the screen a notification type opens.
func TargetKindFor(t NotificationType) TargetKind {
	if kind, ok := targetKinds[t]; ok {
		return kind
	}
	return TargetNotifications
}

// resolveTarget fills the kind from the type and checks the ids. A target
// missing an id it needs falls back to the notification list: a push that
// opens the list is worse than one that opens the screen, but better than one
// that opens a screen with nothing on it. The second result names what was
// missing, for the log.
func resolveTarget(t NotificationType, ids map[string]string) (Target, string) {
	kind := TargetKindFor(t)
	if kind == TargetNotifications {
		return Target{Kind: TargetNotifications}, ""
	}
	var missing []string
	for _, key := range requiredIDs[kind] {
		if strings.TrimSpace(ids[key]) == "" {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		return Target{Kind: TargetNotifications}, strings.Join(missing, ",")
	}
	return Target{Kind: kind, IDs: ids}, ""
}

// Value stores the target in notifications.target (jsonb).
func (t Target) Value() (driver.Value, error) {
	if t.Kind == "" {
		t.Kind = TargetNotifications
	}
	data, err := json.Marshal(t)
	if err != nil {
		return nil, err
	}
	return string(data), nil
}

// Scan reads notifications.target.
func (t *Target) Scan(src any) error {
	var data []byte
	switch v := src.(type) {
	case nil:
		*t = Target{Kind: TargetNotifications}
		return nil
	case []byte:
		data = v
	case string:
		data = []byte(v)
	default:
		return fmt.Errorf("scan target: unexpected %T", src)
	}
	var decoded Target
	if err := json.Unmarshal(data, &decoded); err != nil {
		return fmt.Errorf("scan target: %w", err)
	}
	if decoded.Kind == "" {
		decoded.Kind = TargetNotifications
	}
	*t = decoded
	return nil
}
