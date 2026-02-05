package storage

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/burcev/api/internal/shared/logger"
)

// S3API defines the interface for S3 operations
type S3API interface {
	PutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error)
	DeleteObject(ctx context.Context, params *s3.DeleteObjectInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectOutput, error)
	HeadObject(ctx context.Context, params *s3.HeadObjectInput, optFns ...func(*s3.Options)) (*s3.HeadObjectOutput, error)
}

// S3Client handles interactions with Yandex Object Storage (S3-compatible)
type S3Client struct {
	client     S3API
	bucket     string
	region     string
	endpoint   string
	log        *logger.Logger
}

// S3Config holds S3 configuration
type S3Config struct {
	AccessKeyID     string
	SecretAccessKey string
	Bucket          string
	Region          string
	Endpoint        string // Yandex Cloud endpoint: https://storage.yandexcloud.net
}

// NewS3Client creates a new S3 client for Yandex Object Storage
func NewS3Client(cfg *S3Config, log *logger.Logger) (*S3Client, error) {
	if cfg.AccessKeyID == "" || cfg.SecretAccessKey == "" {
		return nil, fmt.Errorf("S3 credentials are required")
	}
	if cfg.Bucket == "" {
		return nil, fmt.Errorf("S3 bucket name is required")
	}
	if cfg.Endpoint == "" {
		cfg.Endpoint = "https://storage.yandexcloud.net"
	}
	if cfg.Region == "" {
		cfg.Region = "ru-central1"
	}

	// Create AWS config with Yandex Cloud credentials
	awsConfig := aws.Config{
		Region: cfg.Region,
		Credentials: credentials.NewStaticCredentialsProvider(
			cfg.AccessKeyID,
			cfg.SecretAccessKey,
			"", // token not needed for static credentials
		),
	}

	// Create S3 client with custom endpoint
	client := s3.NewFromConfig(awsConfig, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.Endpoint)
		o.UsePathStyle = true // Required for Yandex Cloud
	})

	log.Info("S3 client initialized",
		"bucket", cfg.Bucket,
		"region", cfg.Region,
		"endpoint", cfg.Endpoint,
	)

	return &S3Client{
		client:   client,
		bucket:   cfg.Bucket,
		region:   cfg.Region,
		endpoint: cfg.Endpoint,
		log:      log,
	}, nil
}

// UploadFile uploads a file to S3
func (s *S3Client) UploadFile(ctx context.Context, key string, data io.Reader, contentType string, fileSize int64) (string, error) {
	startTime := time.Now()

	// Upload to S3
	input := &s3.PutObjectInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(key),
		Body:          data,
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(fileSize),
		ACL:           "private", // Private by default
	}

	_, err := s.client.PutObject(ctx, input)
	if err != nil {
		s.log.Error("Failed to upload file to S3",
			"error", err,
			"key", key,
			"bucket", s.bucket,
			"duration", time.Since(startTime),
		)
		return "", fmt.Errorf("failed to upload file to S3: %w", err)
	}

	// Generate URL
	url := fmt.Sprintf("%s/%s/%s", s.endpoint, s.bucket, key)

	s.log.Info("File uploaded to S3",
		"key", key,
		"bucket", s.bucket,
		"size", fileSize,
		"content_type", contentType,
		"duration", time.Since(startTime),
	)

	return url, nil
}

// DeleteFile deletes a file from S3
func (s *S3Client) DeleteFile(ctx context.Context, key string) error {
	startTime := time.Now()

	input := &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}

	_, err := s.client.DeleteObject(ctx, input)
	if err != nil {
		s.log.Error("Failed to delete file from S3",
			"error", err,
			"key", key,
			"bucket", s.bucket,
			"duration", time.Since(startTime),
		)
		return fmt.Errorf("failed to delete file from S3: %w", err)
	}

	s.log.Info("File deleted from S3",
		"key", key,
		"bucket", s.bucket,
		"duration", time.Since(startTime),
	)

	return nil
}

// GetSignedURL generates a pre-signed URL for temporary access to a file
func (s *S3Client) GetSignedURL(ctx context.Context, key string, expiration time.Duration) (string, error) {
	// Type assert to get the concrete *s3.Client for presigning
	// This is needed because PresignClient requires *s3.Client
	concreteClient, ok := s.client.(*s3.Client)
	if !ok {
		return "", fmt.Errorf("client does not support presigning")
	}

	presignClient := s3.NewPresignClient(concreteClient)

	request, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = expiration
	})

	if err != nil {
		s.log.Error("Failed to generate signed URL",
			"error", err,
			"key", key,
			"bucket", s.bucket,
		)
		return "", fmt.Errorf("failed to generate signed URL: %w", err)
	}

	s.log.Info("Generated signed URL",
		"key", key,
		"bucket", s.bucket,
		"expiration", expiration,
	)

	return request.URL, nil
}

// FileExists checks if a file exists in S3
func (s *S3Client) FileExists(ctx context.Context, key string) (bool, error) {
	input := &s3.HeadObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}

	_, err := s.client.HeadObject(ctx, input)
	if err != nil {
		// Check if error is "not found"
		return false, nil
	}

	return true, nil
}

// GetFileSize returns the size of a file in S3
func (s *S3Client) GetFileSize(ctx context.Context, key string) (int64, error) {
	input := &s3.HeadObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}

	result, err := s.client.HeadObject(ctx, input)
	if err != nil {
		return 0, fmt.Errorf("failed to get file metadata: %w", err)
	}

	if result.ContentLength == nil {
		return 0, fmt.Errorf("content length not available")
	}

	return *result.ContentLength, nil
}
