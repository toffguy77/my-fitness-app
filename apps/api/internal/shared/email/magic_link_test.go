package email

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Письмо различается по тексту, хотя ответ эндпоинта — нет: различие в ответе
// выдало бы наличие аккаунта, различие в письме видит только владелец ящика.
// Разница — это два имени шаблона (magic_link_signin / magic_link_signup), а
// не один шаблон с условием внутри: тема письма выбирается по имени шаблона
// через subjectFor, и у входа с созданием аккаунта темы разные.
func TestMagicLinkEmailDistinguishesSignInFromSignUp(t *testing.T) {
	templates, err := parseTemplates()
	require.NoError(t, err)
	s := &Service{fromAddress: "noreply@burcev.team", templates: templates}

	data := MagicLinkEmailData{
		UserEmail:    "user@example.com",
		MagicLinkURL: "https://burcev.team/auth/link/consume?token=abc",
		ExpiresAt:    time.Date(2026, 9, 17, 21, 0, 0, 0, time.UTC),
		SupportEmail: "support@burcev.team",
	}

	signIn, err := s.renderTemplateIn(LanguageRU, "magic_link_signin", data)
	require.NoError(t, err)
	signUp, err := s.renderTemplateIn(LanguageRU, "magic_link_signup", data)
	require.NoError(t, err)

	assert.Contains(t, signIn, "Вход")
	assert.Contains(t, signUp, "аккаунт")
	assert.NotEqual(t, signIn, signUp)

	// Транзакционное письмо: ссылки отписки в нём быть не должно — отписаться
	// от собственного входа нельзя.
	assert.NotContains(t, signIn, "Отписаться")
	assert.NotContains(t, signUp, "Отписаться")

	// Срок называется прямо: человек должен понимать, почему ссылка перестала
	// работать, не запрашивая новую наугад.
	assert.Contains(t, signIn, "15 минут")
	assert.Contains(t, signUp, "15 минут")
}

// Тема письма выбирается по имени шаблона — это и есть причина, по которой
// вариант письма обязан быть отдельным именем, а не веткой внутри одного.
func TestMagicLinkSubjectDependsOnOutcome(t *testing.T) {
	signIn := subjectFor(LanguageRU, "magic_link_signin")
	signUp := subjectFor(LanguageRU, "magic_link_signup")

	assert.NotEqual(t, signIn, signUp)
	assert.NotEmpty(t, signIn)
	assert.NotEmpty(t, signUp)
}
