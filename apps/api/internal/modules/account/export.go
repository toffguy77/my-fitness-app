package account

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
)

// Export limits. The archive contains everything the service holds about a
// person, so building one is neither cheap nor something to do repeatedly.
const (
	exportsPerDay  = 1
	exportLifetime = 24 * time.Hour
)

// Export is one requested archive.
type Export struct {
	ID          string     `json:"id"`
	Status      string     `json:"status"`
	RequestedAt time.Time  `json:"requested_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
	Downloaded  bool       `json:"downloaded"`
}

// Export status values.
const (
	exportPending  = "pending"
	exportBuilding = "building"
	exportReady    = "ready"
	exportFailed   = "failed"
)

// RequestExport queues an archive.
//
// Building is asynchronous because an archive with a year of progress
// photographs cannot be assembled inside an HTTP request.
func (s *Service) RequestExport(ctx context.Context, userID int64) (*Export, error) {
	var active int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM data_exports
		 WHERE user_id = $1 AND status IN ($2, $3)`,
		userID, exportPending, exportBuilding).Scan(&active); err != nil {
		return nil, fmt.Errorf("count active exports: %w", err)
	}
	if active > 0 {
		return nil, fmt.Errorf("export already in progress: %w", apperrors.ErrConflict)
	}

	var recent int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM data_exports
		 WHERE user_id = $1 AND requested_at > NOW() - INTERVAL '24 hours'`,
		userID).Scan(&recent); err != nil {
		return nil, fmt.Errorf("count recent exports: %w", err)
	}
	if recent >= exportsPerDay {
		return nil, fmt.Errorf("daily export limit reached: %w", apperrors.ErrRateLimited)
	}

	var export Export
	if err := s.db.QueryRowContext(ctx,
		`INSERT INTO data_exports (user_id, status) VALUES ($1, $2)
		 RETURNING id::text, status, requested_at`,
		userID, exportPending).Scan(&export.ID, &export.Status, &export.RequestedAt); err != nil {
		return nil, fmt.Errorf("create export: %w", err)
	}

	s.log.Info("Data export requested", "user_id", userID, "export_id", export.ID)
	return &export, nil
}

// ListExports returns a user's archives, newest first.
func (s *Service) ListExports(ctx context.Context, userID int64) ([]Export, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id::text, status, requested_at, completed_at, expires_at, downloaded_at IS NOT NULL
		 FROM data_exports WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 20`, userID)
	if err != nil {
		return nil, fmt.Errorf("list exports: %w", err)
	}
	defer rows.Close()

	exports := make([]Export, 0)
	for rows.Next() {
		var e Export
		if err := rows.Scan(&e.ID, &e.Status, &e.RequestedAt, &e.CompletedAt,
			&e.ExpiresAt, &e.Downloaded); err != nil {
			return nil, fmt.Errorf("scan export: %w", err)
		}
		exports = append(exports, e)
	}
	return exports, rows.Err()
}

// ClaimExport marks an archive downloaded and returns a signed URL.
//
// Single use within a day: the archive holds everything about the person, so a
// link that stays live is a standing risk if it is ever forwarded or logged.
func (s *Service) ClaimExport(ctx context.Context, userID int64, exportID string) (string, error) {
	var ownerID int64
	var status string
	var s3Key sql.NullString
	var downloadedAt, expiresAt sql.NullTime

	err := s.db.QueryRowContext(ctx,
		`SELECT user_id, status, s3_key, downloaded_at, expires_at
		 FROM data_exports WHERE id = $1::uuid`, exportID).
		Scan(&ownerID, &status, &s3Key, &downloadedAt, &expiresAt)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("export not found: %w", apperrors.ErrNotFound)
	}
	if err != nil {
		return "", fmt.Errorf("load export: %w", err)
	}

	if ownerID != userID {
		return "", fmt.Errorf("export belongs to another user: %w", apperrors.ErrForbidden)
	}
	if status != exportReady || !s3Key.Valid {
		return "", fmt.Errorf("export is not ready: %w", apperrors.ErrNotFound)
	}
	if downloadedAt.Valid {
		return "", fmt.Errorf("export already downloaded: %w", apperrors.ErrGone)
	}
	if expiresAt.Valid && time.Now().After(expiresAt.Time) {
		return "", fmt.Errorf("export expired: %w", apperrors.ErrGone)
	}

	client := s.buckets["exports"]
	if client == nil {
		return "", fmt.Errorf("export storage is not configured")
	}
	url, err := client.GetSignedURL(ctx, s3Key.String, 15*time.Minute)
	if err != nil {
		return "", fmt.Errorf("sign export url: %w", err)
	}

	if _, err := s.db.ExecContext(ctx,
		`UPDATE data_exports SET downloaded_at = NOW() WHERE id = $1::uuid`, exportID); err != nil {
		s.log.Error("Failed to mark export downloaded", "error", err, "export_id", exportID)
	}

	return url, nil
}

// BuildPendingExports assembles every queued archive. Run as a background job.
func (s *Service) BuildPendingExports(ctx context.Context) (int, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id::text, user_id FROM data_exports WHERE status = $1 ORDER BY requested_at`,
		exportPending)
	if err != nil {
		return 0, fmt.Errorf("list pending exports: %w", err)
	}

	type pending struct {
		id     string
		userID int64
	}

	// The queue is drained into memory first: building an archive takes minutes
	// and holding the rows open for that long would pin a pool connection.
	queue, err := func() ([]pending, error) {
		defer func() { _ = rows.Close() }()
		var out []pending
		for rows.Next() {
			var p pending
			if err := rows.Scan(&p.id, &p.userID); err != nil {
				return nil, err
			}
			out = append(out, p)
		}
		return out, rows.Err()
	}()
	if err != nil {
		return 0, err
	}

	built := 0
	for _, p := range queue {
		if err := s.buildExport(ctx, p.id, p.userID); err != nil {
			s.log.Error("Failed to build export", "error", err, "export_id", p.id, "user_id", p.userID)
			if _, updateErr := s.db.ExecContext(ctx,
				`UPDATE data_exports SET status = $2, error = $3, completed_at = NOW()
				 WHERE id = $1::uuid`, p.id, exportFailed, err.Error()); updateErr != nil {
				s.log.Error("Failed to record export failure", "error", updateErr, "export_id", p.id)
			}
			continue
		}
		built++
	}
	return built, nil
}

// exportSection is one JSON file inside the archive.
type exportSection struct {
	name  string
	query string
}

// sections are the parts of the archive. The list mirrors what the product
// actually stores about a person; a section missing here is data the user
// cannot take with them.
var sections = []exportSection{
	{"profile", `SELECT id, email, name, role, avatar_url, created_at FROM users WHERE id = $1`},
	{"settings", `SELECT * FROM user_settings WHERE user_id = $1`},
	{"food_diary", `SELECT * FROM food_entries WHERE user_id = $1 ORDER BY date`},
	{"water", `SELECT * FROM water_logs WHERE user_id = $1 ORDER BY date`},
	{"metrics", `SELECT * FROM daily_metrics WHERE user_id = $1 ORDER BY date`},
	{"tasks", `SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at`},
	{"weekly_plans", `SELECT * FROM weekly_plans WHERE user_id = $1 ORDER BY start_date`},
	{"weekly_reports", `SELECT * FROM weekly_reports WHERE user_id = $1 ORDER BY created_at`},
	{"my_foods", `SELECT * FROM user_foods WHERE user_id = $1 ORDER BY created_at`},
	{"notifications", `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at`},
	{"messages", `SELECT m.* FROM messages m
		JOIN conversations c ON c.id = m.conversation_id
		WHERE c.client_id = $1 ORDER BY m.created_at`},
	{"consents", `SELECT * FROM user_consents WHERE user_id = $1 ORDER BY granted_at`},
}

func (s *Service) buildExport(ctx context.Context, exportID string, userID int64) error {
	if _, err := s.db.ExecContext(ctx,
		`UPDATE data_exports SET status = $2 WHERE id = $1::uuid`, exportID, exportBuilding); err != nil {
		return fmt.Errorf("mark building: %w", err)
	}

	var buf bytes.Buffer
	archive := zip.NewWriter(&buf)

	for _, section := range sections {
		data, err := s.queryAsJSON(ctx, section.query, userID)
		if err != nil {
			return fmt.Errorf("collect %s: %w", section.name, err)
		}
		w, err := archive.Create("data/" + section.name + ".json")
		if err != nil {
			return fmt.Errorf("add %s to archive: %w", section.name, err)
		}
		if _, err := w.Write(data); err != nil {
			return fmt.Errorf("write %s: %w", section.name, err)
		}
	}

	readme, err := archive.Create("README.txt")
	if err != nil {
		return fmt.Errorf("add readme: %w", err)
	}
	if _, err := readme.Write([]byte(readmeText)); err != nil {
		return fmt.Errorf("write readme: %w", err)
	}

	if err := archive.Close(); err != nil {
		return fmt.Errorf("finalise archive: %w", err)
	}

	client := s.buckets["exports"]
	if client == nil {
		return fmt.Errorf("export storage is not configured")
	}
	key := fmt.Sprintf("exports/%d/%s.zip", userID, exportID)
	if _, err := client.UploadFile(ctx, key, bytes.NewReader(buf.Bytes()),
		"application/zip", int64(buf.Len())); err != nil {
		return fmt.Errorf("upload archive: %w", err)
	}

	if _, err := s.db.ExecContext(ctx,
		`UPDATE data_exports
		 SET status = $2, s3_key = $3, completed_at = NOW(), expires_at = NOW() + $4::interval
		 WHERE id = $1::uuid`,
		exportID, exportReady, key, fmt.Sprintf("%d seconds", int(exportLifetime.Seconds()))); err != nil {
		return fmt.Errorf("mark ready: %w", err)
	}

	s.log.Info("Data export ready", "user_id", userID, "export_id", exportID, "bytes", buf.Len())
	return nil
}

// queryAsJSON runs a query and renders the rows as JSON, without needing a
// struct per section: the archive is for the user, not for our type system.
func (s *Service) queryAsJSON(ctx context.Context, query string, userID int64) ([]byte, error) {
	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	records := make([]map[string]any, 0)
	for rows.Next() {
		values := make([]any, len(columns))
		pointers := make([]any, len(columns))
		for i := range values {
			pointers[i] = &values[i]
		}
		if err := rows.Scan(pointers...); err != nil {
			return nil, err
		}

		record := make(map[string]any, len(columns))
		for i, name := range columns {
			// []byte renders as base64 in JSON, which is unreadable for text
			// columns; convert so the archive is legible.
			if raw, ok := values[i].([]byte); ok {
				record[name] = string(raw)
				continue
			}
			record[name] = values[i]
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return json.MarshalIndent(records, "", "  ")
}

const readmeText = `Выгрузка ваших данных из BURCEV

В папке data/ лежат файлы в формате JSON:

  profile.json          — профиль
  settings.json         — настройки
  food_diary.json       — дневник питания
  water.json            — учёт воды
  metrics.json          — вес и замеры
  tasks.json            — задачи
  weekly_plans.json     — недельные планы
  weekly_reports.json   — недельные отчёты
  my_foods.json         — созданные вами продукты
  notifications.json    — уведомления
  messages.json         — переписка с куратором
  consents.json         — данные о выданных согласиях

Файлы можно открыть любым текстовым редактором.

Если чего-то не хватает, напишите в поддержку — мы обязаны выдать
все данные, которые о вас храним.
`
