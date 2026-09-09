package notifications

import (
	"context"
	"fmt"
	"strings"
)

// What a notification says, in the reader's language.
//
// The wording used to sit as a literal at each place that raised one, which
// meant the same event could be phrased two ways depending on which module
// noticed it, and that none of it could be translated.
//
// The text is still stored with the notification rather than rendered when it
// is read. That is deliberate: a notice is a record of something that was said
// at a moment, and re-wording last month's messages because somebody changed
// their language setting would rewrite history. The language is therefore
// chosen once, when the notice is created, from the recipient's own setting.
//
// English is declared and empty, as everywhere else: an untranslated code
// falls back to the Russian wording rather than to an empty notification.

// TextCode names a notification's wording.
type TextCode string

const (
	TextPlanUpdated      TextCode = "plan_updated"
	TextTaskAssigned     TextCode = "task_assigned"
	TextReportReceived   TextCode = "report_received"
	TextCuratorFeedback  TextCode = "curator_feedback"
	TextSupportEscalated TextCode = "support_escalated"
)

type text struct {
	Title   string
	Content string
}

var texts = map[string]map[TextCode]text{
	"ru": {
		TextPlanUpdated: {
			Title: "Обновлен план питания",
			// The targets were in this sentence when the dashboard raised it
			// and missing when the curator module did, for the same event.
			// The fuller one wins: both places have the plan in hand.
			Content: "Ваш куратор обновил план питания на эту неделю: {calories} ккал, {protein} г белка в день",
		},
		TextTaskAssigned: {
			Title:   "Новая задача",
			Content: "Новая задача: {title}",
		},
		TextReportReceived: {
			Title:   "Получен недельный отчет",
			Content: "{name} отправил недельный отчет за неделю {week}",
		},
		TextCuratorFeedback: {
			Title:   "Обратная связь от куратора",
			Content: "Куратор оставил обратную связь по вашему отчёту",
		},
		TextSupportEscalated: {
			Title:   "Обращение ждёт ответа",
			Content: "Бот не смог ответить: {reason}",
		},
	},
	"en": {},
}

// Text returns a notification's title and content in the given language,
// falling back to Russian for anything not translated.
func Text(language string, code TextCode, params map[string]string) (string, string) {
	value, ok := texts[language][code]
	if !ok || value.Title == "" {
		value = texts["ru"][code]
	}
	return interpolate(value.Title, params), interpolate(value.Content, params)
}

func interpolate(s string, params map[string]string) string {
	for name, value := range params {
		s = strings.ReplaceAll(s, "{"+name+"}", value)
	}
	return s
}

// LanguageOf returns the language a person reads the product in.
//
// LEFT JOIN, and a default: an account can exist before its settings row does,
// and a notification must not fail to be written because of that.
func (s *Service) LanguageOf(ctx context.Context, userID int64) string {
	var language string
	err := s.db.QueryRowContext(ctx,
		`SELECT COALESCE(st.language, 'ru')
		 FROM users u LEFT JOIN user_settings st ON st.user_id = u.id
		 WHERE u.id = $1`, userID).Scan(&language)
	if err != nil {
		s.log.Warn("Could not read the language for a notification, using the default",
			"user_id", userID, "error", fmt.Sprint(err))
		return "ru"
	}
	return language
}
