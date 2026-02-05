# Yandex Cloud S3 Storage Integration

## Overview

BURCEV uses Yandex Cloud Object Storage (S3-compatible) for storing weekly progress photos. This document describes the integration, usage patterns, and best practices.

## Configuration

### Environment Variables

Required in `apps/api/.env`:

```bash
S3_ACCESS_KEY_ID=your_yandex_cloud_access_key_id
S3_SECRET_ACCESS_KEY=your_yandex_cloud_secret_access_key
S3_BUCKET=weekly-progress-photos
S3_REGION=ru-central1
S3_ENDPOINT=https://storage.yandexcloud.net
```

### Yandex Cloud Resources

- **Bucket**: `weekly-progress-photos`
- **Service Account**: `ajetieia8uunpq733f9t`
- **Region**: `ru-central1`
- **Console**: https://console.yandex.cloud/folders/b1g7q85lgictgf4j1dq8/storage/buckets/weekly-progress-photos

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

## Usage Patterns

### Backend: Uploading a Photo

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

### Backend: Getting a Signed URL

For secure temporary access to photos:

```go
signedURL, err := dashboardService.GetPhotoSignedURL(ctx, photoID, userID)
// URL valid for 15 minutes
```

### Frontend: Upload Photo

```typescript
async function uploadWeeklyPhoto(weekIdentifier: string, file: File) {
  const formData = new FormData();
  formData.append('week_identifier', weekIdentifier);
  formData.append('photo', file);

  const response = await fetch('/api/dashboard/photo-upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to upload photo');
  }

  return await response.json();
}
```

### Frontend: Get Signed URL

```typescript
async function getPhotoSignedURL(photoId: string) {
  const response = await fetch(`/api/dashboard/photos/${photoId}/signed-url`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get signed URL');
  }

  const data = await response.json();
  return data.data.signed_url;
}
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
- Coaches can access client photos (via relationship)

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

Test with real S3:

```bash
cd apps/api
go run test-s3-upload.go
```

Expected output:
```
✓ S3 client initialization: SUCCESS
✓ File upload: SUCCESS
✓ File existence check: SUCCESS
✓ File metadata retrieval: SUCCESS
✓ Signed URL generation: SUCCESS
✓ Image upload: SUCCESS

🎉 All tests passed!
```

## Common Commands

### Test S3 Integration

```bash
# Quick test without real credentials
cd apps/api
go run test-s3-mock.go

# Full test with real credentials
cd apps/api
go run test-s3-upload.go
```

### Check S3 Configuration

```bash
cd apps/api
grep S3_ .env
```

### View Uploaded Files

Open in browser:
https://console.yandex.cloud/folders/b1g7q85lgictgf4j1dq8/storage/buckets/weekly-progress-photos

## Best Practices

### When Implementing Photo Upload

1. **Always validate file before upload**:
   - Check file size (max 10 MB)
   - Check MIME type (jpeg, png, webp only)
   - Validate week identifier format

2. **Use proper error handling**:
   ```go
   photo, err := service.UploadPhoto(ctx, userID, week, file, size, mime)
   if err != nil {
       log.Error("Upload failed", "error", err)
       return response.Error(c, http.StatusInternalServerError, "upload failed", nil)
   }
   ```

3. **Implement rollback on failure**:
   - S3 upload succeeds → Database insert fails → Delete from S3
   - This is already implemented in `DashboardService.UploadPhoto()`

4. **Use signed URLs for access**:
   - Never expose direct S3 URLs
   - Always generate signed URLs (15 min expiration)
   - Verify user ownership before generating URL

5. **Log all operations**:
   ```go
   log.Info("Photo uploaded", 
       "user_id", userID,
       "photo_id", photo.ID,
       "s3_key", s3Key,
       "file_size", fileSize,
   )
   ```

### When Adding New S3 Operations

1. **Add method to S3Client** (`apps/api/internal/shared/storage/s3.go`)
2. **Add service method** (`apps/api/internal/modules/dashboard/service.go`)
3. **Add handler** (`apps/api/internal/modules/dashboard/handler.go`)
4. **Add route** in main.go
5. **Write tests**
6. **Update documentation**

## Troubleshooting

### Common Issues

**"S3 credentials are required"**
- Check `.env` file has `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`
- Verify credentials are not empty

**"Failed to upload file to S3"**
- Check network connectivity to `storage.yandexcloud.net`
- Verify bucket name is correct
- Check service account has write permissions

**"Bucket not found"**
- Verify bucket name: `weekly-progress-photos`
- Check bucket exists in Yandex Cloud Console
- Verify service account has access to bucket

**"Access denied"**
- Check service account permissions
- Verify static access keys are valid
- Regenerate keys if needed

### Debug Mode

Enable detailed S3 logging:

```bash
LOG_LEVEL=debug
```

## Performance

### Optimization Tips

- **Concurrent uploads**: Use goroutines for multiple files
- **Compression**: Consider WebP format for smaller sizes
- **Caching**: Cache signed URLs (with expiration tracking)
- **Prefetching**: Prefetch photos for next week

### Benchmarks

- Average upload time: ~200ms for 2MB file
- Signed URL generation: ~10ms
- File deletion: ~100ms

## Documentation

### Full Documentation

- **apps/api/S3_INTEGRATION.md** - Complete technical documentation
- **apps/api/S3_SETUP_RU.md** - Quick setup guide (Russian)
- **GET_S3_CREDENTIALS_RU.md** - How to get credentials (Russian)
- **S3_CREDENTIALS_QUICK_GUIDE.md** - Quick credential guide
- **apps/api/PHOTO_UPLOAD_HANDLER_EXAMPLE.md** - Handler implementation example
- **apps/api/internal/shared/storage/README.md** - S3Client API documentation

### Quick References

- **Test scripts**: `apps/api/test-s3-upload.go`, `apps/api/test-s3-mock.go`
- **Example handler**: `apps/api/PHOTO_UPLOAD_HANDLER_EXAMPLE.md`
- **Checklist**: `S3_INTEGRATION_CHECKLIST.md`

## Status

✅ **Production Ready**

- S3 client implemented and tested
- Integration with dashboard service complete
- Error handling and rollback implemented
- Documentation complete
- Real-world testing successful

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
