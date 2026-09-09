package email

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// digestSample is one plausible letter: several events of different kinds, one
// without an action link, and a name and content containing the characters a
// template gets wrong when it forgets to escape.
func digestSample() DigestEmailData {
	base := time.Date(2026, 9, 8, 21, 14, 0, 0, time.UTC)
	return DigestEmailData{
		UserEmail: "client@example.com",
		Name:      `Анна <"Мария">`,
		Items: []DigestItemData{
			{
				Title:     "Новое сообщение от куратора",
				Content:   "Посмотрел вашу неделю — по белку недобор, давайте разберём.",
				ActionURL: "https://burcev.team/chat",
				CreatedAt: base,
			},
			{
				Title:     "Куратор отметил ваш прогресс",
				Content:   `Вес за месяц: −2,1 кг. Так держать & не сбавляйте!`,
				ActionURL: "https://burcev.team/dashboard",
				CreatedAt: base.Add(-3 * time.Hour),
			},
			{
				Title:     "Напоминание о взвешивании",
				Content:   "Вы не вносили вес четыре дня.",
				CreatedAt: base.Add(-26 * time.Hour),
			},
		},
		AppURL:         "https://burcev.team",
		UnsubscribeURL: "https://burcev.team/unsubscribe?token=eyJhbGciOi.SIGNED.VALUE",
		SupportEmail:   "support@burcev.team",
	}
}

// The digest is the only letter a person receives without having done anything
// to trigger it, so it is the only one that must carry a way out. A digest
// without a working unsubscribe link is not a design flaw, it is unlawful mail.
func TestDigestTemplateCarriesAWayOut(t *testing.T) {
	body := renderDigest(t, digestSample())

	assert.Contains(t, body, "https://burcev.team/unsubscribe?token=eyJhbGciOi.SIGNED.VALUE",
		"the unsubscribe link must survive rendering intact — a mangled token unsubscribes nobody")
	assert.Contains(t, body, "/settings/notifications",
		"the letter should also offer the narrower choice: change what is sent, not stop everything")
	assert.Contains(t, body, "support@burcev.team")
}

// Every event must appear. A digest that silently drops one is worse than no
// digest: the person believes they have seen everything.
func TestDigestTemplateShowsEveryEvent(t *testing.T) {
	sample := digestSample()
	body := renderDigest(t, sample)

	for _, item := range sample.Items {
		assert.Contains(t, body, item.Title)
	}
	assert.Contains(t, body, "08.09.2026 21:14", "the time should read as a time, not as an RFC-3339 stamp")

	// The item with no action link must not leave an empty "Открыть" behind.
	openings := strings.Count(body, ">Открыть<")
	assert.Equal(t, 2, openings,
		"only the two events that have somewhere to go should offer a link")
}

// Names and message text come from people, and people write angle brackets and
// ampersands. html/template escapes them; this fails if the template is ever
// switched to text/template, which would turn a message into markup.
func TestDigestTemplateEscapesWhatPeopleWrote(t *testing.T) {
	body := renderDigest(t, digestSample())

	assert.NotContains(t, body, `Анна <"Мария">`, "the raw name must not reach the markup")
	assert.Contains(t, body, "Анна &lt;", "the name should be escaped, not dropped")
	assert.Contains(t, body, "&amp; не сбавляйте", "an ampersand in a message is text, not an entity")
}

// renderDigest renders the letter and, when DIGEST_HTML_OUT is set, writes it
// there. The visual check the specification asks for needs a file to open; a
// test that can produce one on request beats a throwaway script that rots.
func renderDigest(t *testing.T, data DigestEmailData) string {
	t.Helper()

	templates, err := parseTemplates()
	require.NoError(t, err)
	s := &Service{fromAddress: "noreply@burcev.team", templates: templates}

	body, err := s.renderTemplateIn(data.Language, "notification_digest", data)
	require.NoError(t, err)
	require.NotEmpty(t, body)

	if out := os.Getenv("DIGEST_HTML_OUT"); out != "" {
		require.NoError(t, os.MkdirAll(filepath.Dir(out), 0o755))
		require.NoError(t, os.WriteFile(out, []byte(body), 0o644))
		t.Logf("письмо записано в %s", out)
	}

	return body
}
