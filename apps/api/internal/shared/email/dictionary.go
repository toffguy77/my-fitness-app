package email

// What a letter says, in the recipient's language.
//
// The templates were written in Russian and addressed everyone that way. This
// is the seam a translation goes through: a language names a set of subjects
// and templates, and anything it does not carry falls back to Russian rather
// than to an empty letter.
//
// English is declared and empty on purpose, mirroring the frontend dictionary:
// nothing here has been translated, and inventing the wording is the product
// owner's call, not this file's. Filling it in is the whole procedure — no
// changes to the senders.

// LanguageRU is the language every letter is written in today, and the one
// anything untranslated falls back to.
const LanguageRU = "ru"

// subjects, by language then by template name.
var subjects = map[string]map[string]string{
	LanguageRU: {
		"password_reset":      "Запрос на сброс пароля - BURCEV",
		"password_changed":    "Пароль изменен - BURCEV",
		"onboarding_reminder": "Ваш расчёт КБЖУ сохранён — BURCEV",
		"email_verification":  "Код подтверждения — BURCEV",
		"notification_digest": "%s в BURCEV",
	},
	"en": {},
}

// bodies, by language then by template name. A language that does not carry a
// body reuses the Russian one, so a half-translated letter is still a letter.
var bodies = map[string]map[string]string{
	LanguageRU: {
		"password_reset":      passwordResetTemplate,
		"password_changed":    passwordChangedTemplate,
		"email_verification":  emailVerificationTemplate,
		"onboarding_reminder": onboardingReminderTemplate,
		"notification_digest": notificationDigestTemplate,
	},
	"en": {},
}

// subjectFor returns the subject line for a template, in the given language.
func subjectFor(language, templateName string) string {
	if set, ok := subjects[language]; ok {
		if value, ok := set[templateName]; ok && value != "" {
			return value
		}
	}
	return subjects[LanguageRU][templateName]
}

// bodyFor returns the template text for a template, in the given language.
func bodyFor(language, templateName string) string {
	if set, ok := bodies[language]; ok {
		if value, ok := set[templateName]; ok && value != "" {
			return value
		}
	}
	return bodies[LanguageRU][templateName]
}
