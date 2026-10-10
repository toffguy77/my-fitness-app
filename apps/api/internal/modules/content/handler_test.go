package content

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/burcev/api/internal/shared/apperrors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockContentService implements ServiceInterface for testing
type mockContentService struct {
	createArticleFunc      func(ctx context.Context, authorID int64, req CreateArticleRequest) (*Article, error)
	getArticleFunc         func(ctx context.Context, authorID int64, articleID string) (*Article, error)
	listArticlesFunc       func(ctx context.Context, authorID int64, status string, category string) (*ArticlesListResponse, error)
	updateArticleFunc      func(ctx context.Context, authorID int64, articleID string, req UpdateArticleRequest) (*Article, error)
	deleteArticleFunc      func(ctx context.Context, authorID int64, articleID string) error
	publishArticleFunc     func(ctx context.Context, authorID int64, articleID string) error
	scheduleArticleFunc    func(ctx context.Context, authorID int64, articleID string, req ScheduleArticleRequest) error
	unpublishArticleFunc   func(ctx context.Context, authorID int64, articleID string) error
	uploadMediaFunc        func(ctx context.Context, authorID int64, articleID string, file *multipart.FileHeader) (string, error)
	uploadMarkdownFileFunc func(ctx context.Context, authorID int64, file *multipart.FileHeader, req CreateArticleRequest) (*Article, error)
	getFeedFunc            func(ctx context.Context, clientID int64, category string, limit int, offset int) (*FeedResponse, error)
	getFeedArticleFunc     func(ctx context.Context, clientID int64, articleID string) (*Article, error)
	getPublicFeedFunc      func(ctx context.Context, category string, limit int, offset int) (*FeedResponse, error)
	getPublicArticleFunc   func(ctx context.Context, articleID string) (*Article, error)
	publishScheduledFunc   func(ctx context.Context) error
}

func (m *mockContentService) CreateArticle(ctx context.Context, authorID int64, req CreateArticleRequest) (*Article, error) {
	if m.createArticleFunc != nil {
		return m.createArticleFunc(ctx, authorID, req)
	}
	return &Article{}, nil
}

func (m *mockContentService) GetArticle(ctx context.Context, authorID int64, articleID string) (*Article, error) {
	if m.getArticleFunc != nil {
		return m.getArticleFunc(ctx, authorID, articleID)
	}
	return &Article{}, nil
}

func (m *mockContentService) ListArticles(ctx context.Context, authorID int64, status string, category string) (*ArticlesListResponse, error) {
	if m.listArticlesFunc != nil {
		return m.listArticlesFunc(ctx, authorID, status, category)
	}
	return &ArticlesListResponse{Articles: []Article{}}, nil
}

func (m *mockContentService) UpdateArticle(ctx context.Context, authorID int64, articleID string, req UpdateArticleRequest) (*Article, error) {
	if m.updateArticleFunc != nil {
		return m.updateArticleFunc(ctx, authorID, articleID, req)
	}
	return &Article{}, nil
}

func (m *mockContentService) DeleteArticle(ctx context.Context, authorID int64, articleID string) error {
	if m.deleteArticleFunc != nil {
		return m.deleteArticleFunc(ctx, authorID, articleID)
	}
	return nil
}

func (m *mockContentService) PublishArticle(ctx context.Context, authorID int64, articleID string) error {
	if m.publishArticleFunc != nil {
		return m.publishArticleFunc(ctx, authorID, articleID)
	}
	return nil
}

func (m *mockContentService) ScheduleArticle(ctx context.Context, authorID int64, articleID string, req ScheduleArticleRequest) error {
	if m.scheduleArticleFunc != nil {
		return m.scheduleArticleFunc(ctx, authorID, articleID, req)
	}
	return nil
}

func (m *mockContentService) UnpublishArticle(ctx context.Context, authorID int64, articleID string) error {
	if m.unpublishArticleFunc != nil {
		return m.unpublishArticleFunc(ctx, authorID, articleID)
	}
	return nil
}

func (m *mockContentService) UploadMedia(ctx context.Context, authorID int64, articleID string, file *multipart.FileHeader) (string, error) {
	if m.uploadMediaFunc != nil {
		return m.uploadMediaFunc(ctx, authorID, articleID, file)
	}
	return "https://example.com/media.jpg", nil
}

func (m *mockContentService) UploadCoverImage(ctx context.Context, file *multipart.FileHeader) (string, error) {
	return "https://storage.yandexcloud.net/curator-content/cover-images/test.jpg", nil
}

func (m *mockContentService) GetFeed(ctx context.Context, clientID int64, category string, limit int, offset int) (*FeedResponse, error) {
	if m.getFeedFunc != nil {
		return m.getFeedFunc(ctx, clientID, category, limit, offset)
	}
	return &FeedResponse{Articles: []ArticleCard{}}, nil
}

func (m *mockContentService) GetFeedArticle(ctx context.Context, clientID int64, articleID string) (*Article, error) {
	if m.getFeedArticleFunc != nil {
		return m.getFeedArticleFunc(ctx, clientID, articleID)
	}
	return &Article{}, nil
}

func (m *mockContentService) GetPublicFeed(ctx context.Context, category string, limit int, offset int) (*FeedResponse, error) {
	if m.getPublicFeedFunc != nil {
		return m.getPublicFeedFunc(ctx, category, limit, offset)
	}
	return &FeedResponse{Articles: []ArticleCard{}}, nil
}

func (m *mockContentService) GetPublicArticle(ctx context.Context, articleID string) (*Article, error) {
	if m.getPublicArticleFunc != nil {
		return m.getPublicArticleFunc(ctx, articleID)
	}
	return &Article{}, nil
}

func (m *mockContentService) PublishScheduledArticles(ctx context.Context) error {
	if m.publishScheduledFunc != nil {
		return m.publishScheduledFunc(ctx)
	}
	return nil
}

func setupContentTestHandler() (*Handler, *mockContentService) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{}
	log := logger.New()
	mock := &mockContentService{}
	handler := &Handler{
		cfg:     cfg,
		log:     log,
		service: mock,
	}
	return handler, mock
}

func TestHandler_CreateArticle(t *testing.T) {
	t.Run("success creates article", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.createArticleFunc = func(ctx context.Context, authorID int64, req CreateArticleRequest) (*Article, error) {
			return &Article{ID: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1", AuthorID: authorID, Title: req.Title, Category: req.Category}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(CreateArticleRequest{
			Title:         "Test Article",
			Category:      "nutrition",
			AudienceScope: "all",
		})
		c.Request = httptest.NewRequest(http.MethodPost, "/content/articles", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))

		handler.CreateArticle(c)

		assert.Equal(t, http.StatusCreated, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
	})

	t.Run("invalid body returns 400", func(t *testing.T) {
		handler, _ := setupContentTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/content/articles", bytes.NewBufferString("invalid"))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))

		handler.CreateArticle(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupContentTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/content/articles", nil)

		handler.CreateArticle(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("service error returns 500", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.createArticleFunc = func(ctx context.Context, authorID int64, req CreateArticleRequest) (*Article, error) {
			return nil, errors.New("db error")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(CreateArticleRequest{
			Title:         "Test",
			Category:      "nutrition",
			AudienceScope: "all",
		})
		c.Request = httptest.NewRequest(http.MethodPost, "/content/articles", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))

		handler.CreateArticle(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})
}

func TestHandler_GetArticle(t *testing.T) {
	t.Run("success returns article", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.getArticleFunc = func(ctx context.Context, authorID int64, articleID string) (*Article, error) {
			return &Article{ID: articleID, Title: "Test"}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/content/articles/a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}}

		handler.GetArticle(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("not found returns 404", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.getArticleFunc = func(ctx context.Context, authorID int64, articleID string) (*Article, error) {
			return nil, fmt.Errorf("article not found: %w", apperrors.ErrNotFound)
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/content/articles/a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}}

		handler.GetArticle(c)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.getArticleFunc = func(ctx context.Context, authorID int64, articleID string) (*Article, error) {
			return nil, fmt.Errorf("не принадлежит этому автору: %w", apperrors.ErrForbidden)
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/content/articles/a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}}

		handler.GetArticle(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("missing id returns 400", func(t *testing.T) {
		handler, _ := setupContentTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/content/articles/", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: ""}}

		handler.GetArticle(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("invalid uuid format returns 400 not 500", func(t *testing.T) {
		handler, _ := setupContentTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/content/articles/not-a-uuid", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "not-a-uuid"}}

		handler.GetArticle(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestHandler_ListArticles(t *testing.T) {
	t.Run("success returns articles", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.listArticlesFunc = func(ctx context.Context, authorID int64, status string, category string) (*ArticlesListResponse, error) {
			return &ArticlesListResponse{
				Articles: []Article{{ID: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1", Title: "Test"}},
				Total:    1,
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/content/articles?status=draft&category=nutrition", nil)
		c.Set("user_id", int64(1))

		handler.ListArticles(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("service error returns 500", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.listArticlesFunc = func(ctx context.Context, authorID int64, status string, category string) (*ArticlesListResponse, error) {
			return nil, errors.New("db error")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/content/articles", nil)
		c.Set("user_id", int64(1))

		handler.ListArticles(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupContentTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/content/articles", nil)

		handler.ListArticles(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

func TestHandler_DeleteArticle(t *testing.T) {
	t.Run("success deletes article", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.deleteArticleFunc = func(ctx context.Context, authorID int64, articleID string) error {
			return nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodDelete, "/content/articles/a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}}

		handler.DeleteArticle(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("not found returns 404", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.deleteArticleFunc = func(ctx context.Context, authorID int64, articleID string) error {
			return fmt.Errorf("article not found: %w", apperrors.ErrNotFound)
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodDelete, "/content/articles/a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}}

		handler.DeleteArticle(c)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.deleteArticleFunc = func(ctx context.Context, authorID int64, articleID string) error {
			return fmt.Errorf("не принадлежит: %w", apperrors.ErrForbidden)
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodDelete, "/content/articles/a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}}

		handler.DeleteArticle(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("missing id returns 400", func(t *testing.T) {
		handler, _ := setupContentTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodDelete, "/content/articles/", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: ""}}

		handler.DeleteArticle(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestHandler_PublishArticle(t *testing.T) {
	t.Run("success publishes article", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.publishArticleFunc = func(ctx context.Context, authorID int64, articleID string) error {
			return nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/content/articles/a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1/publish", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}}

		handler.PublishArticle(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("not found returns 404", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.publishArticleFunc = func(ctx context.Context, authorID int64, articleID string) error {
			return fmt.Errorf("article not found: %w", apperrors.ErrNotFound)
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/content/articles/a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1/publish", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}}

		handler.PublishArticle(c)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.publishArticleFunc = func(ctx context.Context, authorID int64, articleID string) error {
			return fmt.Errorf("не принадлежит: %w", apperrors.ErrForbidden)
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/content/articles/a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1/publish", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}}

		handler.PublishArticle(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("missing id returns 400", func(t *testing.T) {
		handler, _ := setupContentTestHandler()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/content/articles//publish", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: ""}}

		handler.PublishArticle(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestHandler_GetPublicArticle(t *testing.T) {
	t.Run("success returns article", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.getPublicArticleFunc = func(ctx context.Context, articleID string) (*Article, error) {
			return &Article{ID: articleID, Title: "Public Article"}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/public/content/a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1", nil)
		c.Params = gin.Params{{Key: "id", Value: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}}

		handler.GetPublicArticle(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("not found returns 404", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.getPublicArticleFunc = func(ctx context.Context, articleID string) (*Article, error) {
			return nil, fmt.Errorf("article not found: %w", apperrors.ErrNotFound)
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/public/content/a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1", nil)
		c.Params = gin.Params{{Key: "id", Value: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}}

		handler.GetPublicArticle(c)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("neither an id nor a slug returns 400 not 500", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		called := false
		mock.getPublicArticleFunc = func(ctx context.Context, articleID string) (*Article, error) {
			called = true
			return &Article{}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/public/content/x", nil)
		c.Params = gin.Params{{Key: "id", Value: "Not_A Slug"}}

		handler.GetPublicArticle(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		assert.False(t, called)
	})

	t.Run("a slug is looked up as such", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		var asked string
		mock.getPublicArticleFunc = func(ctx context.Context, articleID string) (*Article, error) {
			asked = articleID
			return &Article{ID: "a1", Slug: articleID}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/public/content/raschet-kbzhu", nil)
		c.Params = gin.Params{{Key: "id", Value: "raschet-kbzhu"}}

		handler.GetPublicArticle(c)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "raschet-kbzhu", asked)
		assert.Contains(t, w.Body.String(), `"slug":"raschet-kbzhu"`)
	})
}

func TestHandler_UpdateArticle_SlugOutcomes(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"malformed slug is 400", fmt.Errorf("slug: %w", apperrors.ErrValidation), http.StatusBadRequest},
		{"published or taken slug is 409", fmt.Errorf("slug: %w", apperrors.ErrConflict), http.StatusConflict},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			handler, mock := setupContentTestHandler()
			mock.updateArticleFunc = func(ctx context.Context, authorID int64, articleID string, req UpdateArticleRequest) (*Article, error) {
				return nil, tc.err
			}

			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest(http.MethodPut, "/content/articles/a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1",
				strings.NewReader(`{"slug":"novyy-adres"}`))
			c.Request.Header.Set("Content-Type", "application/json")
			c.Set("user_id", int64(1))
			c.Params = gin.Params{{Key: "id", Value: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}}

			handler.UpdateArticle(c)

			assert.Equal(t, tc.want, w.Code)
		})
	}
}

func TestHandler_CreateArticle_SlugOutcomes(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"malformed slug is 400", fmt.Errorf("slug: %w", apperrors.ErrValidation), http.StatusBadRequest},
		{"taken slug is 409", fmt.Errorf("slug: %w", apperrors.ErrConflict), http.StatusConflict},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			handler, mock := setupContentTestHandler()
			mock.createArticleFunc = func(ctx context.Context, authorID int64, req CreateArticleRequest) (*Article, error) {
				return nil, tc.err
			}

			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest(http.MethodPost, "/content/articles",
				strings.NewReader(`{"title":"T","category":"nutrition","audience_scope":"all","slug":"raschet"}`))
			c.Request.Header.Set("Content-Type", "application/json")
			c.Set("user_id", int64(1))

			handler.CreateArticle(c)

			assert.Equal(t, tc.want, w.Code)
		})
	}
}

// The public feed answers anybody, without an account. An unbounded limit let
// one request ask the database and the image proxy for everything at once.
func TestHandler_GetPublicFeed_CapsLimit(t *testing.T) {
	cases := map[string]int{
		"100000": 100,
		"101":    100,
		"100":    100,
		"20":     20,
		"":       20,
		"-5":     20,
		"abc":    20,
	}
	for raw, want := range cases {
		t.Run("limit="+raw, func(t *testing.T) {
			handler, mock := setupContentTestHandler()
			got := -1
			mock.getPublicFeedFunc = func(ctx context.Context, category string, limit int, offset int) (*FeedResponse, error) {
				got = limit
				return &FeedResponse{Articles: []ArticleCard{}}, nil
			}

			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest(http.MethodGet, "/public/content?limit="+raw, nil)

			handler.GetPublicFeed(c)

			assert.Equal(t, http.StatusOK, w.Code)
			assert.Equal(t, want, got)
		})
	}
}
