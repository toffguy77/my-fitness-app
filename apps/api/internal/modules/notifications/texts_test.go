package notifications

import "testing"

func TestNotificationTexts(t *testing.T) {
	t.Run("an untranslated language reads as Russian", func(t *testing.T) {
		title, content := Text("en", TextCuratorFeedback, nil)
		ruTitle, ruContent := Text("ru", TextCuratorFeedback, nil)
		if title != ruTitle || content != ruContent {
			t.Fatalf("en = %q/%q, want the Russian wording", title, content)
		}
	})

	t.Run("a translated code is used, and only that one", func(t *testing.T) {
		texts["en"][TextCuratorFeedback] = text{Title: "Feedback", Content: "Your curator replied"}
		defer delete(texts["en"], TextCuratorFeedback)

		title, _ := Text("en", TextCuratorFeedback, nil)
		if title != "Feedback" {
			t.Fatalf("title = %q", title)
		}
		other, _ := Text("en", TextPlanUpdated, nil)
		ruOther, _ := Text("ru", TextPlanUpdated, nil)
		if other != ruOther {
			t.Fatalf("plan_updated = %q, want the Russian wording", other)
		}
	})

	t.Run("values are interpolated", func(t *testing.T) {
		_, content := Text("ru", TextTaskAssigned, map[string]string{"title": "Взвеситься"})
		if content != "Новая задача: Взвеситься" {
			t.Fatalf("content = %q", content)
		}
	})

	// The same event was phrased two ways: the dashboard put the targets in the
	// sentence and the curator module did not. One wording now, and it is the
	// one that says something.
	t.Run("a plan update names the targets", func(t *testing.T) {
		_, content := Text("ru", TextPlanUpdated, map[string]string{"calories": "2000", "protein": "150"})
		if content != "Ваш куратор обновил план питания на эту неделю: 2000 ккал, 150 г белка в день" {
			t.Fatalf("content = %q", content)
		}
	})

	t.Run("every code has a Russian wording", func(t *testing.T) {
		for _, code := range []TextCode{TextPlanUpdated, TextTaskAssigned, TextReportReceived, TextCuratorFeedback} {
			title, content := Text("ru", code, nil)
			if title == "" || content == "" {
				t.Errorf("code %q has no wording", code)
			}
		}
	})

	t.Run("English ships empty", func(t *testing.T) {
		if len(texts["en"]) != 0 {
			t.Fatal("en should carry nothing until somebody translates it")
		}
	})
}
