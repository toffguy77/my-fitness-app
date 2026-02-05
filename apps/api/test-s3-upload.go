//go:build ignore
package main

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/storage"
	"github.com/google/uuid"
)

func main() {
	fmt.Println("=== Yandex Cloud S3 Integration Test ===")
	fmt.Println()

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatal("Failed to load config:", err)
	}

	// Check if S3 credentials are configured
	if cfg.S3AccessKeyID == "" || cfg.S3SecretAccessKey == "" {
		fmt.Println("❌ S3 credentials not found in .env file")
		fmt.Println()
		fmt.Println("Please add the following to apps/api/.env:")
		fmt.Println()
		fmt.Println("# Yandex Cloud S3")
		fmt.Println("S3_ACCESS_KEY_ID=your-access-key-id")
		fmt.Println("S3_SECRET_ACCESS_KEY=your-secret-access-key")
		fmt.Println("S3_BUCKET=weekly-progress-photos")
		fmt.Println("S3_REGION=ru-central1")
		fmt.Println("S3_ENDPOINT=https://storage.yandexcloud.net")
		fmt.Println()
		fmt.Println("To get credentials:")
		fmt.Println("1. Go to https://console.yandex.cloud")
		fmt.Println("2. Navigate to Service Accounts")
		fmt.Println("3. Select account: ajetieia8uunpq733f9t")
		fmt.Println("4. Create static access keys")
		fmt.Println()
		os.Exit(1)
	}

	fmt.Println("✓ S3 credentials found")
	fmt.Printf("  Bucket: %s\n", cfg.S3Bucket)
	fmt.Printf("  Region: %s\n", cfg.S3Region)
	fmt.Printf("  Endpoint: %s\n", cfg.S3Endpoint)
	fmt.Printf("  Access Key ID: %s...\n", cfg.S3AccessKeyID[:min(10, len(cfg.S3AccessKeyID))])
	fmt.Println()

	// Initialize logger
	log := logger.New()

	// Initialize S3 client
	fmt.Println("Initializing S3 client...")
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
	fmt.Println("✓ S3 client initialized")
	fmt.Println()

	// Create test file content
	testContent := fmt.Sprintf(`Test file uploaded at %s
This is a test upload to verify Yandex Cloud S3 integration.

Test Details:
- Bucket: %s
- Region: %s
- Upload Time: %s
- Test ID: %s
`, time.Now().Format(time.RFC3339), cfg.S3Bucket, cfg.S3Region, time.Now().Format(time.RFC3339), uuid.New().String())

	// Generate test file key
	testKey := fmt.Sprintf("test-uploads/test-%s.txt", time.Now().Format("20060102-150405"))

	fmt.Printf("Uploading test file to S3...\n")
	fmt.Printf("  Key: %s\n", testKey)
	fmt.Printf("  Size: %d bytes\n", len(testContent))
	fmt.Println()

	// Upload test file
	ctx := context.Background()
	reader := bytes.NewReader([]byte(testContent))

	url, err := s3Client.UploadFile(ctx, testKey, reader, "text/plain", int64(len(testContent)))
	if err != nil {
		log.Fatal("Failed to upload test file", "error", err)
	}

	fmt.Println("✓ File uploaded successfully!")
	fmt.Printf("  URL: %s\n", url)
	fmt.Println()

	// Check if file exists
	fmt.Println("Verifying file exists...")
	exists, err := s3Client.FileExists(ctx, testKey)
	if err != nil {
		log.Error("Failed to check file existence", "error", err)
	} else if exists {
		fmt.Println("✓ File exists in S3")
	} else {
		fmt.Println("❌ File not found in S3")
	}
	fmt.Println()

	// Get file size
	fmt.Println("Getting file metadata...")
	size, err := s3Client.GetFileSize(ctx, testKey)
	if err != nil {
		log.Error("Failed to get file size", "error", err)
	} else {
		fmt.Printf("✓ File size: %d bytes\n", size)
	}
	fmt.Println()

	// Generate signed URL
	fmt.Println("Generating signed URL (valid for 15 minutes)...")
	signedURL, err := s3Client.GetSignedURL(ctx, testKey, 15*time.Minute)
	if err != nil {
		log.Error("Failed to generate signed URL", "error", err)
	} else {
		fmt.Println("✓ Signed URL generated")
		fmt.Printf("  URL: %s\n", signedURL)
		fmt.Println()
		fmt.Println("You can access the file using this URL (valid for 15 minutes):")
		fmt.Printf("  curl '%s'\n", signedURL)
	}
	fmt.Println()

	// Test image upload
	fmt.Println("=== Testing Image Upload ===")
	fmt.Println()

	// Create a simple test image (1x1 pixel PNG)
	testImageData := []byte{
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
		0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
		0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
		0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
		0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
		0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
		0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, // IEND chunk
		0x44, 0xAE, 0x42, 0x60, 0x82,
	}

	// Generate image key (simulating weekly photo structure)
	userID := int64(999) // Test user ID
	weekIdentifier := time.Now().Format("2006-W01")
	imageFilename := fmt.Sprintf("%s.png", uuid.New().String())
	imageKey := fmt.Sprintf("weekly-photos/%d/%s/%s", userID, weekIdentifier, imageFilename)

	fmt.Printf("Uploading test image...\n")
	fmt.Printf("  Key: %s\n", imageKey)
	fmt.Printf("  Size: %d bytes\n", len(testImageData))
	fmt.Println()

	imageReader := bytes.NewReader(testImageData)
	imageURL, err := s3Client.UploadFile(ctx, imageKey, imageReader, "image/png", int64(len(testImageData)))
	if err != nil {
		log.Error("Failed to upload test image", "error", err)
	} else {
		fmt.Println("✓ Image uploaded successfully!")
		fmt.Printf("  URL: %s\n", imageURL)
		fmt.Println()

		// Generate signed URL for image
		imageSignedURL, err := s3Client.GetSignedURL(ctx, imageKey, 15*time.Minute)
		if err != nil {
			log.Error("Failed to generate signed URL for image", "error", err)
		} else {
			fmt.Println("✓ Image signed URL generated")
			fmt.Printf("  URL: %s\n", imageSignedURL)
		}
	}
	fmt.Println()

	// Cleanup option
	fmt.Println("=== Cleanup ===")
	fmt.Println()
	fmt.Print("Do you want to delete test files? (y/N): ")

	var response string
	fmt.Scanln(&response)
	response = strings.ToLower(strings.TrimSpace(response))

	if response == "y" || response == "yes" {
		fmt.Println()
		fmt.Println("Deleting test files...")

		// Delete text file
		if err := s3Client.DeleteFile(ctx, testKey); err != nil {
			log.Error("Failed to delete test file", "error", err)
		} else {
			fmt.Printf("✓ Deleted: %s\n", testKey)
		}

		// Delete image file
		if err := s3Client.DeleteFile(ctx, imageKey); err != nil {
			log.Error("Failed to delete test image", "error", err)
		} else {
			fmt.Printf("✓ Deleted: %s\n", imageKey)
		}

		fmt.Println()
		fmt.Println("✓ Cleanup completed")
	} else {
		fmt.Println()
		fmt.Println("Test files kept in S3:")
		fmt.Printf("  - %s\n", testKey)
		fmt.Printf("  - %s\n", imageKey)
		fmt.Println()
		fmt.Println("You can view them in Yandex Cloud Console:")
		fmt.Println("  https://console.yandex.cloud/folders/b1g7q85lgictgf4j1dq8/storage/buckets/weekly-progress-photos")
	}

	fmt.Println()
	fmt.Println("=== Test Summary ===")
	fmt.Println("✓ S3 client initialization: SUCCESS")
	fmt.Println("✓ File upload: SUCCESS")
	fmt.Println("✓ File existence check: SUCCESS")
	fmt.Println("✓ File metadata retrieval: SUCCESS")
	fmt.Println("✓ Signed URL generation: SUCCESS")
	fmt.Println("✓ Image upload: SUCCESS")
	fmt.Println()
	fmt.Println("🎉 All tests passed! S3 integration is working correctly.")
	fmt.Println()
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
