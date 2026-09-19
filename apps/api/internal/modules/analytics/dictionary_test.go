package analytics

import (
	"os"
	"regexp"
	"testing"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Словари обязаны совпадать: сервер отказывает в неизвестном имени, поэтому
// событие, объявленное только на клиенте, молча никогда не приходит — и в
// воронке на его месте дыра, неотличимая от «этого не делали».
func TestEventDictionariesMatch(t *testing.T) {
	fromServer := AllEventNames()

	source, err := os.ReadFile("../../../../web/src/shared/analytics/events.ts")
	require.NoError(t, err)

	re := regexp.MustCompile(`'([a-z_]+)'`)
	fromClient := map[string]bool{}
	for _, m := range re.FindAllStringSubmatch(string(source), -1) {
		fromClient[m[1]] = true
	}

	for _, name := range fromServer {
		if Dictionary[name].ServerOnly {
			// A fact recorded via RecordServerEvent (registered, signed_in,
			// email_verified...) is never sent by a browser — there is
			// nothing for the client dictionary to declare, and requiring
			// one would mean inventing a name nobody calls track() with.
			continue
		}
		assert.True(t, fromClient[name], "имя %q объявлено на сервере и отсутствует на клиенте", name)
	}
	for name := range fromClient {
		assert.Contains(t, fromServer, name, "имя %q объявлено на клиенте и отсутствует на сервере", name)
	}
}

// Свойство, которое нельзя сгруппировать, отвергается на входе.
//
// Структура или карта проходит все остальные проверки, сериализуется в `{}` и
// ложится в таблицу здоровой с виду строкой — но не совпадает ни с одним
// запросом. Воронка провайдеров пустовала именно поэтому: в `method` лежал
// `oauth.Provider`, а не его имя. Отказ здесь превращает метрику, которая
// никогда не наполнится, в строку журнала.
func TestValidate_RefusesAPropertyNoReportCanGroupBy(t *testing.T) {
	err := Validate(Event{
		Name:       EventSignedIn,
		Properties: map[string]any{"method": struct{ Name string }{"yandex"}},
	}, false)

	require.Error(t, err, "объект в method прошёл проверку — метрика останется пустой")
	assert.ErrorIs(t, err, apperrors.ErrValidation)
	assert.Contains(t, err.Error(), "group by")
}

func TestValidate_AcceptsOrdinaryValues(t *testing.T) {
	for _, value := range []any{"yandex", 42, 1.5, true, nil} {
		assert.NoError(t, Validate(Event{
			Name:       EventSignedIn,
			Properties: map[string]any{"method": value},
		}, false), "значение %#v должно приниматься", value)
	}
}
