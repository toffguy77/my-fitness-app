package notifications

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// notification-targets «Каждый тип уведомления сопоставлен виду адреса»: тип,
// объявленный в types.go без записи в targetKinds, валит тест с его именем.
// Список типов читается из исходника, а не повторяется здесь.
func TestEveryTypeHasATargetKind(t *testing.T) {
	for _, name := range allKnownTypeStrings(t) {
		kind, ok := targetKinds[NotificationType(name)]
		if !assert.Truef(t, ok, "notification type %q has no target kind in targetKinds", name) {
			continue
		}
		_, known := requiredIDs[kind]
		assert.Truef(t, known, "target kind %q of type %q lists no required ids", kind, name)
	}
}

// Перечень видов из спеки — ровно тот, что объявлен.
func TestTargetKindsAreTheSpecifiedList(t *testing.T) {
	kinds := []string{}
	for kind := range requiredIDs {
		kinds = append(kinds, string(kind))
	}
	assert.ElementsMatch(t, []string{
		"chat", "task", "weekly_feedback", "plan", "client",
		"support_conversation", "lead", "article", "export", "notifications",
	}, kinds)
}

func TestResolveTargetFillsKindFromType(t *testing.T) {
	target, missing := resolveTarget(TypeFeedbackReceived, IDs{"report_id": "r-1"})
	assert.Empty(t, missing)
	assert.Equal(t, Target{Kind: TargetWeeklyFeedback, IDs: IDs{"report_id": "r-1"}}, target)

	target, _ = resolveTarget(TypeTaskAssigned, IDs{"task_id": "t-1", "task_type": "habit"})
	assert.Equal(t, TargetTask, target.Kind)
	assert.Equal(t, "t-1", target.IDs["task_id"])

	// Тип без экрана ведёт в список уведомлений, переданные id отбрасываются.
	target, missing = resolveTarget(TypeCuratorAccessEnded, IDs{"x": "y"})
	assert.Empty(t, missing)
	assert.Equal(t, Target{Kind: TargetNotifications}, target)
}

// Адрес без нужного id не открывает пустой экран, а ведёт в список.
func TestResolveTargetFallsBackWhenAnIDIsMissing(t *testing.T) {
	target, missing := resolveTarget(TypeNewContent, IDs{"article_id": "a-1"})
	assert.Equal(t, "slug", missing)
	assert.Equal(t, Target{Kind: TargetNotifications}, target)
}

// «Старая запись»: колонка со значением по умолчанию читается как
// {kind: "notifications"} и так же сериализуется — без ids.
func TestTargetScanAndJSON(t *testing.T) {
	var target Target
	require.NoError(t, target.Scan([]byte(`{"kind":"notifications"}`)))
	data, err := json.Marshal(target)
	require.NoError(t, err)
	assert.JSONEq(t, `{"kind":"notifications"}`, string(data))

	require.NoError(t, target.Scan(`{"kind":"task","ids":{"task_id":"t-1"}}`))
	assert.Equal(t, Target{Kind: TargetTask, IDs: IDs{"task_id": "t-1"}}, target)

	require.NoError(t, target.Scan(nil))
	assert.Equal(t, TargetNotifications, target.Kind)

	value, err := Target{}.Value()
	require.NoError(t, err)
	assert.JSONEq(t, `{"kind":"notifications"}`, value.(string))
}

// GET /notifications отдаёт target у каждой записи, в camelCase-ответе — под
// ключом target.
func TestGetNotificationsReturnsTarget(t *testing.T) {
	handler, service := setupTestHandlerWithMock()
	service.On("GetNotifications", mock.Anything, int64(1), CategoryMain, 10, 0).
		Return(&GetNotificationsResponse{Notifications: []Notification{
			{ID: "n-1", UserID: 1, Category: CategoryMain, Type: TypeFeedbackReceived, Title: "T", Content: "C",
				CreatedAt: time.Now(), Target: Target{Kind: TargetWeeklyFeedback, IDs: IDs{"report_id": "r-1"}}},
			{ID: "n-2", UserID: 1, Category: CategoryMain, Type: TypeGeneral, Title: "T", Content: "C",
				CreatedAt: time.Now(), Target: Target{Kind: TargetNotifications}},
		}, Total: 2}, nil)

	router := gin.New()
	router.GET("/notifications", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetNotifications(c)
	})
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/notifications?category=main&limit=10&offset=0", nil))
	require.Equal(t, http.StatusOK, w.Code)

	var body struct {
		Data struct {
			Notifications []struct {
				Target json.RawMessage `json:"target"`
			} `json:"notifications"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	require.Len(t, body.Data.Notifications, 2)
	assert.JSONEq(t, `{"kind":"weekly_feedback","ids":{"report_id":"r-1"}}`, string(body.Data.Notifications[0].Target))
	assert.JSONEq(t, `{"kind":"notifications"}`, string(body.Data.Notifications[1].Target))
}
