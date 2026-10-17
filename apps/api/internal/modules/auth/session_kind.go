package auth

import (
	"strings"
	"time"
	"unicode/utf8"
)

// ClientKind — какой клиент держит refresh-токен. Записывается в
// refresh_tokens.client_kind и решает две вещи: срок жизни и эндпоинт, который
// этот токен принимает.
//
// Токен одного вида эндпоинт другого не принимает. Веб-токен живёт в
// HttpOnly-cookie, и нативный эндпоинт, отдающий токен в теле, не должен
// становиться способом вынуть его оттуда; нативный токен, предъявленный
// вебу, получил бы веб-срок и cookie.
type ClientKind string

const (
	ClientWeb ClientKind = "web"
	ClientIOS ClientKind = "ios"
)

const (
	// RefreshTokenTTLNative — срок нативной сессии. Скользящий: каждое
	// обновление выпускает токен на новые 90 дней. Человек, открывающий
	// приложение раз в месяц, не выходит; утёкшая резервная копия Keychain не
	// живёт вечно.
	RefreshTokenTTLNative = 90 * 24 * time.Hour
	// AccessTokenTTL — срок access-токена у любого клиента.
	AccessTokenTTL = 15 * time.Minute
	// maxDeviceNameRunes ограничивает имя модели телефона: это подпись в
	// будущем списке устройств, а не место для произвольного текста.
	maxDeviceNameRunes = 64
)

// SessionSpec — какую сессию выпускать.
type SessionSpec struct {
	Kind ClientKind
	// RememberMe имеет смысл только для веба: 30 дней вместо 24 часов.
	RememberMe bool
	// DeviceName — модель телефона для нативной сессии; пусто у веба.
	DeviceName string
}

// WebSession — сессия браузера, как её выпускал веб всегда.
func WebSession(rememberMe bool) SessionSpec {
	return SessionSpec{Kind: ClientWeb, RememberMe: rememberMe}
}

// NativeSession — сессия iOS-приложения на 90 дней.
func NativeSession(deviceName string) SessionSpec {
	return SessionSpec{Kind: ClientIOS, DeviceName: cleanDeviceName(deviceName)}
}

// TTL — срок refresh-токена этой сессии. Нативный не зависит от remember_me.
func (s SessionSpec) TTL() time.Duration {
	switch {
	case s.Kind == ClientIOS:
		return RefreshTokenTTLNative
	case s.RememberMe:
		return RefreshTokenTTLRememberMe
	default:
		return RefreshTokenTTLDefault
	}
}

func (s SessionSpec) kind() ClientKind {
	if s.Kind == "" {
		return ClientWeb
	}
	return s.Kind
}

func (s SessionSpec) deviceName() any {
	if s.DeviceName == "" {
		return nil
	}
	return s.DeviceName
}

func cleanDeviceName(name string) string {
	name = strings.TrimSpace(name)
	if utf8.RuneCountInString(name) > maxDeviceNameRunes {
		name = string([]rune(name)[:maxDeviceNameRunes])
	}
	return name
}
