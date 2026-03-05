package storage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// MockS3Client mocks the S3 client
type MockS3Client struct {
	mock.Mock
}

func (m *MockS3Client) PutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	args := m.Called(ctx, params)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*s3.PutObjectOutput), args.Error(1)
}

func (m *MockS3Client) DeleteObject(ctx context.Context, params *s3.DeleteObjectInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
	args := m.Called(ctx, params)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*s3.DeleteObjectOutput), args.Error(1)
}

func (m *MockS3Client) HeadObject(ctx context.Context, params *s3.HeadObjectInput, optFns ...func(*s3.Options)) (*s3.HeadObjectOutput, error) {
	args := m.Called(ctx, params)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*s3.HeadObjectOutput), args.Error(1)
}

func (m *MockS3Client) GetObject(ctx context.Context, params *s3.GetObjectInput, optFns ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	args := m.Called(ctx, params)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*s3.GetObjectOutput), args.Error(1)
}

func createTestLogger() *logger.Logger {
	return logger.New()
}

func createTestS3ClientWithMock(mockClient S3API) *S3Client {
	log := createTestLogger()
	return &S3Client{
		client:   mockClient,
		bucket:   "test-bucket",
		region:   "ru-central1",
		endpoint: "https://storage.yandexcloud.net",
		log:      log,
	}
}

func TestNewS3Client(t *testing.T) {
	tests := []struct {
		name    string
		config  *S3Config
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid configuration",
			config: &S3Config{
				AccessKeyID:     "test-key",
				SecretAccessKey: "test-secret",
				Bucket:          "test-bucket",
				Region:          "ru-central1",
				Endpoint:        "https://storage.yandexcloud.net",
			},
			wantErr: false,
		},
		{
			name: "valid configuration with defaults",
			config: &S3Config{
				AccessKeyID:     "test-key",
				SecretAccessKey: "test-secret",
				Bucket:          "test-bucket",
			},
			wantErr: false,
		},
		{
			name: "missing access key",
			config: &S3Config{
				SecretAccessKey: "test-secret",
				Bucket:          "test-bucket",
			},
			wantErr: true,
			errMsg:  "S3 credentials are required",
		},
		{
			name: "missing secret key",
			config: &S3Config{
				AccessKeyID: "test-key",
				Bucket:      "test-bucket",
			},
			wantErr: true,
			errMsg:  "S3 credentials are required",
		},
		{
			name: "missing bucket",
			config: &S3Config{
				AccessKeyID:     "test-key",
				SecretAccessKey: "test-secret",
			},
			wantErr: true,
			errMsg:  "S3 bucket name is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			log := createTestLogger()
			client, err := NewS3Client(tt.config, log)

			if tt.wantErr {
				assert.Error(t, err)
				assert.Nil(t, client)
				if tt.errMsg != "" {
					assert.Contains(t, err.Error(), tt.errMsg)
				}
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, client)
				assert.Equal(t, tt.config.Bucket, client.bucket)

				if tt.config.Region == "" {
					assert.Equal(t, "ru-central1", client.region)
				}
				if tt.config.Endpoint == "" {
					assert.Equal(t, "https://storage.yandexcloud.net", client.endpoint)
				}
			}
		})
	}
}

func TestURLGeneration(t *testing.T) {
	tests := []struct {
		name     string
		endpoint string
		bucket   string
		key      string
		wantURL  string
	}{
		{
			name:     "standard URL",
			endpoint: "https://storage.yandexcloud.net",
			bucket:   "test-bucket",
			key:      "test/file.jpg",
			wantURL:  "https://storage.yandexcloud.net/test-bucket/test/file.jpg",
		},
		{
			name:     "URL with special characters",
			endpoint: "https://storage.yandexcloud.net",
			bucket:   "my-bucket",
			key:      "photos/2024/image-001.jpg",
			wantURL:  "https://storage.yandexcloud.net/my-bucket/photos/2024/image-001.jpg",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url := fmt.Sprintf("%s/%s/%s", tt.endpoint, tt.bucket, tt.key)
			assert.Equal(t, tt.wantURL, url)
		})
	}
}

func TestBufferHandling(t *testing.T) {
	tests := []struct {
		name     string
		data     []byte
		fileSize int64
	}{
		{
			name:     "small file",
			data:     []byte("small content"),
			fileSize: 13,
		},
		{
			name:     "empty file",
			data:     []byte{},
			fileSize: 0,
		},
		{
			name:     "large file",
			data:     bytes.Repeat([]byte("x"), 1024*1024),
			fileSize: 1024 * 1024,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reader := bytes.NewReader(tt.data)
			buf := new(bytes.Buffer)
			n, err := io.Copy(buf, reader)

			assert.NoError(t, err)
			assert.Equal(t, tt.fileSize, n)
			// For empty files, buf.Bytes() returns nil, not empty slice
			if tt.fileSize == 0 {
				assert.Empty(t, buf.Bytes())
			} else {
				assert.Equal(t, tt.data, buf.Bytes())
			}
		})
	}
}

func TestReadError(t *testing.T) {
	errorReader := &errorReader{err: errors.New("read error")}
	buf := new(bytes.Buffer)
	_, err := io.Copy(buf, errorReader)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "read error")
}

type errorReader struct {
	err error
}

func (e *errorReader) Read(p []byte) (n int, err error) {
	return 0, e.err
}

func TestContextHandling(t *testing.T) {
	ctx := context.Background()
	assert.NotNil(t, ctx)

	ctx2, cancel := context.WithCancel(context.Background())
	cancel()

	select {
	case <-ctx2.Done():
		assert.Error(t, ctx2.Err())
	default:
		t.Error("context should be cancelled")
	}
}

func TestS3ClientFields(t *testing.T) {
	log := createTestLogger()

	config := &S3Config{
		AccessKeyID:     "test-key",
		SecretAccessKey: "test-secret",
		Bucket:          "test-bucket",
		Region:          "eu-west-1",
		Endpoint:        "https://test.endpoint.com",
	}

	client, err := NewS3Client(config, log)
	require.NoError(t, err)
	require.NotNil(t, client)

	assert.NotNil(t, client.client)
	assert.Equal(t, "test-bucket", client.bucket)
	assert.Equal(t, "eu-west-1", client.region)
	assert.Equal(t, "https://test.endpoint.com", client.endpoint)
	assert.NotNil(t, client.log)
}

func TestUploadFile(t *testing.T) {
	tests := []struct {
		name        string
		key         string
		data        []byte
		contentType string
		mockSetup   func(*MockS3Client)
		wantErr     bool
		wantURL     string
	}{
		{
			name:        "successful upload",
			key:         "test/file.jpg",
			data:        []byte("test content"),
			contentType: "image/jpeg",
			mockSetup: func(m *MockS3Client) {
				m.On("PutObject", mock.Anything, mock.MatchedBy(func(input *s3.PutObjectInput) bool {
					return *input.Bucket == "test-bucket" &&
						*input.Key == "test/file.jpg" &&
						*input.ContentType == "image/jpeg" &&
						*input.ContentLength == 12
				})).Return(&s3.PutObjectOutput{}, nil)
			},
			wantErr: false,
			wantURL: "https://storage.yandexcloud.net/test-bucket/test/file.jpg",
		},
		{
			name:        "upload failure",
			key:         "test/file.jpg",
			data:        []byte("test content"),
			contentType: "image/jpeg",
			mockSetup: func(m *MockS3Client) {
				m.On("PutObject", mock.Anything, mock.Anything).Return(nil, errors.New("upload failed"))
			},
			wantErr: true,
		},
		{
			name:        "empty file",
			key:         "test/empty.txt",
			data:        []byte{},
			contentType: "text/plain",
			mockSetup: func(m *MockS3Client) {
				m.On("PutObject", mock.Anything, mock.MatchedBy(func(input *s3.PutObjectInput) bool {
					return *input.ContentLength == 0
				})).Return(&s3.PutObjectOutput{}, nil)
			},
			wantErr: false,
			wantURL: "https://storage.yandexcloud.net/test-bucket/test/empty.txt",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockClient := new(MockS3Client)
			tt.mockSetup(mockClient)

			client := createTestS3ClientWithMock(mockClient)

			ctx := context.Background()
			reader := bytes.NewReader(tt.data)
			url, err := client.UploadFile(ctx, tt.key, reader, tt.contentType, int64(len(tt.data)))

			if tt.wantErr {
				assert.Error(t, err)
				assert.Empty(t, url)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.wantURL, url)
			}

			mockClient.AssertExpectations(t)
		})
	}
}

func TestDeleteFile(t *testing.T) {
	tests := []struct {
		name      string
		key       string
		mockSetup func(*MockS3Client)
		wantErr   bool
	}{
		{
			name: "successful deletion",
			key:  "test/file.jpg",
			mockSetup: func(m *MockS3Client) {
				m.On("DeleteObject", mock.Anything, mock.MatchedBy(func(input *s3.DeleteObjectInput) bool {
					return *input.Bucket == "test-bucket" && *input.Key == "test/file.jpg"
				})).Return(&s3.DeleteObjectOutput{}, nil)
			},
			wantErr: false,
		},
		{
			name: "deletion failure",
			key:  "test/file.jpg",
			mockSetup: func(m *MockS3Client) {
				m.On("DeleteObject", mock.Anything, mock.Anything).Return(nil, errors.New("delete failed"))
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockClient := new(MockS3Client)
			tt.mockSetup(mockClient)

			client := createTestS3ClientWithMock(mockClient)

			ctx := context.Background()
			err := client.DeleteFile(ctx, tt.key)

			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}

			mockClient.AssertExpectations(t)
		})
	}
}

func TestFileExists(t *testing.T) {
	tests := []struct {
		name       string
		key        string
		mockSetup  func(*MockS3Client)
		wantExists bool
		wantErr    bool
	}{
		{
			name: "file exists",
			key:  "test/file.jpg",
			mockSetup: func(m *MockS3Client) {
				m.On("HeadObject", mock.Anything, mock.MatchedBy(func(input *s3.HeadObjectInput) bool {
					return *input.Bucket == "test-bucket" && *input.Key == "test/file.jpg"
				})).Return(&s3.HeadObjectOutput{}, nil)
			},
			wantExists: true,
			wantErr:    false,
		},
		{
			name: "file does not exist",
			key:  "test/missing.jpg",
			mockSetup: func(m *MockS3Client) {
				m.On("HeadObject", mock.Anything, mock.Anything).Return(nil, errors.New("not found"))
			},
			wantExists: false,
			wantErr:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockClient := new(MockS3Client)
			tt.mockSetup(mockClient)

			client := createTestS3ClientWithMock(mockClient)

			ctx := context.Background()
			exists, err := client.FileExists(ctx, tt.key)

			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.wantExists, exists)
			}

			mockClient.AssertExpectations(t)
		})
	}
}

func TestGetFileSize(t *testing.T) {
	tests := []struct {
		name      string
		key       string
		mockSetup func(*MockS3Client)
		wantSize  int64
		wantErr   bool
	}{
		{
			name: "successful size retrieval",
			key:  "test/file.jpg",
			mockSetup: func(m *MockS3Client) {
				size := int64(1024)
				m.On("HeadObject", mock.Anything, mock.MatchedBy(func(input *s3.HeadObjectInput) bool {
					return *input.Bucket == "test-bucket" && *input.Key == "test/file.jpg"
				})).Return(&s3.HeadObjectOutput{
					ContentLength: &size,
				}, nil)
			},
			wantSize: 1024,
			wantErr:  false,
		},
		{
			name: "file not found",
			key:  "test/missing.jpg",
			mockSetup: func(m *MockS3Client) {
				m.On("HeadObject", mock.Anything, mock.Anything).Return(nil, errors.New("not found"))
			},
			wantSize: 0,
			wantErr:  true,
		},
		{
			name: "nil content length",
			key:  "test/file.jpg",
			mockSetup: func(m *MockS3Client) {
				m.On("HeadObject", mock.Anything, mock.Anything).Return(&s3.HeadObjectOutput{
					ContentLength: nil,
				}, nil)
			},
			wantSize: 0,
			wantErr:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockClient := new(MockS3Client)
			tt.mockSetup(mockClient)

			client := createTestS3ClientWithMock(mockClient)

			ctx := context.Background()
			size, err := client.GetFileSize(ctx, tt.key)

			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.wantSize, size)
			}

			mockClient.AssertExpectations(t)
		})
	}
}

func TestGetSignedURL(t *testing.T) {
	// GetSignedURL uses PresignClient which requires a real *s3.Client
	// We test that it works with a real client (though it will fail to connect)
	log := createTestLogger()
	config := &S3Config{
		AccessKeyID:     "test-key",
		SecretAccessKey: "test-secret",
		Bucket:          "test-bucket",
	}

	client, err := NewS3Client(config, log)
	require.NoError(t, err)

	ctx := context.Background()
	url, err := client.GetSignedURL(ctx, "test/file.jpg", 15*time.Minute)

	// With valid credentials, it should generate a URL (even if the file doesn't exist)
	assert.NoError(t, err)
	assert.NotEmpty(t, url)
	assert.Contains(t, url, "test/file.jpg")
	assert.Contains(t, url, "X-Amz-Signature")
}

func createTestS3ClientWithMockAndPrefix(mockClient S3API, prefix string) *S3Client {
	log := createTestLogger()
	return &S3Client{
		client:     mockClient,
		bucket:     "test-bucket",
		region:     "ru-central1",
		endpoint:   "https://storage.yandexcloud.net",
		pathPrefix: prefix,
		log:        log,
	}
}

func TestS3Client_PathPrefix(t *testing.T) {
	t.Run("UploadFile with prefix prepends prefix to key and URL", func(t *testing.T) {
		mockClient := new(MockS3Client)
		mockClient.On("PutObject", mock.Anything, mock.MatchedBy(func(input *s3.PutObjectInput) bool {
			return *input.Key == "dev/avatars/1/avatar.jpg"
		})).Return(&s3.PutObjectOutput{}, nil)

		client := createTestS3ClientWithMockAndPrefix(mockClient, "dev/")

		url, err := client.UploadFile(context.Background(), "avatars/1/avatar.jpg", bytes.NewReader([]byte("img")), "image/jpeg", 3)
		assert.NoError(t, err)
		assert.Equal(t, "https://storage.yandexcloud.net/test-bucket/dev/avatars/1/avatar.jpg", url)
		mockClient.AssertExpectations(t)
	})

	t.Run("UploadFile with empty prefix sends key unchanged", func(t *testing.T) {
		mockClient := new(MockS3Client)
		mockClient.On("PutObject", mock.Anything, mock.MatchedBy(func(input *s3.PutObjectInput) bool {
			return *input.Key == "avatars/1/avatar.jpg"
		})).Return(&s3.PutObjectOutput{}, nil)

		client := createTestS3ClientWithMockAndPrefix(mockClient, "")

		url, err := client.UploadFile(context.Background(), "avatars/1/avatar.jpg", bytes.NewReader([]byte("img")), "image/jpeg", 3)
		assert.NoError(t, err)
		assert.Equal(t, "https://storage.yandexcloud.net/test-bucket/avatars/1/avatar.jpg", url)
		mockClient.AssertExpectations(t)
	})

	t.Run("GetFile with prefix prepends prefix to key", func(t *testing.T) {
		mockClient := new(MockS3Client)
		mockClient.On("GetObject", mock.Anything, mock.MatchedBy(func(input *s3.GetObjectInput) bool {
			return *input.Key == "dev/photos/pic.jpg"
		})).Return(&s3.GetObjectOutput{
			Body: io.NopCloser(bytes.NewReader([]byte("data"))),
		}, nil)

		client := createTestS3ClientWithMockAndPrefix(mockClient, "dev/")

		data, err := client.GetFile(context.Background(), "photos/pic.jpg")
		assert.NoError(t, err)
		assert.Equal(t, []byte("data"), data)
		mockClient.AssertExpectations(t)
	})

	t.Run("DeleteFile with prefix prepends prefix to key", func(t *testing.T) {
		mockClient := new(MockS3Client)
		mockClient.On("DeleteObject", mock.Anything, mock.MatchedBy(func(input *s3.DeleteObjectInput) bool {
			return *input.Key == "dev/photos/pic.jpg"
		})).Return(&s3.DeleteObjectOutput{}, nil)

		client := createTestS3ClientWithMockAndPrefix(mockClient, "dev/")

		err := client.DeleteFile(context.Background(), "photos/pic.jpg")
		assert.NoError(t, err)
		mockClient.AssertExpectations(t)
	})

	t.Run("FileExists with prefix prepends prefix to key", func(t *testing.T) {
		mockClient := new(MockS3Client)
		mockClient.On("HeadObject", mock.Anything, mock.MatchedBy(func(input *s3.HeadObjectInput) bool {
			return *input.Key == "dev/photos/pic.jpg"
		})).Return(&s3.HeadObjectOutput{}, nil)

		client := createTestS3ClientWithMockAndPrefix(mockClient, "dev/")

		exists, err := client.FileExists(context.Background(), "photos/pic.jpg")
		assert.NoError(t, err)
		assert.True(t, exists)
		mockClient.AssertExpectations(t)
	})

	t.Run("GetFileSize with prefix prepends prefix to key", func(t *testing.T) {
		mockClient := new(MockS3Client)
		size := int64(2048)
		mockClient.On("HeadObject", mock.Anything, mock.MatchedBy(func(input *s3.HeadObjectInput) bool {
			return *input.Key == "dev/photos/pic.jpg"
		})).Return(&s3.HeadObjectOutput{
			ContentLength: &size,
		}, nil)

		client := createTestS3ClientWithMockAndPrefix(mockClient, "dev/")

		got, err := client.GetFileSize(context.Background(), "photos/pic.jpg")
		assert.NoError(t, err)
		assert.Equal(t, int64(2048), got)
		mockClient.AssertExpectations(t)
	})
}

func TestGetSignedURLWithMock(t *testing.T) {
	// Test that GetSignedURL returns error when client doesn't support presigning
	mockClient := new(MockS3Client)
	client := createTestS3ClientWithMock(mockClient)

	ctx := context.Background()
	url, err := client.GetSignedURL(ctx, "test/file.jpg", 15*time.Minute)

	assert.Error(t, err)
	assert.Empty(t, url)
	assert.Contains(t, err.Error(), "does not support presigning")
}
