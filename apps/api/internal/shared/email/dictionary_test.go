package email

import "testing"

// Adding a language must be a matter of filling in this file: the senders ask
// for the recipient's language and take what they get, so a translation that
// covers half the letters still leaves the other half readable.
func TestLettersFallBackToRussian(t *testing.T) {
	t.Run("an untranslated language reads as Russian", func(t *testing.T) {
		if got := subjectFor("en", "password_reset"); got != subjects[LanguageRU]["password_reset"] {
			t.Fatalf("subject = %q, want the Russian one", got)
		}
		if got := bodyFor("en", "password_reset"); got != passwordResetTemplate {
			t.Fatal("body should fall back to the Russian template")
		}
	})

	t.Run("a translated subject is used", func(t *testing.T) {
		subjects["en"]["password_reset"] = "Reset your password - BURCEV"
		defer delete(subjects["en"], "password_reset")

		if got := subjectFor("en", "password_reset"); got != "Reset your password - BURCEV" {
			t.Fatalf("subject = %q", got)
		}
		// And only that one: the rest still read as Russian.
		if got := subjectFor("en", "password_changed"); got != subjects[LanguageRU]["password_changed"] {
			t.Fatalf("password_changed = %q, want the Russian one", got)
		}
	})

	t.Run("an empty language is Russian", func(t *testing.T) {
		if got := subjectFor("", "email_verification"); got != subjects[LanguageRU]["email_verification"] {
			t.Fatalf("subject = %q", got)
		}
	})

	t.Run("English ships empty, so nothing claims to be translated", func(t *testing.T) {
		if len(subjects["en"]) != 0 || len(bodies["en"]) != 0 {
			t.Fatal("en should carry nothing until somebody translates it")
		}
	})

	t.Run("every Russian subject has a body and the other way round", func(t *testing.T) {
		for name := range subjects[LanguageRU] {
			if bodies[LanguageRU][name] == "" {
				t.Errorf("subject %q has no template", name)
			}
		}
		for name := range bodies[LanguageRU] {
			if subjects[LanguageRU][name] == "" {
				t.Errorf("template %q has no subject", name)
			}
		}
	})
}
