package support

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	nutritioncalc "github.com/burcev/api/internal/modules/nutrition-calc"
)

// Руководство пользователя — корпус телеграм-бота поддержки: он отвечает строго
// по нему и ничего сверх него не говорит. Значит два раздела, отвечающие на один
// вопрос по-разному, — это бот, дающий разные ответы на один вопрос.
//
// Оба расхождения ниже нашёл пользователь, а не сборка:
//
//  1. «Частые вопросы» называли формулу Харриса-Бенедикта, «Отслеживание
//     прогресса» — Mifflin-St Jeor. Считает код по Миффлину, то есть неверен был
//     FAQ. Заодно в том же ответе стояла корректировка «TDEE − 500 / + 300
//     ккал» вместо −15/+15 % и не упоминался бонус за тренировку.
//  2. «Зачем нужен аккаунт» говорил «Расчёт разовый: он не сохраняется»,
//     «Начало работы» — «Расчёт сохранится за этим адресом». Правда посередине:
//     к профилю не привязывается, за оставленной почтой сохраняется.
//
// Список отвергнутых утверждений узкий намеренно. Сторож, падающий на невинном
// тексте, отключают; разбирать markdown и сверять числа с кодом автоматически —
// тест сложнее того, что он проверяет, и падающий от переноса строки.
const guideDir = "../../../../../docs/user-guide"

func readGuide(t *testing.T) map[string]string {
	t.Helper()

	entries, err := os.ReadDir(guideDir)
	require.NoError(t, err, "docs/user-guide must exist")

	files := make(map[string]string)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		body, err := os.ReadFile(filepath.Join(guideDir, entry.Name()))
		require.NoError(t, err)
		files[entry.Name()] = string(body)
	}
	require.NotEmpty(t, files, "руководство пусто — проверка прошла бы вхолостую")
	return files
}

func TestGuideNamesTheImplementedFormula(t *testing.T) {
	files := readGuide(t)

	// Название берётся из кода: переименование формулы там ломает этот тест,
	// а не оставляет руководство с прежним словом.
	mentions := 0
	for name, body := range files {
		if strings.Contains(body, nutritioncalc.BMRFormulaName) {
			mentions++
			continue
		}
		assert.NotContains(t, body, "Харрис",
			"%s называет другую формулу: код считает по %s", name, nutritioncalc.BMRFormulaName)
		assert.NotContains(t, body, "харрис",
			"%s называет другую формулу: код считает по %s", name, nutritioncalc.BMRFormulaName)
	}
	assert.Greater(t, mentions, 0,
		"ни один раздел не называет формулу %s — на вопрос о норме калорий боту отвечать нечем",
		nutritioncalc.BMRFormulaName)
}

func TestGuideDescribesTheCalculationOnce(t *testing.T) {
	files := readGuide(t)

	// Подробное описание живёт в одном разделе; остальные ссылаются на него.
	// Два описания одного расчёта и разошлись.
	detailed := 0
	for name, body := range files {
		if strings.Contains(body, "Шаг 1") || strings.Contains(body, "Шаг 2") {
			detailed++
			assert.Contains(t, body, "бонус за тренировку",
				"%s описывает шаги расчёта, но молчит про прибавку за записанную тренировку", name)
			assert.Contains(t, body, "-15%",
				"%s описывает шаги расчёта, но не называет модификатор цели в процентах", name)
		}
	}
	assert.Equal(t, 1, detailed,
		"подробное описание расчёта должно быть ровно в одном разделе, найдено в %d", detailed)

	for name, body := range files {
		for _, stale := range []string{"TDEE - 500", "TDEE + 300", "TDEE − 500", "TDEE + 300 ккал"} {
			assert.NotContains(t, body, stale,
				"%s называет корректировку цели в килокалориях; в коде она в процентах", name)
		}
	}
}

func TestGuideDoesNotDenyThatTheGuestCalculationIsSaved(t *testing.T) {
	files := readGuide(t)

	for name, body := range files {
		assert.NotContains(t, body, "он не сохраняется",
			"%s отрицает сохранение гостевого расчёта: за оставленной почтой он сохраняется, "+
				"и «Начало работы» это обещает", name)
		assert.NotContains(t, body, "Расчёт разовый",
			"%s называет гостевой расчёт разовым без оговорки об оставленной почте", name)
	}

	account := files["09-зачем-нужен-аккаунт.md"]
	require.NotEmpty(t, account, "раздел «Зачем нужен аккаунт» не найден")
	assert.Contains(t, account, "сохранится за этим адресом",
		"раздел про аккаунт должен говорить то же, что «Начало работы»: оставленная почта сохраняет расчёт")
	assert.Contains(t, account, "К профилю расчёт не привязывается",
		"раздел про аккаунт должен сохранить верную часть прежнего утверждения")
}

func TestGuideReferencesExistingSections(t *testing.T) {
	files := readGuide(t)

	// FAQ теперь отправляет за подробностями в другой раздел. Ссылка по
	// названию, а не по файлу, поэтому проверяем, что раздел с таким
	// заголовком действительно есть.
	faq := files["08-частые-вопросы.md"]
	require.NotEmpty(t, faq)
	require.Contains(t, faq, "«Отслеживание прогресса»")

	progress := files["03-отслеживание-прогресса.md"]
	require.NotEmpty(t, progress, "FAQ ссылается на «Отслеживание прогресса», а раздела нет")
	assert.Contains(t, progress, "Расчет калорий (КБЖУ)",
		"FAQ отправляет в часть «Расчет калорий (КБЖУ)», а такого заголовка в разделе нет")
}

// Работа с куратором стала платной услугой, и руководство — единственный
// источник ответов бота. Устаревшее утверждение означает, что бот обещает
// бесплатному пользователю куратора, которого у него нет, — то есть сам создаёт
// обращение в поддержку вместо продажи.
func TestGuideCallsCuratorAccessPaid(t *testing.T) {
	files := readGuide(t)

	// Отвергается именно прежнее утверждение, а не любое упоминание
	// автоматизма: список узкий намеренно — сторож, падающий на невинном
	// тексте, отключают.
	for name, body := range files {
		assert.NotContains(t, body, "автоматически назначает тебе куратора",
			"%s обещает куратора при регистрации: работа с куратором платная", name)
		assert.NotContains(t, body, "автоматически назначается персональный куратор",
			"%s обещает куратора при регистрации: работа с куратором платная", name)
	}

	paid := 0
	for _, body := range files {
		if strings.Contains(body, "платная услуга") {
			paid++
		}
	}
	assert.Greater(t, paid, 0,
		"ни один раздел не называет работу с куратором платной — на вопрос «как получить куратора» боту отвечать нечем")
}

// Написанное человеком не становится недоступным ему из-за окончания оплаты, и
// об этом нужно сказать: иначе первый же, у кого кончился доступ, решит, что
// переписка удалена.
func TestGuideSaysHistoryStaysReadable(t *testing.T) {
	files := readGuide(t)

	found := false
	for _, body := range files {
		if strings.Contains(body, "остаётся открытой для чтения") {
			found = true
		}
	}
	assert.True(t, found,
		"руководство не говорит, что прежняя переписка остаётся доступной для чтения")
}
