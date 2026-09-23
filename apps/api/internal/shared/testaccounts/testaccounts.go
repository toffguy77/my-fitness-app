// Package testaccounts отвечает на один вопрос: служебная ли это учётная
// запись прогона.
//
// Признак нужен в трёх местах сразу — при автоназначении куратора, при смене
// роли и при старте, — и он обязан быть один. Три копии одного правила
// разойдутся при первой же правке шаблона, и разойдутся молча.
//
// Тот же шаблон знают scripts/e2e-db-snapshot.sh (что зачищать) и
// scripts/check-e2e-guest-emails.mjs (какие адреса допустимы в проверках).
// Совпадение стережёт TestPatternMatchesTooling.
package testaccounts

import "strings"

// Домен, не существующий в интернете: адреса на нём никому не принадлежат.
const disposableDomain = "@burcev.test"

// Приставка для учёток прогона на настоящем домене продукта.
const runPrefix = "e2e-"

const productDomain = "@burcev.team"

// IsTest сообщает, заведена ли учётка для проверок.
//
// Служебная учётка не должна ни получать клиентов, ни повышаться в правах:
// на проде такие живут постоянно (иначе их пришлось бы заводить перед каждым
// прогоном, а на регистрацию стоит предел пять в час), и без этой проверки
// пустой тестовый куратор оказывается первым в очереди на нового клиента —
// назначение выбирает наименее загруженного.
func IsTest(email string) bool {
	normalized := strings.ToLower(strings.TrimSpace(email))
	if strings.HasSuffix(normalized, disposableDomain) {
		return true
	}
	return strings.HasPrefix(normalized, runPrefix) && strings.HasSuffix(normalized, productDomain)
}
