# Storage Package

This package provides S3-compatible storage client for Yandex Cloud Object Storage.

## Features

- Upload files to S3
- Delete files from S3
- Generate pre-signed URLs for temporary access
- Check file existence
- Get file metadata

## Usage

### Initialize S3 Client

```go
import (
    "github.com/burcev/api/internal/shared/storage"
    "github.com/burcev/api/internal/shared/logger"
)

// Create configuration
config := &storage.S3Config{
    AccessKeyID:     "your-access-key-id",
    SecretAccessKey: "your-secret-access-key",
    Bucket:          "weekly-progress-photos",
    Region:          "ru-central1",
    Endpoint:        "https://storage.yandexcloud.net",
}

// Create logger
log := logger.New("app", "info")

// Initialize client
s3Client, err := storage.NewS3Client(config, log)
if err != nil {
    log.Fatal("Failed to create S3 client", "error", err)
}
```

### Upload File

```go
import (
    "context"
    "os"
)

ctx := context.Background()

// Open file
file, err := os.Open("photo.jpg")
if err != nil {
    log.Error("Failed to open file", "error", err)
    return
}
defer file.Close()

// Get file info
fileInfo, _ := file.Stat()
fileSize := fileInfo.Size()

// Upload to S3
url, err := s3Client.UploadFile(
    ctx,
    "weekly-photos/123/2024-W01/photo.jpg",
    file,
    "image/jpeg",
    fileSize,
)
if err != nil {
    log.Error("Failed to upload file", "error", err)
    return
}

log.Info("File uploaded", "url", url)
```

### Generate Signed URL

```go
import "time"

// Generate URL valid for 15 minutes
signedURL, err := s3Client.GetSignedURL(
    ctx,
    "weekly-photos/123/2024-W01/photo.jpg",
    15*time.Minute,
)
if err != nil {
    log.Error("Failed to generate signed URL", "error", err)
    return
}

log.Info("Signed URL generated", "url", signedURL)
```

### Delete File

```go
err := s3Client.DeleteFile(
    ctx,
    "weekly-photos/123/2024-W01/photo.jpg",
)
if err != nil {
    log.Error("Failed to delete file", "error", err)
    return
}

log.Info("File deleted")
```

### Check File Existence

```go
exists, err := s3Client.FileExists(
    ctx,
    "weekly-photos/123/2024-W01/photo.jpg",
)
if err != nil {
    log.Error("Failed to check file existence", "error", err)
    return
}

if exists {
    log.Info("File exists")
} else {
    log.Info("File does not exist")
}
```

### Get File Size

```go
size, err := s3Client.GetFileSize(
    ctx,
    "weekly-photos/123/2024-W01/photo.jpg",
)
if err != nil {
    log.Error("Failed to get file size", "error", err)
    return
}

log.Info("File size", "bytes", size)
```

## Configuration

### Environment Variables

```bash
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-secret-access-key
S3_BUCKET=weekly-progress-photos
S3_REGION=ru-central1
S3_ENDPOINT=https://storage.yandexcloud.net
```

### S3Config Structure

```go
type S3Config struct {
    AccessKeyID     string // Required
    SecretAccessKey string // Required
    Bucket          string // Required
    Region          string // Default: ru-central1
    Endpoint        string // Default: https://storage.yandexcloud.net
}
```

## Testing

### Run Unit Tests

```bash
go test ./internal/shared/storage/
```

### Run Tests with Coverage

```bash
go test -cover ./internal/shared/storage/
```

### Run Integration Tests

Requires real S3 credentials:

```bash
export S3_ACCESS_KEY_ID=test-key
export S3_SECRET_ACCESS_KEY=test-secret
go test -tags=integration ./internal/shared/storage/
```

## Error Handling

All methods return errors that should be handled:

```go
url, err := s3Client.UploadFile(ctx, key, data, contentType, size)
if err != nil {
    // Handle error
    log.Error("Upload failed", "error", err)
    return
}
```

Common errors:
- `"S3 credentials are required"` - Missing access keys
- `"S3 bucket name is required"` - Missing bucket name
- `"failed to upload file to S3"` - Upload failed
- `"failed to delete file from S3"` - Deletion failed
- `"failed to generate signed URL"` - Signed URL generation failed

## Best Practices

1. **Always close readers**: Use `defer file.Close()` when opening files
2. **Handle errors**: Check and log all errors
3. **Use context**: Pass context for cancellation support
4. **Set timeouts**: Use context with timeout for long operations
5. **Validate input**: Check file size and type before upload
6. **Clean up on failure**: Delete uploaded files if subsequent operations fail

## Example: Upload with Rollback

```go
func uploadWithRollback(ctx context.Context, s3Client *storage.S3Client, db *sql.DB) error {
    // Upload to S3
    url, err := s3Client.UploadFile(ctx, key, data, contentType, size)
    if err != nil {
        return fmt.Errorf("upload failed: %w", err)
    }

    // Save to database
    _, err = db.ExecContext(ctx, "INSERT INTO photos (url) VALUES ($1)", url)
    if err != nil {
        // Rollback: delete from S3
        deleteErr := s3Client.DeleteFile(ctx, key)
        if deleteErr != nil {
            log.Error("Failed to cleanup S3 file", "error", deleteErr)
        }
        return fmt.Errorf("database insert failed: %w", err)
    }

    return nil
}
```

## Dependencies

- `github.com/aws/aws-sdk-go-v2` - AWS SDK for Go v2
- `github.com/aws/aws-sdk-go-v2/service/s3` - S3 service client
- `github.com/aws/aws-sdk-go-v2/credentials` - Credentials provider

## References

- [Yandex Cloud Object Storage](https://yandex.cloud/ru/docs/storage/)
- [AWS SDK for Go v2](https://aws.github.io/aws-sdk-go-v2/)
- [S3 API Reference](https://docs.aws.amazon.com/AmazonS3/latest/API/)
