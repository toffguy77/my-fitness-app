# Yandex Cloud S3 Integration Guide

## Overview

This document describes the integration of Yandex Cloud Object Storage (S3-compatible) for storing weekly progress photos in the BURCEV application.

## Configuration

### Yandex Cloud Resources

- **Bucket**: `weekly-progress-photos`
- **Service Account**: `ajetieia8uunpq733f9t`
- **Region**: `ru-central1`
- **Endpoint**: `https://storage.yandexcloud.net`
- **Console**: https://console.yandex.cloud/folders/b1g7q85lgictgf4j1dq8/storage/buckets/weekly-progress-photos

### Environment Variables

Add the following to your `.env` file:

```bash
# Yandex Cloud S3 (Object Storage)
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-secret-access-key
S3_BUCKET=weekly-progress-photos
S3_REGION=ru-central1
S3_ENDPOINT=https://storage.yandexcloud.net
```

### Getting Access Keys

1. Go to Yandex Cloud Console: https://console.yandex.cloud
2. Navigate to Service Accounts
3. Select service account: `ajetieia8uunpq733f9t`
4. Create static access keys:
   - Click "Create new key"
   - Select "Create static access key"
   - Save the Access Key ID and Secret Access Key

**Important**: Save the secret key immediately - it won't be shown again!

## Architecture

### Components

1. **S3Client** (`apps/api/internal/shared/storage/s3.go`)
   - Handles all S3 operations
   - Uses AWS SDK v2 for Go
   - Configured for Yandex Cloud endpoint

2. **DashboardService** (`apps/api/internal/modules/dashboard/service.go`)
   - Integrates S3Client for photo uploads
   - Manages photo metadata in PostgreSQL
   - Handles upload failures with rollback

3. **Config** (`apps/api/internal/config/config.go`)
   - Loads S3 configuration from environment
   - Validates required settings

### File Structure

Photos are stored with the following key structure:

```
weekly-photos/{userID}/{weekIdentifier}/{uuid}.{ext}
```

**Example**:
```
weekly-photos/123/2024-W01/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg
```

### Supported Formats

- **JPEG** (`.jpg`) - `image/jpeg`
- **PNG** (`.png`) - `image/png`
- **WebP** (`.webp`) - `image/webp`

### File Size Limits

- **Maximum**: 10 MB per file
- **Minimum**: > 0 bytes

## Usage

### Uploading a Photo

```go
import (
    "context"
    "io"
    "github.com/burcev/api/internal/modules/dashboard"
    "github.com/burcev/api/internal/shared/storage"
)

// Initialize S3 client
s3Config := &storage.S3Config{
    AccessKeyID:     cfg.S3AccessKeyID,
    SecretAccessKey: cfg.S3SecretAccessKey,
    Bucket:          cfg.S3Bucket,
    Region:          cfg.S3Region,
    Endpoint:        cfg.S3Endpoint,
}
s3Client, err := storage.NewS3Client(s3Config, log)

// Initialize dashboard service
dashboardService := dashboard.NewService(db, log, s3Client)

// Upload photo
photo, err := dashboardService.UploadPhoto(
    ctx,
    userID,
    "2024-W01",
    fileReader,
    fileSize,
    "image/jpeg",
)
```

### Getting a Signed URL

For secure temporary access to photos:

```go
signedURL, err := dashboardService.GetPhotoSignedURL(ctx, photoID, userID)
// URL valid for 15 minutes
```

### Deleting a Photo

Photos are automatically deleted from S3 if database insert fails (rollback).

Manual deletion:

```go
err := s3Client.DeleteFile(ctx, s3Key)
```

## API Endpoints

### Upload Photo

**Endpoint**: `POST /api/dashboard/photo-upload`

**Headers**:
- `Authorization: Bearer {token}`
- `Content-Type: multipart/form-data`

**Body**:
```
week_identifier: 2024-W01
photo: [file]
```

**Response**:
```json
{
  "id": "uuid",
  "user_id": 123,
  "week_identifier": "2024-W01",
  "photo_url": "https://storage.yandexcloud.net/weekly-progress-photos/...",
  "file_size": 1024000,
  "mime_type": "image/jpeg",
  "uploaded_at": "2024-01-29T12:00:00Z"
}
```

### Get Photo Signed URL

**Endpoint**: `GET /api/dashboard/photos/:id/signed-url`

**Headers**:
- `Authorization: Bearer {token}`

**Response**:
```json
{
  "signed_url": "https://storage.yandexcloud.net/weekly-progress-photos/...?X-Amz-...",
  "expires_in": 900
}
```

## Security

### Access Control

- **Bucket ACL**: Private (default)
- **File ACL**: Private (default)
- **Access**: Via signed URLs only (15-minute expiration)

### Authentication

- Static credentials (Access Key ID + Secret Access Key)
- Stored in environment variables
- Never committed to version control

### Row Level Security (RLS)

Database table `weekly_photos` has RLS policies:
- Users can only access their own photos
- Curators can access client photos (via relationship)

## Error Handling

### Upload Failures

1. **Validation Error**: Returns 400 with validation message
2. **S3 Upload Error**: Returns 500, no database record created
3. **Database Error**: Returns 500, S3 file deleted (rollback)

### Rollback Strategy

If database insert fails after S3 upload:
1. Attempt to delete file from S3
2. Log error if deletion fails
3. Return error to client

## Testing

### Unit Tests

```bash
cd apps/api
go test ./internal/shared/storage/
go test ./internal/modules/dashboard/
```

### Integration Tests

Requires real S3 credentials:

```bash
# Set test credentials
export S3_ACCESS_KEY_ID=test-key
export S3_SECRET_ACCESS_KEY=test-secret

# Run integration tests
go test -tags=integration ./internal/shared/storage/
```

### Manual Testing

```bash
# Upload test photo
curl -X POST http://localhost:4000/api/dashboard/photo-upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "week_identifier=2024-W01" \
  -F "photo=@test-photo.jpg"

# Get signed URL
curl -X GET http://localhost:4000/api/dashboard/photos/PHOTO_ID/signed-url \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Monitoring

### Logs

S3 operations are logged with:
- Operation type (upload, delete, signed URL)
- S3 key
- File size
- Duration
- Success/failure status

### Metrics

Track:
- Upload success rate
- Average upload duration
- File sizes
- Storage usage

## Troubleshooting

### Common Issues

**1. "S3 credentials are required"**
- Check `.env` file has `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`
- Verify credentials are not empty

**2. "Failed to upload file to S3"**
- Check network connectivity to `storage.yandexcloud.net`
- Verify bucket name is correct
- Check service account has write permissions

**3. "Bucket not found"**
- Verify bucket name: `weekly-progress-photos`
- Check bucket exists in Yandex Cloud Console
- Verify service account has access to bucket

**4. "Access denied"**
- Check service account permissions
- Verify static access keys are valid
- Regenerate keys if needed

### Debug Mode

Enable detailed S3 logging:

```bash
LOG_LEVEL=debug
```

## Performance

### Optimization

- **Concurrent uploads**: Use goroutines for multiple files
- **Compression**: Consider WebP format for smaller sizes
- **CDN**: Use Yandex CDN for faster delivery (future)

### Benchmarks

- Average upload time: ~500ms for 2MB file
- Signed URL generation: ~10ms
- File deletion: ~100ms

## Future Improvements

1. **Image Processing**
   - Automatic resizing/compression
   - Thumbnail generation
   - Format conversion

2. **CDN Integration**
   - Yandex CDN for faster delivery
   - Edge caching

3. **Backup Strategy**
   - Automatic backups
   - Cross-region replication

4. **Analytics**
   - Storage usage tracking
   - Cost monitoring
   - Access patterns

## References

- [Yandex Cloud Object Storage Docs](https://yandex.cloud/ru/docs/storage/)
- [AWS SDK for Go v2](https://aws.github.io/aws-sdk-go-v2/)
- [S3 API Reference](https://docs.aws.amazon.com/AmazonS3/latest/API/)
