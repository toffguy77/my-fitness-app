// Package metrika reports to the advertising account what happened after the
// browser closed.
//
// Four facts matter to it: a registration, an address confirmed, a first food
// entry, a curator assigned. None happens in a browser, so none can be reached
// as a goal — the counter never sees them. They go up through the offline
// conversions API, attributed to the browser identifier kept when the lead was
// claimed.
//
// Without this the advertising account optimises on clicks, because clicks are
// all it can see.
package metrika

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/burcev/api/internal/shared/logger"
)

// Conversions is the set of facts uploaded. Declared here and nowhere else:
// a name that disagrees with the analytics dictionary is a goal that never
// fills, and nobody notices an empty metric.
var Conversions = []string{
	"registered",
	"email_verified",
	"first_food_entry",
	"curator_assigned",
}

// MaxAttempts bounds retries of one conversion.
//
// A conversion Yandex keeps refusing is a defect in what we send, not weather.
// Retrying it nightly forever would hide that behind a queue that merely looks
// busy.
const MaxAttempts = 5

// BatchSize bounds one upload. The API takes a file; a very large one turns a
// transient failure into a large retry.
const BatchSize = 500

// Service queues conversions and uploads them.
type Service struct {
	db        *sql.DB
	log       *logger.Logger
	client    *http.Client
	token     string
	counterID string
	// uploadURL is the endpoint, overridden in tests. A test that reached the
	// real API would depend on the network and on somebody else's server.
	uploadURL string
}

// NewService creates the service. A zero token means the capability is off and
// nothing is registered to call this.
func NewService(db *sql.DB, log *logger.Logger, token, counterID string) *Service {
	return &Service{
		db:  db,
		log: log,
		// Bounded: the upload runs in a scheduled job that holds an advisory
		// lock, and a request without a deadline would hold it indefinitely.
		client:    &http.Client{Timeout: 30 * time.Second},
		token:     token,
		counterID: counterID,
		uploadURL: fmt.Sprintf(
			"https://api-metrika.yandex.net/management/v1/counter/%s"+
				"/offline_conversions/upload?client_id_type=CLIENT_ID",
			counterID),
	}
}

// Queue records a conversion for later upload.
//
// Silent when the user's browser is unknown, which is most of them: somebody
// who refused the analytics cookie, or arrived with an ad blocker, or never
// went through the guest wizard at all. A conversion without an identifier
// attributes to no visit and only inflates the goal count, making the source
// report worse than it was.
//
// Never returns an error to its caller's path: this is called from handlers
// that have already done the thing being reported, and a failure to tell
// Yandex about it must not fail them.
func (s *Service) Queue(ctx context.Context, userID int64, eventName string, occurredAt time.Time) {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO conversion_uploads (user_id, event_name, metrika_client_id, occurred_at)
		SELECT $1, $2, a.metrika_client_id, $3
		FROM user_attribution a
		WHERE a.user_id = $1 AND a.metrika_client_id IS NOT NULL
		ON CONFLICT (user_id, event_name) DO NOTHING`,
		userID, eventName, occurredAt)
	if err != nil {
		s.log.Error("Failed to queue conversion",
			"error", err, "user_id", userID, "event", eventName)
	}
}

type pending struct {
	id         int64
	clientID   string
	eventName  string
	occurredAt time.Time
}

// Upload sends what is waiting and reports how many went.
func (s *Service) Upload(ctx context.Context) (int, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, metrika_client_id, event_name, occurred_at
		FROM conversion_uploads
		WHERE sent_at IS NULL AND attempts < $1
		ORDER BY occurred_at
		LIMIT $2`, MaxAttempts, BatchSize)
	if err != nil {
		return 0, fmt.Errorf("select pending conversions: %w", err)
	}
	defer rows.Close()

	var batch []pending
	for rows.Next() {
		var p pending
		if err := rows.Scan(&p.id, &p.clientID, &p.eventName, &p.occurredAt); err != nil {
			return 0, fmt.Errorf("scan pending conversion: %w", err)
		}
		batch = append(batch, p)
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("read pending conversions: %w", err)
	}
	if len(batch) == 0 {
		return 0, nil
	}

	if err := s.send(ctx, batch); err != nil {
		s.recordFailure(ctx, batch, err)
		return 0, err
	}

	return len(batch), s.markSent(ctx, batch)
}

// csvOf renders the batch the way the upload endpoint expects it.
//
// Exactly these columns and this order. The time is a Unix timestamp: the API
// attributes the conversion by it, and it is when the fact happened, not when
// it was uploaded.
func csvOf(batch []pending) string {
	var out strings.Builder
	w := csv.NewWriter(&out)
	_ = w.Write([]string{"ClientId", "Target", "DateTime"})
	for _, p := range batch {
		_ = w.Write([]string{
			p.clientID,
			p.eventName,
			strconv.FormatInt(p.occurredAt.Unix(), 10),
		})
	}
	w.Flush()
	return out.String()
}

func (s *Service) markSent(ctx context.Context, batch []pending) error {
	ids := idsOf(batch)
	_, err := s.db.ExecContext(ctx, `
		UPDATE conversion_uploads SET sent_at = NOW() WHERE id = ANY($1)`, ids)
	if err != nil {
		// The upload succeeded and the mark did not. Reported loudly: the next
		// run would send these again, and two registrations for one person are
		// indistinguishable afterwards from real growth.
		return fmt.Errorf("mark conversions sent: %w", err)
	}
	return nil
}

func (s *Service) recordFailure(ctx context.Context, batch []pending, cause error) {
	ids := idsOf(batch)
	if _, err := s.db.ExecContext(ctx, `
		UPDATE conversion_uploads
		SET attempts = attempts + 1, last_error = $2
		WHERE id = ANY($1)`, ids, cause.Error()); err != nil {
		s.log.Error("Failed to record conversion failure", "error", err)
	}
}

// idsOf renders the batch's identifiers as a Postgres array literal, the way
// the rest of this codebase passes one.
func idsOf(batch []pending) string {
	parts := make([]string, len(batch))
	for i, p := range batch {
		parts[i] = strconv.FormatInt(p.id, 10)
	}
	return "{" + strings.Join(parts, ",") + "}"
}

// send uploads the batch.
//
// The API takes a CSV file in a multipart form. Everything about the shape of
// this request is dictated by it: the field name, the column names, and the
// fact that a 200 means accepted for processing rather than processed — the
// numbers appear in reports about two hours later.
func (s *Service) send(ctx context.Context, batch []pending) error {
	var body bytes.Buffer
	form := multipart.NewWriter(&body)

	part, err := form.CreateFormFile("file", "conversions.csv")
	if err != nil {
		return fmt.Errorf("build conversion upload: %w", err)
	}
	if _, err := io.WriteString(part, csvOf(batch)); err != nil {
		return fmt.Errorf("write conversion upload: %w", err)
	}
	if err := form.Close(); err != nil {
		return fmt.Errorf("close conversion upload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.uploadURL, &body)
	if err != nil {
		return fmt.Errorf("create conversion request: %w", err)
	}
	req.Header.Set("Authorization", "OAuth "+s.token)
	req.Header.Set("Content-Type", form.FormDataContentType())

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("upload conversions: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		// Bounded read: an error page is not a reason to hold a megabyte.
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("upload conversions: %s: %s",
			resp.Status, strings.TrimSpace(string(detail)))
	}
	return nil
}
