package main

import (
	"strings"
	"testing"
)

// Журнал запуска обязан называть ту базу, к которой подключились.
//
// Печатались разрозненные DB_*, а подключение при заданном DATABASE_URL идёт по
// URL. На локальном стенде это выглядело как «подключено к web-app-db на
// продовом хосте» при подключении к localhost. По такой строке и идут, когда
// разбирают инцидент.
func TestDescribeDSN(t *testing.T) {
	cases := []struct {
		name, dsn, host, database string
	}{
		{
			name:     "обычная строка подключения",
			dsn:      "postgres://burcev:burcev@localhost:5432/burcev_e2e?sslmode=disable",
			host:     "localhost:5432",
			database: "burcev_e2e",
		},
		{
			name:     "управляемая база с двумя хостами",
			dsn:      "postgres://user:pass@rc1d-abc.mdb.yandexcloud.net:6432/web-app-db-dev",
			host:     "rc1d-abc.mdb.yandexcloud.net:6432",
			database: "web-app-db-dev",
		},
		{
			// Пароль со спецсимволами обязан быть закодирован; если нет —
			// честнее сказать «не разобрал», чем напечатать что попало.
			name:     "нечитаемая строка не роняет и не молчит",
			dsn:      "это не строка подключения",
			host:     "(не разобрал строку подключения)",
			database: "(не разобрал строку подключения)",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			host, database := describeDSN(c.dsn)
			if host != c.host || database != c.database {
				t.Fatalf("получено %q/%q, ожидалось %q/%q", host, database, c.host, c.database)
			}
		})
	}
}

// Пароль из строки подключения не должен попадать в журнал.
func TestDescribeDSNKeepsCredentialsOut(t *testing.T) {
	host, database := describeDSN("postgres://burcev:ochen-sekretnyi-parol@db:5432/burcev")
	for _, got := range []string{host, database} {
		if got == "" {
			t.Fatal("пусто")
		}
		if strings.Contains(got, "ochen-sekretnyi-parol") || strings.Contains(got, "burcev:") {
			t.Fatalf("учётные данные протекли в журнал: %q", got)
		}
	}
}
