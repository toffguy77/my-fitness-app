package testsupport

import (
	"database/sql/driver"
	"reflect"
)

// SliceConverter учит sqlmock принимать срез как один параметр.
//
// database/sql проверяет типы аргументов своим конвертером ещё до драйвера, и
// срез он отбраковывает. Настоящий драйвер до этого не доходит: pgx объявляет
// CheckNamedValue и разбирает срез сам, превращая его в массив Postgres — на
// этом стоит весь «= ANY($1)».
//
// Без этого мок строже драйвера, и запрос, прекрасно работающий на живой базе,
// падает только под мок. Строгость не в ту сторону: она не ловит дефекты, а
// запрещает правильный код. Конвертер пропускает срезы как есть и всё
// остальное отдаёт конвертеру по умолчанию.
//
// Срез байт — исключение: это готовое значение драйвера, а не список
// параметров, и трогать его нельзя.
type SliceConverter struct{}

func (SliceConverter) ConvertValue(v any) (driver.Value, error) {
	if b, ok := v.([]byte); ok {
		return b, nil
	}
	if v != nil && reflect.TypeOf(v).Kind() == reflect.Slice {
		return v, nil
	}
	return driver.DefaultParameterConverter.ConvertValue(v)
}
