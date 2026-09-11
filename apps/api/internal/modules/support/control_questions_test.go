package support

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ControlQuestions is the set from task 1.3 of the telegram-support-bot
// specification: questions the documentation answers, and questions it
// deliberately does not.
type ControlQuestions struct {
	Covered []struct {
		Question string   `json:"question"`
		Source   string   `json:"source"`
		Anchor   string   `json:"anchor"`
		Expect   []string `json:"expect"`
	} `json:"covered"`
	Uncovered []struct {
		Question string `json:"question"`
		Why      string `json:"why"`
	} `json:"uncovered"`
}

func loadControlQuestions(t *testing.T) ControlQuestions {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "control-questions.json"))
	require.NoError(t, err)

	var set ControlQuestions
	require.NoError(t, json.Unmarshal(raw, &set))
	require.NotEmpty(t, set.Covered)
	require.NotEmpty(t, set.Uncovered)
	return set
}

// The expensive half of the control set — asking a live model — cannot run in
// CI on every push. What can run is the half that rots: a question listed as
// answerable stops being answerable the moment somebody edits the guide, and
// nothing would say so until a person asked the bot and got a refusal.
//
// So each covered question names the file and the phrase it relies on, and this
// checks that the phrase is still there.
func TestControlQuestionsStillMatchTheDocumentation(t *testing.T) {
	set := loadControlQuestions(t)

	for _, q := range set.Covered {
		t.Run(q.Question, func(t *testing.T) {
			body, err := corpusFS.ReadFile(filepath.Join("knowledge", q.Source))
			require.NoError(t, err, "%s is named by the control set but not embedded", q.Source)

			assert.Contains(t, string(body), q.Anchor,
				"the guide no longer contains what this question relies on — "+
					"either the answer moved, or the bot can no longer give it")
		})
	}
}

// A control question that carries no expectation proves nothing when it is run
// against a live model: any answer, including a wrong one, would pass.
func TestCoveredQuestionsCarryAnExpectation(t *testing.T) {
	set := loadControlQuestions(t)

	for _, q := range set.Covered {
		assert.NotEmpty(t, q.Expect, "%q must say what a correct answer contains", q.Question)
		assert.NotEmpty(t, q.Anchor, "%q must name the phrase it relies on", q.Question)
	}
}

// The uncovered half is the more important half. Each entry must say why it is
// out of bounds, because "the guide happens not to mention it" and "the bot must
// never answer this" are different things: the first is fixed by writing
// documentation, the second must survive any amount of it.
func TestUncoveredQuestionsSayWhy(t *testing.T) {
	set := loadControlQuestions(t)

	for _, q := range set.Uncovered {
		assert.NotEmpty(t, q.Why, "%q must say why it is out of bounds", q.Question)
	}
}

// The set is only meaningful if the boundaries it names are the ones the
// instruction actually draws. If the prompt stopped forbidding prices or
// medical advice, the control questions would still be listed as refusals while
// the bot happily answered them.
func TestUncoveredCategoriesAreForbiddenByTheInstruction(t *testing.T) {
	prefix, err := buildPrefix()
	require.NoError(t, err)
	instruction := strings.ToLower(prefix[:strings.Index(prefix, "Ниже — документация продукта.")])

	for _, forbidden := range []string{"цен", "медицинских", "диагнозы"} {
		assert.Contains(t, instruction, forbidden,
			"the control set expects this to be out of bounds, but the instruction no longer says so")
	}
	assert.Contains(t, prefix, EscalationMarker,
		"the instruction must still tell the model how to refuse")
}
