package leads

import (
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func cookieOf(json string) string { return url.QueryEscape(json) }

// The browser writes the cookie (apps/web/src/shared/analytics/attribution.ts)
// as encodeURIComponent(JSON). The server reads it on every way into an
// account; anything it cannot read is no attribution, never an error.
func TestFirstTouchFromCookie(t *testing.T) {
	t.Run("reads what the browser wrote", func(t *testing.T) {
		raw := `{"utm_source":"yandex","utm_campaign":"autumn","yandex_click_id":"123",` +
			`"referrer":"https://dzen.ru/a/xyz","landing_page":"/content/chto-takoe-kbzhu"}`
		got := FirstTouchFromCookie(cookieOf(raw))

		assert.Equal(t, Attribution{
			UTMSource: "yandex", UTMCampaign: "autumn", YandexClickID: "123",
			Referrer: "https://dzen.ru/a/xyz", LandingPage: "/content/chto-takoe-kbzhu",
		}, got)
	})

	t.Run("matches encodeURIComponent, which leaves some characters alone", func(t *testing.T) {
		// encodeURIComponent does not escape ( ) ' ! * ~ and writes spaces as %20.
		raw := `%7B%22utm_campaign%22%3A%22a%20(b)%22%7D`
		assert.Equal(t, "a (b)", FirstTouchFromCookie(raw).UTMCampaign)
	})

	t.Run("is nothing when absent or broken", func(t *testing.T) {
		assert.Equal(t, Attribution{}, FirstTouchFromCookie(""))
		assert.Equal(t, Attribution{}, FirstTouchFromCookie("%7Bbroken"))
		assert.Equal(t, Attribution{}, FirstTouchFromCookie("%ZZ"))
		assert.Equal(t, Attribution{}, FirstTouchFromCookie(cookieOf(`["not","an","object"]`)))
	})

	t.Run("trims what a hand-made cookie could stuff into it", func(t *testing.T) {
		raw := `{"utm_source":"` + strings.Repeat("x", 1000) + `"}`
		assert.Len(t, FirstTouchFromCookie(cookieOf(raw)).UTMSource, 200)
	})

	t.Run("never takes the browser identifier from it", func(t *testing.T) {
		got := FirstTouchFromCookie(cookieOf(`{"metrika_client_id":"forged"}`))
		assert.Empty(t, got.MetrikaClientID)
	})

	t.Run("refuses a value too long to be the browser's", func(t *testing.T) {
		raw := cookieOf(`{"utm_source":"` + strings.Repeat("x", 3000) + `"}`)
		assert.Equal(t, Attribution{}, FirstTouchFromCookie(raw))
	})
}
