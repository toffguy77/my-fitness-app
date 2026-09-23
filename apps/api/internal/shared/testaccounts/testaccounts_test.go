package testaccounts

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestIsTest(t *testing.T) {
	for _, c := range []struct {
		email string
		want  bool
		why   string
	}{
		{"e2e-client@burcev.team", true, "учётка прогона на домене продукта"},
		{"E2E-Curator@Burcev.Team", true, "регистр не должен решать"},
		{"stand-1758@burcev.test", true, "одноразовый домен"},
		{"  e2e-admin@burcev.team  ", true, "пробелы по краям не меняют сути"},
		{"director@burcev.team", false, "тот же домен, но это человек"},
		{"toffguy77@gmail.com", false, "почта владельца"},
		{"e2e-client@example.com", false, "приставка на чужом домене ничего не значит"},
		{"", false, "пустой адрес — не служебный"},
	} {
		if got := IsTest(c.email); got != c.want {
			t.Errorf("IsTest(%q) = %v, ожидалось %v — %s", c.email, got, c.want, c.why)
		}
	}
}

// Шаблон служебных адресов повторён в обвязке прогона: слепок решает по нему,
// что зачищать, а сторож адресов — какие адреса допустимы в проверках.
// Разойдясь, они начнут считать служебным разное, и каждый будет по-своему
// прав.
func TestPatternMatchesTooling(t *testing.T) {
	root := filepath.Join("..", "..", "..", "..", "..")

	snapshot, err := os.ReadFile(filepath.Join(root, "scripts", "e2e-db-snapshot.sh"))
	if err != nil {
		t.Fatalf("не прочитать скрипт слепка: %v", err)
	}
	if !strings.Contains(string(snapshot), "*@burcev.test") ||
		!strings.Contains(string(snapshot), "e2e-*@burcev.team") {
		t.Error("слепок не знает тех же шаблонов, что IsTest: " +
			"ожидались *@burcev.test и e2e-*@burcev.team")
	}
}
