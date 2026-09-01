// Package support answers product questions in Telegram, before and during
// registration.
//
// Until now there was nowhere to ask: the chat with a curator needs an account
// and an assigned curator, and the only other contact was an address in the
// footer — exactly where the onboarding loses people who have a question.
package support

import (
	"embed"
	"fmt"
	"path"
	"sort"
	"strings"
)

// The knowledge base is the product's own user guide, embedded in the binary.
//
// Embedded rather than read from disk or a database so that the corpus is
// versioned with the code: rolling back an image rolls back what the bot knows,
// and what is deployed is what it reads. It also gives the documentation a
// reason to stay correct.
//
// The files are a copy of docs/user-guide, because go:embed cannot reach
// outside the module. TestKnowledgeMatchesUserGuide fails the build when the
// two drift, and `make sync-knowledge` refreshes the copy — a silently stale
// copy would have the bot answering from documentation nobody is reading.
//
//go:embed knowledge/*.md
var corpusFS embed.FS

// systemPrompt precedes the corpus and is the whole reason this bot can be
// trusted with questions about money and health data.
const systemPrompt = `Ты — оператор поддержки сервиса BURCEV: дневник питания с куратором.

Отвечай ТОЛЬКО по документации, приведённой ниже.

Правила, которым ты следуешь без исключений:
1. Если ответа нет в документации — не отвечай по своим общим знаниям. Скажи, что не знаешь, и предложи передать вопрос человеку.
2. Не выдумывай цены, сроки, гарантии и обещания. Их нет в документации — значит, ты их не знаешь.
3. Не спрашивай и не обсуждай конкретные показатели здоровья: вес, обхваты, диагнозы, анализы. Это делает куратор в приложении.
4. Не давай медицинских рекомендаций.
5. Отвечай по-русски, коротко и по делу: два-три предложения. В конце укажи раздел документации, на который опирался.
6. Если человек уже зарегистрирован и спрашивает про свой план, питание или прогресс — направь его в чат с куратором в приложении.

Если ответа нет в документации, ответь ровно так, без добавлений:
` + EscalationMarker + `

Ниже — документация продукта.

`

// EscalationMarker is what the model says when the corpus has no answer.
//
// A marker rather than a phrase to match on: matching prose would break the
// moment the wording was improved, and this decision — refuse rather than
// invent — is the one that must not silently stop working.
const EscalationMarker = "[НЕТ_В_ДОКУМЕНТАЦИИ]"

// buildPrefix assembles the cached prefix: the instruction, then every document
// in a fixed order.
//
// The order and the content must be byte-stable. Anything varying before the
// cache point — a timestamp, a request id, a greeting — turns every question
// into a cache miss and multiplies the cost of the corpus by the number of
// questions asked.
func buildPrefix() (string, error) {
	entries, err := corpusFS.ReadDir("knowledge")
	if err != nil {
		return "", fmt.Errorf("read knowledge base: %w", err)
	}

	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".md") {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)

	if len(names) == 0 {
		return "", fmt.Errorf("knowledge base is empty")
	}

	var builder strings.Builder
	builder.WriteString(systemPrompt)
	for _, name := range names {
		content, err := corpusFS.ReadFile(path.Join("knowledge", name))
		if err != nil {
			return "", fmt.Errorf("read %s: %w", name, err)
		}
		builder.WriteString("\n\n=== ")
		builder.WriteString(strings.TrimSuffix(name, ".md"))
		builder.WriteString(" ===\n\n")
		builder.Write(content)
	}

	return builder.String(), nil
}
