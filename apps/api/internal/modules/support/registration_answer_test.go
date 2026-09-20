package support

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Without this section the bot honestly tells an unregistered visitor it does
// not know why they'd register — and the widget loses its point. The answer
// goes into the guide, not the prompt: "answer strictly from the guide" is
// the only thing standing between the bot and making something up.
//
// The words "аккаунт", "куратор" and "дневник" already appear scattered
// across the existing corpus (account deletion in the FAQ, the curator chat
// article, the diary article's own title) — so a check for their bare
// presence would pass today without answering the actual question. What is
// missing today is the comparison itself: a place that says what a guest
// gets without an account and what an account adds on top of it. That is
// what this test looks for.
func TestKnowledgeAnswersWhyRegister(t *testing.T) {
	prefix, err := buildPrefix()
	require.NoError(t, err)

	text := strings.ToLower(prefix)

	assert.Contains(t, text, "аккаунт")
	assert.Contains(t, text, "куратор")
	assert.Contains(t, text, "дневник")

	// The actual "why register" answer: a phrase that only exists once the
	// guide states the without-account / with-account split explicitly.
	assert.Contains(t, text, "без аккаунта",
		"the guide must say what is available without an account")
	assert.Contains(t, text, "зачем нужен аккаунт",
		"the guide must have a section that answers the question by name")
}
