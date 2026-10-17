package router

import (
	"net/http"

	"github.com/burcev/api/internal/config"
	"github.com/gin-gonic/gin"
)

// supportURL — куда приложение ведёт за помощью: тот же адрес, что в подвале
// входа и на страницах документов сайта.
const supportURL = "mailto:support@burcev.team"

// features is the one place the capability flags become a response field.
//
// /ready and /config both report them, and they must not disagree: the app
// decides from /config which screens to show, and an operator reads /ready to
// find out why one is missing. Two builders would drift the first time a flag
// was added to one of them.
func features(cfg *config.Config) map[string]bool {
	return cfg.Features.Map()
}

// ClientConfig is the body of GET /api/v1/config.
type ClientConfig struct {
	Features   map[string]bool `json:"features"`
	IOS        IOSConfig       `json:"ios"`
	SupportURL string          `json:"support_url"`
	Legal      LegalConfig     `json:"legal"`
}

// IOSConfig carries what the iOS app needs to know about itself.
type IOSConfig struct {
	// MinSupportedVersion is MAJOR.MINOR.PATCH; an app below it asks to be
	// updated.
	MinSupportedVersion string `json:"min_supported_version"`
}

// LegalConfig points at the documents a person agrees to.
type LegalConfig struct {
	TermsURL   string `json:"terms_url"`
	PrivacyURL string `json:"privacy_url"`
}

// registerClientConfigRoute exposes GET /api/v1/config.
//
// Public and independent of the database: /ready is a probe for the
// orchestrator and answers 503 when the database is down, and an app reading
// it would show "this feature is off" for what is a passing outage. Nothing
// here is read from anywhere but the configuration the process started with.
func registerClientConfigRoute(v1 *gin.RouterGroup, d Deps) {
	v1.GET("/config", func(c *gin.Context) {
		// Not cached anywhere: a capability switched off, or a minimum
		// version raised, has to reach the app on its next launch.
		c.Header("Cache-Control", "no-store")
		c.JSON(http.StatusOK, clientConfig(d.Cfg))
	})
}

func clientConfig(cfg *config.Config) ClientConfig {
	minVersion := cfg.IOSMinSupportedVersion
	if !config.ValidIOSVersion(minVersion) {
		// Outside production an invalid value does not stop the start (in
		// production it does, see config.validate); the app still gets a
		// value it can compare rather than one it cannot parse.
		minVersion = config.DefaultIOSMinSupportedVersion
	}
	return ClientConfig{
		Features:   features(cfg),
		IOS:        IOSConfig{MinSupportedVersion: minVersion},
		SupportURL: supportURL,
		Legal: LegalConfig{
			TermsURL:   appOrigin(cfg) + "/legal/terms",
			PrivacyURL: appOrigin(cfg) + "/legal/privacy",
		},
	}
}

// appOrigin is the site the documents live on.
func appOrigin(cfg *config.Config) string {
	if cfg.AppDomain == "" {
		return "http://localhost:3069"
	}
	return "https://" + cfg.AppDomain
}
