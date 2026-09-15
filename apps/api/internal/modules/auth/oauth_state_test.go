package auth

import "testing"

// Отказ во входе через провайдера обязан называть причину.
//
// «Не совпало состояние» покрывало три разные неисправности, и в журнале они
// выглядели одинаково. Когда вход через Yandex отказал на dev, отличить
// «cookie до нас не доехала» от «человек начал вход дважды» было нечем — а
// чинятся они по-разному: первое наше, второе нет.
func TestStateFailure(t *testing.T) {
	cases := []struct {
		name                                               string
		expectedState, verifier, startedProvider, gotState string
		provider                                           string
		want                                               string
	}{
		{
			name:          "всё сходится — отказа нет",
			expectedState: "s", verifier: "v", startedProvider: "yandex",
			provider: "yandex", gotState: "s",
			want: "",
		},
		{
			name:          "cookie потока не доехали",
			expectedState: "", verifier: "", startedProvider: "",
			provider: "yandex", gotState: "s",
			want: "поток не начинался в этом браузере: cookie потока отсутствуют",
		},
		{
			name:          "состояние от другой попытки",
			expectedState: "старое", verifier: "v", startedProvider: "yandex",
			provider: "yandex", gotState: "новое",
			want: "состояние от другой попытки входа",
		},
		{
			name:          "вернулся другой провайдер",
			expectedState: "s", verifier: "v", startedProvider: "vk",
			provider: "yandex", gotState: "s",
			want: "вернулся другой провайдер: начинали с vk",
		},
		{
			name:          "потерялся только проверочный код",
			expectedState: "s", verifier: "", startedProvider: "yandex",
			provider: "yandex", gotState: "s",
			want: "нет cookie проверочного кода при наличии состояния",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := stateFailure(c.expectedState, c.verifier, c.startedProvider, c.provider, c.gotState)
			if got != c.want {
				t.Fatalf("получено %q, ожидалось %q", got, c.want)
			}
		})
	}
}

// Одноразовый секрет потока не должен попадать в причину: она идёт в журнал.
func TestStateFailureKeepsTheSecretOut(t *testing.T) {
	secret := "очень-секретное-состояние"
	reason := stateFailure(secret, "v", "yandex", "yandex", "другое")
	if reason == "" {
		t.Fatal("отказ ожидался")
	}
	if contains(reason, secret) || contains(reason, "другое") {
		t.Fatalf("состояние протекло в журнал: %q", reason)
	}
}

func contains(haystack, needle string) bool {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
