package auth

import (
	"errors"
	"strings"
	"testing"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Человеку — причины, и только они.
//
// Раньше причины склеивались в сообщение вместе с обёрткой, и на проде
// отказ выглядел так:
//
//	пароль не соответствует требованиям: [Пароль должен содержать хотя бы одну
//	цифру]: password does not meet policy
//
// Английский хвост внутренней ошибки и квадратные скобки из вывода Go — в
// тексте, который читает человек, пытающийся придумать пароль.
func TestPolicyErrorShowsOnlyTheReasons(t *testing.T) {
	err := &PolicyError{Reasons: []string{
		"Пароль должен содержать хотя бы одну цифру",
		"Пароль должен содержать хотя бы одну заглавную букву",
	}}

	message := err.ForPerson()

	assert.Contains(t, message, "хотя бы одну цифру")
	assert.Contains(t, message, "хотя бы одну заглавную букву")
	assert.NotContains(t, message, "password does not meet policy",
		"внутренний текст ошибки не для читающего")
	assert.NotContains(t, message, "[", "квадратные скобки — это вывод Go, а не язык")
	assert.NotContains(t, message, "%!", "незакрытый формат означает потерянную причину")
}

// errors.Is продолжает работать: вызывающему часто достаточно знать, что дело
// в политике, и менять это ради красоты сообщения было бы плохой сделкой.
func TestPolicyErrorStaysRecognisable(t *testing.T) {
	var err error = &PolicyError{Reasons: []string{"слишком короткий"}}

	require.True(t, errors.Is(err, apperrors.ErrPasswordPolicy))

	var policy *PolicyError
	require.True(t, errors.As(err, &policy))
	assert.Equal(t, []string{"слишком короткий"}, policy.Reasons)
}

// Пустой список причин не должен превращаться в сообщение без содержания.
func TestPolicyErrorWithoutReasonsStillSaysSomething(t *testing.T) {
	message := (&PolicyError{}).ForPerson()
	assert.NotEmpty(t, strings.TrimSpace(message))
}
