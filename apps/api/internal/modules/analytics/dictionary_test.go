package analytics

import (
	"testing"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

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
