# Photo Upload Handler Example

## Handler Implementation

Create a handler for photo upload endpoint in `apps/api/internal/modules/dashboard/handler.go`:

```go
package dashboard

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
)

// Handler handles dashboard HTTP requests
type Handler struct {
	cfg     *config.Config
	log     *logger.Logger
	service *Service
}

// NewHandler creates a new dashboard handler
func NewHandler(cfg *config.Config, log *logger.Logger, service *Service) *Handler {
	return &Handler{
		cfg:     cfg,
		log:     log,
		service: service,
	}
}

// UploadPhoto handles photo upload requests
// POST /api/dashboard/photo-upload
func (h *Handler) UploadPhoto(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userID, exists := c.Get("user_id")
	if !exists {
		response.Error(c, http.StatusUnauthorized, "unauthorized", nil)
		return
	}

	// Parse multipart form
	err := c.Request.ParseMultipartForm(10 << 20) // 10 MB max
	if err != nil {
		h.log.Error("Failed to parse multipart form", "error", err)
		response.Error(c, http.StatusBadRequest, "invalid form data", nil)
		return
	}

	// Get week identifier
	weekIdentifier := c.PostForm("week_identifier")
	if weekIdentifier == "" {
		response.Error(c, http.StatusBadRequest, "week_identifier is required", nil)
		return
	}

	// Get uploaded file
	file, header, err := c.Request.FormFile("photo")
	if err != nil {
		h.log.Error("Failed to get uploaded file", "error", err)
		response.Error(c, http.StatusBadRequest, "photo file is required", nil)
		return
	}
	defer file.Close()

	// Get file info
	fileSize := int(header.Size)
	mimeType := header.Header.Get("Content-Type")

	// Validate file
	if err := h.service.ValidatePhoto(fileSize, mimeType); err != nil {
		h.log.Error("Photo validation failed", "error", err)
		response.Error(c, http.StatusBadRequest, err.Error(), nil)
		return
	}

	// Upload photo
	photo, err := h.service.UploadPhoto(
		c.Request.Context(),
		userID.(int64),
		weekIdentifier,
		file,
		fileSize,
		mimeType,
	)
	if err != nil {
		h.log.Error("Failed to upload photo", "error", err)
		response.Error(c, http.StatusInternalServerError, "failed to upload photo", nil)
		return
	}

	h.log.Info("Photo uploaded successfully",
		"user_id", userID,
		"photo_id", photo.ID,
		"week_identifier", weekIdentifier,
	)

	response.Success(c, http.StatusCreated, "photo uploaded successfully", photo)
}

// GetPhotoSignedURL handles signed URL generation requests
// GET /api/dashboard/photos/:id/signed-url
func (h *Handler) GetPhotoSignedURL(c *gin.Context) {
	// Get user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		response.Error(c, http.StatusUnauthorized, "unauthorized", nil)
		return
	}

	// Get photo ID from URL
	photoID := c.Param("id")
	if photoID == "" {
		response.Error(c, http.StatusBadRequest, "photo ID is required", nil)
		return
	}

	// Generate signed URL
	signedURL, err := h.service.GetPhotoSignedURL(
		c.Request.Context(),
		photoID,
		userID.(int64),
	)
	if err != nil {
		h.log.Error("Failed to generate signed URL", "error", err)
		response.Error(c, http.StatusInternalServerError, "failed to generate signed URL", nil)
		return
	}

	response.Success(c, http.StatusOK, "signed URL generated", gin.H{
		"signed_url": signedURL,
		"expires_in": 900, // 15 minutes in seconds
	})
}
```

## Router Setup

Add routes in your main router setup (e.g., `apps/api/cmd/server/main.go`):

```go
package main

import (
	"github.com/gin-gonic/gin"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/dashboard"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/shared/storage"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	// Initialize logger
	log := logger.New("api", cfg.LogLevel)

	// Initialize database
	db, err := database.NewDB(cfg, log)
	if err != nil {
		log.Fatal("Failed to connect to database", "error", err)
	}
	defer db.Close()

	// Initialize S3 client
	s3Config := &storage.S3Config{
		AccessKeyID:     cfg.S3AccessKeyID,
		SecretAccessKey: cfg.S3SecretAccessKey,
		Bucket:          cfg.S3Bucket,
		Region:          cfg.S3Region,
		Endpoint:        cfg.S3Endpoint,
	}
	s3Client, err := storage.NewS3Client(s3Config, log)
	if err != nil {
		log.Fatal("Failed to create S3 client", "error", err)
	}

	// Initialize dashboard service and handler
	dashboardService := dashboard.NewService(db, log, s3Client)
	dashboardHandler := dashboard.NewHandler(cfg, log, dashboardService)

	// Setup router
	router := gin.Default()

	// Auth middleware
	authMiddleware := middleware.NewAuthMiddleware(cfg, log)

	// Dashboard routes
	dashboardRoutes := router.Group("/api/dashboard")
	dashboardRoutes.Use(authMiddleware.RequireAuth())
	{
		dashboardRoutes.POST("/photo-upload", dashboardHandler.UploadPhoto)
		dashboardRoutes.GET("/photos/:id/signed-url", dashboardHandler.GetPhotoSignedURL)
	}

	// Start server
	log.Info("Starting server", "port", cfg.Port)
	if err := router.Run(fmt.Sprintf(":%d", cfg.Port)); err != nil {
		log.Fatal("Failed to start server", "error", err)
	}
}
```

## Testing with cURL

### Upload Photo

```bash
# Upload a photo
curl -X POST http://localhost:4000/api/dashboard/photo-upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "week_identifier=2024-W01" \
  -F "photo=@/path/to/photo.jpg"

# Response:
{
  "status": "success",
  "message": "photo uploaded successfully",
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "user_id": 123,
    "week_start": "2024-01-01T00:00:00Z",
    "week_end": "2024-01-07T00:00:00Z",
    "week_identifier": "2024-W01",
    "photo_url": "https://storage.yandexcloud.net/weekly-progress-photos/weekly-photos/123/2024-W01/uuid.jpg",
    "file_size": 1024000,
    "mime_type": "image/jpeg",
    "uploaded_at": "2024-01-29T12:00:00Z",
    "created_at": "2024-01-29T12:00:00Z"
  }
}
```

### Get Signed URL

```bash
# Get signed URL for photo
curl -X GET http://localhost:4000/api/dashboard/photos/PHOTO_ID/signed-url \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Response:
{
  "status": "success",
  "message": "signed URL generated",
  "data": {
    "signed_url": "https://storage.yandexcloud.net/weekly-progress-photos/...?X-Amz-Algorithm=...",
    "expires_in": 900
  }
}
```

## Testing with Postman

### Upload Photo

1. **Method**: POST
2. **URL**: `http://localhost:4000/api/dashboard/photo-upload`
3. **Headers**:
   - `Authorization: Bearer YOUR_JWT_TOKEN`
4. **Body** (form-data):
   - `week_identifier`: `2024-W01` (text)
   - `photo`: Select file (file)

### Get Signed URL

1. **Method**: GET
2. **URL**: `http://localhost:4000/api/dashboard/photos/{photoId}/signed-url`
3. **Headers**:
   - `Authorization: Bearer YOUR_JWT_TOKEN`

## Error Responses

### Validation Error

```json
{
  "status": "error",
  "message": "file size must be 10MB or less",
  "data": null
}
```

### Unauthorized

```json
{
  "status": "error",
  "message": "unauthorized",
  "data": null
}
```

### Upload Failed

```json
{
  "status": "error",
  "message": "failed to upload photo",
  "data": null
}
```

## Frontend Integration Example

```typescript
// Upload photo
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

// Get signed URL
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

// Usage
const file = document.querySelector('input[type="file"]').files[0];
const result = await uploadWeeklyPhoto('2024-W01', file);
console.log('Photo uploaded:', result.data.photo_url);

// Get signed URL for viewing
const signedURL = await getPhotoSignedURL(result.data.id);
console.log('View photo at:', signedURL);
```

## Security Considerations

1. **Authentication**: Always verify JWT token before processing upload
2. **File Validation**: Validate file size and MIME type
3. **Rate Limiting**: Implement rate limiting for upload endpoint
4. **Signed URLs**: Use short expiration times (15 minutes)
5. **User Ownership**: Verify user owns the photo before generating signed URL

## Next Steps

1. Implement the handler in your codebase
2. Add routes to your router
3. Test with real S3 credentials
4. Add rate limiting middleware
5. Implement frontend upload component
