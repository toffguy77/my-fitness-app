package users

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"
)

var usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_.]{1,64}$`)

func sanitizeUsername(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}

	prefixes := []string{
		"https://t.me/",
		"http://t.me/",
		"https://www.instagram.com/",
		"https://instagram.com/",
		"http://www.instagram.com/",
		"http://instagram.com/",
	}
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) {
			s = strings.TrimPrefix(s, p)
			break
		}
	}

	s = strings.TrimRight(s, "/")
	s = strings.TrimLeft(s, "@")

	return s
}

func validateUsernameFormat(username string) error {
	if username == "" {
		return nil
	}
	if !usernameRegex.MatchString(username) {
		return fmt.Errorf("допустимы только латинские буквы, цифры, точки и подчёркивания (до 64 символов)")
	}
	return nil
}

func verifyUsernameExists(ctx context.Context, platform, username string) error {
	if username == "" {
		return nil
	}

	var url string
	switch platform {
	case "telegram":
		url = "https://t.me/" + username
	case "instagram":
		url = "https://www.instagram.com/" + username + "/"
	default:
		return nil
	}

	client := &http.Client{
		Timeout: 5 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := client.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("аккаунт @%s не найден в %s", username, platform)
	}

	return nil
}
