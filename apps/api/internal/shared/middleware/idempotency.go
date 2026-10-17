package middleware

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	// IdempotencyKeyHeader несёт ключ изменения: UUID, постоянный для всех
	// попыток одного изменения из очереди приложения.
	IdempotencyKeyHeader = "Idempotency-Key"
	// IdempotentReplayedHeader помечает ответ, взятый из сохранённого, а не
	// полученный выполнением запроса.
	IdempotentReplayedHeader = "Idempotent-Replayed"

	// IdempotencyTTL — сколько ключ помнит ответ. Строки старше убирает
	// задача cleanup.idempotency-keys; до неё такой ключ считается свободным.
	IdempotencyTTL = 24 * time.Hour

	// idempotencyStaleAfter: запрос «в работе» дольше этого считается
	// брошенным (процесс упал посреди обработки), и ключ можно занять заново.
	// С запасом над WriteTimeout сервера (15 с): живой запрос столько не идёт.
	idempotencyStaleAfter = 2 * time.Minute
	// idempotencyWait — сколько дубль ждёт завершения первого запроса, прежде
	// чем ответить 409. Меньше WriteTimeout, чтобы ответ успел уйти.
	idempotencyWait = 10 * time.Second
	idempotencyPoll = 100 * time.Millisecond
	// idempotencyFinishTimeout: запись ответа идёт и после обрыва соединения —
	// именно этот случай ключ и закрывает.
	idempotencyFinishTimeout = 5 * time.Second
)

// IdempotencyStore хранит ключи идемпотентности в idempotency_keys.
//
// База, а не память процесса: повтор из очереди может прийти через сутки и в
// другой экземпляр сервиса.
type IdempotencyStore struct {
	db         *database.DB
	wait       time.Duration
	poll       time.Duration
	staleAfter time.Duration
}

// NewIdempotencyStore не обращается к базе: маршруты регистрируются и в
// тестах без неё.
func NewIdempotencyStore(db *database.DB) *IdempotencyStore {
	return &IdempotencyStore{db: db, wait: idempotencyWait, poll: idempotencyPoll, staleAfter: idempotencyStaleAfter}
}

// Idempotency — middleware изменяющего маршрута, принимающего
// Idempotency-Key. Ставится на маршрут после RequireAuth: ключ принадлежит
// пользователю, и ключ одного не влияет на запросы другого.
//
//   - без заголовка запрос идёт как прежде, таблица не трогается;
//   - ключ не UUID — 400 validation;
//   - повтор с тем же ключом, методом, путём и телом — сохранённый ответ с
//     Idempotent-Replayed: true, обработчик не вызывается;
//   - тот же ключ с другим телом, методом или путём — 422 conflict;
//   - дубль, пришедший, пока первый ещё выполняется, ждёт его ответа; не
//     дождался — 409 conflict с Retry-After.
//
// Сохраняются ответы со статусом ниже 500. Ответ 5xx снимает ключ: повтор
// выполнится заново.
func Idempotency(db *database.DB, log *logger.Logger) gin.HandlerFunc {
	return NewIdempotencyStore(db).Middleware(log)
}

// PurgeExpired удаляет ключи старше IdempotencyTTL.
func (s *IdempotencyStore) PurgeExpired(ctx context.Context) (int, error) {
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM idempotency_keys WHERE created_at < NOW() - make_interval(secs => $1)`,
		IdempotencyTTL.Seconds())
	if err != nil {
		return 0, fmt.Errorf("purge idempotency keys: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("purge idempotency keys: %w", err)
	}
	return int(n), nil
}

type idempotentRequest struct {
	userID   int64
	key      uuid.UUID
	method   string
	path     string
	bodyHash string
}

type claimOutcome int

const (
	claimOwned    claimOutcome = iota // ключ наш — выполняем
	claimReplay                       // ответ уже есть
	claimMismatch                     // ключ занят другим запросом
	claimInFlight                     // такой же запрос ещё выполняется
)

type storedResponse struct {
	status      int
	contentType string
	body        []byte
}

type claimResult struct {
	outcome   claimOutcome
	claimedAt time.Time
	stored    storedResponse
}

// Middleware собирает обработчик; см. Idempotency.
func (s *IdempotencyStore) Middleware(log *logger.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := c.GetHeader(IdempotencyKeyHeader)
		if raw == "" {
			c.Next()
			return
		}
		key, err := uuid.Parse(raw)
		// uuid.Parse принимает и {…}, и urn:uuid:…; ключ — ровно 36 знаков.
		if err != nil || len(raw) != 36 {
			response.ErrorCode(c, http.StatusBadRequest, apperrors.CodeValidation,
				"Заголовок Idempotency-Key должен быть UUID", nil)
			c.Abort()
			return
		}
		userID, ok := idempotencyUser(c)
		if !ok {
			response.Unauthorized(c, "Требуется авторизация")
			c.Abort()
			return
		}

		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				response.Error(c, http.StatusRequestEntityTooLarge, "Тело запроса слишком большое")
			} else {
				response.Error(c, http.StatusBadRequest, "Не удалось прочитать тело запроса")
			}
			c.Abort()
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(body))

		req := idempotentRequest{
			userID:   userID,
			key:      key,
			method:   c.Request.Method,
			path:     c.Request.URL.Path,
			bodyHash: sha256Hex(body),
		}

		ctx := c.Request.Context()
		result, err := s.claim(ctx, req)
		if err != nil {
			log.Errorw("Idempotency key claim failed", "error", err, "user_id", userID, "path", req.path)
			response.InternalError(c, "Не удалось обработать запрос")
			c.Abort()
			return
		}

		switch result.outcome {
		case claimReplay:
			c.Header(IdempotentReplayedHeader, "true")
			c.Data(result.stored.status, result.stored.contentType, result.stored.body)
			c.Abort()
		case claimMismatch:
			response.ErrorCode(c, http.StatusUnprocessableEntity, apperrors.CodeConflict,
				"Ключ Idempotency-Key уже использован для другого запроса", nil)
			c.Abort()
		case claimInFlight:
			c.Header("Retry-After", "1")
			response.ErrorCode(c, http.StatusConflict, apperrors.CodeConflict,
				"Такой же запрос ещё выполняется", nil)
			c.Abort()
		case claimOwned:
			s.execute(c, req, result.claimedAt, log)
		}
	}
}

// execute выполняет обработчик и записывает его ответ под ключом.
func (s *IdempotencyStore) execute(c *gin.Context, req idempotentRequest, claimedAt time.Time, log *logger.Logger) {
	capture := &capturingWriter{ResponseWriter: c.Writer}
	c.Writer = capture

	// Запись ответа — и после обрыва соединения: это ровно случай, ради
	// которого ключ существует.
	finishCtx := func() (context.Context, context.CancelFunc) {
		return context.WithTimeout(context.WithoutCancel(c.Request.Context()), idempotencyFinishTimeout)
	}

	done := false
	defer func() {
		if done {
			return
		}
		// Паника обработчика: ключ освобождается, повтор выполнится заново.
		ctx, cancel := finishCtx()
		defer cancel()
		if err := s.release(ctx, req, claimedAt); err != nil {
			log.Errorw("Idempotency key release failed", "error", err, "user_id", req.userID)
		}
	}()

	c.Next()

	ctx, cancel := finishCtx()
	defer cancel()
	status := c.Writer.Status()
	var err error
	if status >= http.StatusInternalServerError {
		err = s.release(ctx, req, claimedAt)
	} else {
		err = s.complete(ctx, req, claimedAt, storedResponse{
			status:      status,
			contentType: c.Writer.Header().Get("Content-Type"),
			body:        capture.body.Bytes(),
		})
	}
	done = true
	if err != nil {
		// Ключ остаётся «в работе» и освободится через idempotencyStaleAfter:
		// повтор до этого получит 409, а не второе выполнение.
		log.Errorw("Idempotency key finish failed", "error", err, "user_id", req.userID, "status", status)
	}
}

// claim занимает ключ или сообщает, что с ним уже сделано.
//
// Вставка идёт первой: из двух одновременных запросов первичный ключ
// пропускает один, второй видит чужую строку. Строка старше суток или
// брошенная «в работе» занимается заново тем же оператором.
func (s *IdempotencyStore) claim(ctx context.Context, req idempotentRequest) (claimResult, error) {
	deadline := time.Now().Add(s.wait)
	for {
		var claimedAt time.Time
		err := s.db.QueryRowContext(ctx, `
			INSERT INTO idempotency_keys (user_id, key, method, path, body_hash)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (user_id, key) DO UPDATE
			   SET method = EXCLUDED.method, path = EXCLUDED.path, body_hash = EXCLUDED.body_hash,
			       status = NULL, content_type = NULL, response = NULL, created_at = NOW()
			 WHERE idempotency_keys.created_at < NOW() - make_interval(secs => $6)
			    OR (idempotency_keys.status IS NULL
			        AND idempotency_keys.created_at < NOW() - make_interval(secs => $7))
			RETURNING created_at`,
			req.userID, req.key, req.method, req.path, req.bodyHash,
			IdempotencyTTL.Seconds(), s.staleAfter.Seconds()).Scan(&claimedAt)
		if err == nil {
			return claimResult{outcome: claimOwned, claimedAt: claimedAt}, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return claimResult{}, fmt.Errorf("claim idempotency key: %w", err)
		}

		var (
			method, path, bodyHash string
			status                 sql.NullInt32
			contentType            sql.NullString
			body                   []byte
		)
		err = s.db.QueryRowContext(ctx, `
			SELECT method, path, body_hash, status, content_type, response
			  FROM idempotency_keys WHERE user_id = $1 AND key = $2`,
			req.userID, req.key).Scan(&method, &path, &bodyHash, &status, &contentType, &body)
		if errors.Is(err, sql.ErrNoRows) {
			// Первый запрос кончился 5xx и снял ключ — пробуем занять снова.
			continue
		}
		if err != nil {
			return claimResult{}, fmt.Errorf("read idempotency key: %w", err)
		}

		if method != req.method || path != req.path || bodyHash != req.bodyHash {
			return claimResult{outcome: claimMismatch}, nil
		}
		if status.Valid {
			return claimResult{outcome: claimReplay, stored: storedResponse{
				status: int(status.Int32), contentType: contentType.String, body: body,
			}}, nil
		}
		if !time.Now().Before(deadline) {
			return claimResult{outcome: claimInFlight}, nil
		}
		select {
		case <-ctx.Done():
			return claimResult{}, ctx.Err()
		case <-time.After(s.poll):
		}
	}
}

func (s *IdempotencyStore) complete(ctx context.Context, req idempotentRequest, claimedAt time.Time, r storedResponse) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE idempotency_keys SET status = $3, content_type = $4, response = $5
		 WHERE user_id = $1 AND key = $2 AND created_at = $6 AND status IS NULL`,
		req.userID, req.key, r.status, r.contentType, r.body, claimedAt)
	if err != nil {
		return fmt.Errorf("store idempotent response: %w", err)
	}
	return nil
}

// release снимает свою строку «в работе». created_at отличает её от строки,
// которую после истечения занял другой запрос.
func (s *IdempotencyStore) release(ctx context.Context, req idempotentRequest, claimedAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		DELETE FROM idempotency_keys
		 WHERE user_id = $1 AND key = $2 AND created_at = $3 AND status IS NULL`,
		req.userID, req.key, claimedAt)
	if err != nil {
		return fmt.Errorf("release idempotency key: %w", err)
	}
	return nil
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func idempotencyUser(c *gin.Context) (int64, bool) {
	v, ok := c.Get("user_id")
	if !ok {
		return 0, false
	}
	id, ok := v.(int64)
	return id, ok && id > 0
}

// capturingWriter копирует тело ответа, чтобы сохранить его под ключом.
type capturingWriter struct {
	gin.ResponseWriter
	body bytes.Buffer
}

func (w *capturingWriter) Write(b []byte) (int, error) {
	w.body.Write(b)
	return w.ResponseWriter.Write(b)
}

func (w *capturingWriter) WriteString(s string) (int, error) {
	w.body.WriteString(s)
	return w.ResponseWriter.WriteString(s)
}
