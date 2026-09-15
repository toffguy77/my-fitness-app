package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// Файлы: получить присланное и отправить своё.
//
// Telegram не отдаёт содержимое в обновлении — только `file_id`. Чтобы его
// прочитать, нужны два шага: `getFile` за путём и загрузка по этому пути с
// другого адреса (`/file/bot<token>/<path>`), не с адреса API.

// MaxFileBytes — сколько мы согласны принять.
//
// Bot API и так не отдаёт файлы больше 20 МБ, но полагаться на чужое
// ограничение как на своё — значит узнать о его изменении из отчёта о падении.
const MaxFileBytes = 20 << 20

// DownloadFile забирает содержимое присланного файла.
func (c *Client) DownloadFile(ctx context.Context, fileID string) ([]byte, error) {
	raw, err := c.call(ctx, "getFile", map[string]any{"file_id": fileID})
	if err != nil {
		return nil, err
	}
	var file struct {
		FilePath string `json:"file_path"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		return nil, fmt.Errorf("read file path: %w", err)
	}
	if file.FilePath == "" {
		return nil, fmt.Errorf("telegram gave no path for the file")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("%s/file/bot%s/%s", c.baseURL, c.token, file.FilePath), nil)
	if err != nil {
		return nil, fmt.Errorf("build download request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download file: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("telegram returned %d downloading the file", resp.StatusCode)
	}

	// Читаем на байт больше предела: так отличается «ровно предел» от
	// «обрезано», и мы не сохраняем половину файла, считая её целой.
	data, err := io.ReadAll(io.LimitReader(resp.Body, MaxFileBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read file: %w", err)
	}
	if len(data) > MaxFileBytes {
		return nil, fmt.Errorf("файл больше %d МБ", MaxFileBytes>>20)
	}
	return data, nil
}

// SendPhotoURL отправляет фотографию по ссылке.
//
// Ссылкой, а не содержимым: файл уже лежит в нашем хранилище, и гонять его
// через нас второй раз незачем.
func (c *Client) SendPhotoURL(ctx context.Context, chatID, threadID int64, url, caption string) error {
	payload := map[string]any{"chat_id": chatID, "photo": url}
	if caption != "" {
		payload["caption"] = caption
	}
	if threadID != 0 {
		payload["message_thread_id"] = threadID
	}
	_, err := c.call(ctx, "sendPhoto", payload)
	return err
}

// SendDocumentURL отправляет файл по ссылке.
func (c *Client) SendDocumentURL(ctx context.Context, chatID, threadID int64, url, caption string) error {
	payload := map[string]any{"chat_id": chatID, "document": url}
	if caption != "" {
		payload["caption"] = caption
	}
	if threadID != 0 {
		payload["message_thread_id"] = threadID
	}
	_, err := c.call(ctx, "sendDocument", payload)
	return err
}
