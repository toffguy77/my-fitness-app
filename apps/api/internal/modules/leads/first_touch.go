package leads

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
)

// FirstTouchCookieName is the cookie the browser keeps the first touch in for
// thirty days (apps/web/src/shared/analytics/attribution.ts). The server reads
// it on every way into an account, the way it reads LeadCookieName: a
// provider or a link in a letter returns the person without our JavaScript.
const FirstTouchCookieName = "first_touch"

// attributionValueLimit matches the browser's own trim. A hand-made cookie or
// request body is clipped to it too.
const attributionValueLimit = 200

// firstTouchCookieLimit refuses outright what the browser would never write:
// it keeps the cookie within a kilobyte.
const firstTouchCookieLimit = 2048

func clip(v string) string {
	if len(v) <= attributionValueLimit {
		return v
	}
	// Cut on a rune boundary: a half of a Cyrillic letter is not text.
	r := []rune(v)
	if len(r) > attributionValueLimit {
		r = r[:attributionValueLimit]
	}
	return string(r)
}

// FirstTouchFromCookie reads the first-touch cookie. Anything it cannot read
// is no attribution, never an error: losing where somebody came from must not
// cost them the account they are making.
//
// The browser identifier is never taken from it — that arrives from the
// counter, separately, and a cookie anybody can edit is not where it comes from.
func FirstTouchFromCookie(raw string) Attribution {
	if raw == "" || len(raw) > firstTouchCookieLimit {
		return Attribution{}
	}
	decoded, err := url.PathUnescape(raw)
	if err != nil {
		return Attribution{}
	}

	var in struct {
		UTMSource     string `json:"utm_source"`
		UTMMedium     string `json:"utm_medium"`
		UTMCampaign   string `json:"utm_campaign"`
		UTMContent    string `json:"utm_content"`
		UTMTerm       string `json:"utm_term"`
		YandexClickID string `json:"yandex_click_id"`
		Referrer      string `json:"referrer"`
		LandingPage   string `json:"landing_page"`
	}
	if err := json.Unmarshal([]byte(decoded), &in); err != nil {
		return Attribution{}
	}

	return Attribution{
		UTMSource:     clip(in.UTMSource),
		UTMMedium:     clip(in.UTMMedium),
		UTMCampaign:   clip(in.UTMCampaign),
		UTMContent:    clip(in.UTMContent),
		UTMTerm:       clip(in.UTMTerm),
		YandexClickID: clip(in.YandexClickID),
		Referrer:      clip(in.Referrer),
		LandingPage:   clip(in.LandingPage),
	}
}

// RecordFirstTouch writes where a new account came from, unless something is
// already recorded for it.
//
// Called after the lead, if any, has been carried across: a claimed lead has
// already written its own row, and DO NOTHING keeps it — the lead was saved
// during the very visit that converted, the cookie only says how the first
// one began.
func (s *Service) RecordFirstTouch(ctx context.Context, userID int64, a Attribution) error {
	if a == (Attribution{}) {
		return nil
	}
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO user_attribution (
			user_id, yandex_click_id,
			utm_source, utm_medium, utm_campaign, utm_content, utm_term,
			referrer, landing_page
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		ON CONFLICT (user_id) DO NOTHING`,
		userID, nullIfEmpty(a.YandexClickID),
		nullIfEmpty(a.UTMSource), nullIfEmpty(a.UTMMedium),
		nullIfEmpty(a.UTMCampaign), nullIfEmpty(a.UTMContent), nullIfEmpty(a.UTMTerm),
		nullIfEmpty(a.Referrer), nullIfEmpty(a.LandingPage),
	); err != nil {
		return fmt.Errorf("record first touch: %w", err)
	}
	return nil
}
