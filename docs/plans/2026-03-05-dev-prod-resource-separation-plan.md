# Dev/Prod Resource Separation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate shared Yandex Cloud resources (PostgreSQL, S3, service accounts) into isolated dev and prod environments.

**Architecture:** Add S3 path prefix support to the storage layer so all S3 operations automatically prepend `dev/` or `prod/`. Create separate DB, DB users, and service accounts via `yc` CLI. Update env files.

**Tech Stack:** Go, Yandex Cloud (`yc` CLI), PostgreSQL, S3-compatible Object Storage

---

### Task 1: Add PathPrefix to S3Client

**Files:**
- Modify: `apps/api/internal/shared/storage/s3.go:33-39` (S3Config struct)
- Modify: `apps/api/internal/shared/storage/s3.go:24-30` (S3Client struct)
- Modify: `apps/api/internal/shared/storage/s3.go:42-85` (NewS3Client)
- Test: `apps/api/internal/shared/storage/s3_test.go`

**Step 1: Write the failing test**

Add test to `apps/api/internal/shared/storage/s3_test.go`:

```go
func TestS3Client_PathPrefix(t *testing.T) {
	mockClient := &MockS3Client{}
	client := &S3Client{
		client:     mockClient,
		bucket:     "test-bucket",
		region:     "ru-central1",
		endpoint:   "https://storage.yandexcloud.net",
		pathPrefix: "dev/",
		log:        testLogger(),
	}

	// Upload should prepend prefix to key
	mockClient.putObjectFn = func(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
		assert.Equal(t, "dev/avatars/1/avatar.jpg", *params.Key)
		return &s3.PutObjectOutput{}, nil
	}

	_, err := client.UploadFile(context.Background(), "avatars/1/avatar.jpg", bytes.NewReader([]byte("test")), "image/jpeg", 4)
	assert.NoError(t, err)
}

func TestS3Client_EmptyPathPrefix(t *testing.T) {
	mockClient := &MockS3Client{}
	client := &S3Client{
		client:     mockClient,
		bucket:     "test-bucket",
		region:     "ru-central1",
		endpoint:   "https://storage.yandexcloud.net",
		pathPrefix: "",
		log:        testLogger(),
	}

	mockClient.putObjectFn = func(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
		assert.Equal(t, "avatars/1/avatar.jpg", *params.Key)
		return &s3.PutObjectOutput{}, nil
	}

	_, err := client.UploadFile(context.Background(), "avatars/1/avatar.jpg", bytes.NewReader([]byte("test")), "image/jpeg", 4)
	assert.NoError(t, err)
}
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && go test ./internal/shared/storage/ -run TestS3Client_PathPrefix -v`
Expected: FAIL — `pathPrefix` field doesn't exist

**Step 3: Add PathPrefix to S3Config and S3Client**

In `apps/api/internal/shared/storage/s3.go`:

Add `PathPrefix` field to `S3Config`:
```go
type S3Config struct {
	AccessKeyID     string
	SecretAccessKey string
	Bucket          string
	Region          string
	Endpoint        string
	PathPrefix      string // e.g. "dev/" or "prod/" — prepended to all S3 keys
}
```

Add `pathPrefix` field to `S3Client`:
```go
type S3Client struct {
	client     S3API
	bucket     string
	region     string
	endpoint   string
	pathPrefix string
	log        *logger.Logger
}
```

In `NewS3Client`, store the prefix:
```go
return &S3Client{
	client:     client,
	bucket:     cfg.Bucket,
	region:     cfg.Region,
	endpoint:   cfg.Endpoint,
	pathPrefix: cfg.PathPrefix,
	log:        log,
}, nil
```

Add a helper method:
```go
// prefixKey prepends the configured path prefix to an S3 object key.
func (s *S3Client) prefixKey(key string) string {
	return s.pathPrefix + key
}
```

**Step 4: Update all S3 operations to use prefixKey**

In each method, replace raw `key` with `s.prefixKey(key)` in the S3 API call params:

- `UploadFile`: `Key: aws.String(s.prefixKey(key))` and update URL: `fmt.Sprintf("%s/%s/%s", s.endpoint, s.bucket, s.prefixKey(key))`
- `GetFile`: `Key: aws.String(s.prefixKey(key))`
- `DeleteFile`: `Key: aws.String(s.prefixKey(key))`
- `GetSignedURL`: `Key: aws.String(s.prefixKey(key))`
- `FileExists`: `Key: aws.String(s.prefixKey(key))`
- `GetFileSize`: `Key: aws.String(s.prefixKey(key))`

**Step 5: Run tests**

Run: `cd apps/api && go test ./internal/shared/storage/ -v`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add apps/api/internal/shared/storage/s3.go apps/api/internal/shared/storage/s3_test.go
git commit -m "feat(storage): add S3 path prefix support for dev/prod isolation"
```

---

### Task 2: Add S3_PATH_PREFIX to config

**Files:**
- Modify: `apps/api/internal/config/config.go:12-76` (Config struct)
- Modify: `apps/api/internal/config/config.go:79-155` (Load function)
- Modify: `apps/api/cmd/server/main.go:91-157` (S3 client initialization)

**Step 1: Add S3PathPrefix to Config struct**

In `apps/api/internal/config/config.go`, add one field:
```go
// S3 Path Prefix (dev/ or prod/ — applied to all S3 clients)
S3PathPrefix string
```

**Step 2: Load S3_PATH_PREFIX in Load()**

Add to the `cfg := &Config{...}` block:
```go
S3PathPrefix: getEnv("S3_PATH_PREFIX", ""),
```

**Step 3: Pass PathPrefix when creating S3 clients in main.go**

In `apps/api/cmd/server/main.go`, add `PathPrefix: cfg.S3PathPrefix` to each of the 4 `storage.S3Config{}` structs:

```go
s3Client, err = storage.NewS3Client(&storage.S3Config{
	AccessKeyID:     cfg.WeeklyPhotosS3AccessKeyID,
	SecretAccessKey: cfg.WeeklyPhotosS3SecretAccessKey,
	Bucket:          cfg.WeeklyPhotosS3Bucket,
	Region:          cfg.WeeklyPhotosS3Region,
	Endpoint:        cfg.WeeklyPhotosS3Endpoint,
	PathPrefix:      cfg.S3PathPrefix,
}, log)
```

Repeat for `profilePhotosS3`, `chatS3`, `contentS3`.

**Step 4: Run tests**

Run: `cd apps/api && go test ./... -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add apps/api/internal/config/config.go apps/api/cmd/server/main.go
git commit -m "feat(config): add S3_PATH_PREFIX env variable for all S3 clients"
```

---

### Task 3: Update env example files

**Files:**
- Modify: `deploy/env/.env.dev.example`
- Modify: `deploy/env/.env.prod.example`
- Modify: `apps/api/.env.example`

**Step 1: Add S3_PATH_PREFIX and DB vars to .env.dev.example**

Add to `deploy/env/.env.dev.example`:
```bash
# Database (dev)
DATABASE_URL=postgresql://burcev-dev:password@c-c9q1384cb8tqrg09o8n4.rw.mdb.yandexcloud.net:6432/web-app-db-dev?sslmode=require
DB_MAX_OPEN_CONNS=10
DB_MAX_IDLE_CONNS=3

# JWT
JWT_SECRET=dev-jwt-secret

# CORS
CORS_ORIGIN=https://dev.burcev.team

# SMTP
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USERNAME=your-email@yandex.ru
SMTP_PASSWORD=your-app-password
SMTP_FROM_ADDRESS=noreply@burcev.team
SMTP_FROM_NAME=BURCEV

# Password Reset
RESET_PASSWORD_URL=https://dev.burcev.team/reset-password

# S3 (Yandex.Cloud Object Storage) — dev service account
S3_ACCESS_KEY_ID=dev_access_key
S3_SECRET_ACCESS_KEY=dev_secret_key
S3_REGION=ru-central1
S3_ENDPOINT=https://storage.yandexcloud.net
S3_PATH_PREFIX=dev/
```

**Step 2: Add S3_PATH_PREFIX to .env.prod.example**

Add after the existing S3 vars in `deploy/env/.env.prod.example`:
```bash
S3_PATH_PREFIX=prod/
```

Update S3 credentials comment to indicate prod service account:
```bash
# S3 (Yandex.Cloud Object Storage) — prod service account
```

**Step 3: Add S3_PATH_PREFIX to apps/api/.env.example**

Add:
```bash
# S3 Path Prefix (dev/ or prod/)
S3_PATH_PREFIX=dev/
```

**Step 4: Commit**

```bash
git add deploy/env/.env.dev.example deploy/env/.env.prod.example apps/api/.env.example
git commit -m "docs(env): add S3_PATH_PREFIX and separate DB config to env examples"
```

---

### Task 4: Create Yandex Cloud resources — runbook

**Files:**
- Create: `docs/runbooks/dev-prod-resource-setup.md`

**Step 1: Write the runbook**

Create `docs/runbooks/dev-prod-resource-setup.md` with the following `yc` commands:

```markdown
# Dev/Prod Resource Setup — Yandex Cloud

## Prerequisites
- `yc` CLI installed and configured
- Access to the Yandex Cloud folder

## 1. Create Service Accounts

### Dev SA
yc iam service-account create --name burcev-dev --description "Dev environment SA"

# Save the SA ID from output
DEV_SA_ID=<id from output>

# Create static access key for S3
yc iam access-key create --service-account-name burcev-dev --description "S3 dev access"

# Save access_key.key_id and secret from output → .env.dev S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY

### Prod SA
yc iam service-account create --name burcev-prod --description "Prod environment SA"

PROD_SA_ID=<id from output>

yc iam access-key create --service-account-name burcev-prod --description "S3 prod access"

# Save → .env.prod S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY

## 2. Grant S3 permissions to SAs

# Both SAs need storage.editor on all buckets
yc resource-manager folder add-access-binding <folder-id> \
  --role storage.editor \
  --subject serviceAccount:$DEV_SA_ID

yc resource-manager folder add-access-binding <folder-id> \
  --role storage.editor \
  --subject serviceAccount:$PROD_SA_ID

## 3. Create Dev Database and User

# Create dev user in the existing cluster
yc managed-postgresql user create burcev-dev \
  --cluster-name <cluster-name> \
  --password <secure-password>

# Create dev database
yc managed-postgresql database create web-app-db-dev \
  --cluster-name <cluster-name> \
  --owner burcev-dev

## 4. Restrict existing user to prod DB only

# (Optional) If the existing user has access to all DBs,
# consider revoking access to web-app-db-dev

## 5. Run migrations on dev DB

cd apps/api
DATABASE_URL="postgresql://burcev-dev:<password>@c-c9q1384cb8tqrg09o8n4.rw.mdb.yandexcloud.net:6432/web-app-db-dev?sslmode=require" \
  go run cmd/server/main.go --migrate
# Or use your migration tool directly

## 6. Update server env files

# SSH to server, update:
# ${DEPLOY_PATH}/.env.dev — new DATABASE_URL, S3 credentials, S3_PATH_PREFIX=dev/
# ${DEPLOY_PATH}/.env.prod — new S3 credentials, S3_PATH_PREFIX=prod/

## 7. Deactivate old SA

# After verifying both environments work:
yc iam service-account delete --name <old-sa-name>
# Or just delete its access keys:
yc iam access-key delete <old-key-id>

## 8. Verify

# Check dev:
curl https://dev.burcev.team/api/v1/health

# Check prod:
curl https://burcev.team/api/v1/health
```

**Step 2: Commit**

```bash
git add docs/runbooks/dev-prod-resource-setup.md
git commit -m "docs: add runbook for dev/prod Yandex Cloud resource setup"
```

---

### Task 5: Update local dev .env

**Files:**
- Modify: `apps/api/.env`

**Step 1: Add S3_PATH_PREFIX to local dev env**

Add to `apps/api/.env`:
```bash
S3_PATH_PREFIX=dev/
```

**Step 2: Run the app locally to verify it starts**

Run: `cd apps/api && go run cmd/server/main.go`
Expected: Server starts, logs show S3 clients initialized

**Step 3: Run all tests**

Run: `cd apps/api && go test ./... -v`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add apps/api/.env
git commit -m "chore: add S3_PATH_PREFIX=dev/ to local dev env"
```

---

### Summary of changes

| What | Dev | Prod |
|---|---|---|
| Database | `web-app-db-dev` (new) | `web-app-db` (existing) |
| DB User | `burcev-dev` (new) | existing user |
| S3 Prefix | `dev/` | `prod/` |
| Service Account | `burcev-dev` (new) | `burcev-prod` (new) |
| Code changes | `S3Client.pathPrefix` + `S3_PATH_PREFIX` env var | same |
