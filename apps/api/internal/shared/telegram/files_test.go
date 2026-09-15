package telegram

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Файл забирается в два шага: путь у API, содержимое — с другого адреса.
func TestDownloadFile(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/getFile") {
			_, _ = w.Write([]byte(`{"ok":true,"result":{"file_path":"photos/1.jpg"}}`))
			return
		}
		if strings.Contains(r.URL.Path, "/file/bot") {
			_, _ = w.Write([]byte("содержимое"))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()
	c := NewClient("токен")
	c.baseURL = server.URL

	data, err := c.DownloadFile(context.Background(), "file-1")

	require.NoError(t, err)
	assert.Equal(t, "содержимое", string(data))
}

// Отказ приходит с кодом 200 — и здесь тоже.
func TestDownloadFileReportsARefusal(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"ok":false,"description":"file is too big"}`))
	}))
	defer server.Close()
	c := NewClient("токен")
	c.baseURL = server.URL

	_, err := c.DownloadFile(context.Background(), "file-1")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "too big")
}

// Путь пустой — файла нет, и это ошибка, а не пустое содержимое.
func TestDownloadFileWithoutAPath(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"ok":true,"result":{}}`))
	}))
	defer server.Close()
	c := NewClient("токен")
	c.baseURL = server.URL

	_, err := c.DownloadFile(context.Background(), "file-1")

	require.Error(t, err)
}

// Фотография и файл уходят по ссылке и, если задана, в тему.
func TestSendPhotoAndDocument(t *testing.T) {
	var got map[string]any
	var method string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method = r.URL.Path
		// Сброс обязателен: Decode в непустую карту дополняет её, а не
		// заменяет, и ключи прошлого запроса остались бы видны.
		got = nil
		_ = json.NewDecoder(r.Body).Decode(&got)
		_, _ = w.Write([]byte(`{"ok":true,"result":{}}`))
	}))
	defer server.Close()
	c := NewClient("токен")
	c.baseURL = server.URL

	require.NoError(t, c.SendPhotoURL(context.Background(), -100, 7, "https://s/1.jpg", "подпись"))
	assert.Contains(t, method, "sendPhoto")
	assert.Equal(t, "https://s/1.jpg", got["photo"])
	assert.Equal(t, "подпись", got["caption"])
	assert.Equal(t, float64(7), got["message_thread_id"])

	require.NoError(t, c.SendDocumentURL(context.Background(), -100, 0, "https://s/1.pdf", ""))
	assert.Contains(t, method, "sendDocument")
	_, hasThread := got["message_thread_id"]
	assert.False(t, hasThread, "нулевая тема уехала как идентификатор")
	_, hasCaption := got["caption"]
	assert.False(t, hasCaption, "пустая подпись уехала полем")
}
