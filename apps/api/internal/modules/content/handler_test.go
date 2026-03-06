package content

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockContentService implements ServiceInterface for testing
type mockContentService struct {
	createArticleFunc          func(ctx context.Context, authorID int64, req CreateArticleRequest) (*Article, error)
	getArticleFunc             func(ctx context.Context, authorID int64, articleID string, isAdmin bool) (*Article, error)
	listArticlesFunc           func(ctx context.Context, authorID int64, status string, category string, isAdmin bool) (*ArticlesListResponse, error)
	updateArticleFunc          func(ctx context.Context, authorID int64, articleID string, req UpdateArticleRequest, isAdmin bool) (*Article, error)
	deleteArticleFunc          func(ctx context.Context, authorID int64, articleID string, isAdmin bool) error
	publishArticleFunc         func(ctx context.Context, authorID int64, articleID string, isAdmin bool) error
	scheduleArticleFunc        func(ctx context.Context, authorID int64, articleID string, req ScheduleArticleRequest, isAdmin bool) error
	unpublishArticleFunc       func(ctx context.Context, authorID int64, articleID string, isAdmin bool) error
	uploadMediaFunc            func(ctx context.Context, authorID int64, articleID string, file *multipart.FileHeader, isAdmin bool) (string, error)
	uploadMarkdownFileFunc     func(ctx context.Context, authorID int64, file *multipart.FileHeader, req CreateArticleRequest) (*Article, error)
	getFeedFunc                func(ctx context.Context, clientID int64, category string, limit int, offset int) (*FeedResponse, error)
	getFeedArticleFunc         func(ctx context.Context, clientID int64, articleID string) (*Article, error)
	getPublicFeedFunc          func(ctx context.Context, category string, limit int, offset int) (*FeedResponse, error)
	getPublicArticleFunc       func(ctx context.Context, articleID string) (*Article, error)
	publishScheduledFunc       func(ctx context.Context) error
}

func (m *mockContentService) CreateArticle(ctx context.Context, authorID int64, req CreateArticleRequest) (*Article, error) {
	if m.createArticleFunc != nil {
		return m.createArticleFunc(ctx, authorID, req)
	}
	return &Article{}, nil
}

func (m *mockContentService) GetArticle(ctx context.Context, authorID int64, articleID string, isAdmin bool) (*Article, error) {
	if m.getArticleFunc != nil {
		return m.getArticleFunc(ctx, authorID, articleID, isAdmin)
	}
	return &Article{}, nil
}

func (m *mockContentService) ListArticles(ctx context.Context, authorID int64, status string, category string, isAdmin bool) (*ArticlesListResponse, error) {
	if m.listArticlesFunc != nil {
		return m.listArticlesFunc(ctx, authorID, status, category, isAdmin)
	}
	return &ArticlesListResponse{Articles: []Article{}}, nil
}

func (m *mockContentService) UpdateArticle(ctx context.Context, authorID int64, articleID string, req UpdateArticleRequest, isAdmin bool) (*Article, error) {
	if m.updateArticleFunc != nil {
		return m.updateArticleFunc(ctx, authorID, articleID, req, isAdmin)
	}
	return &Article{}, nil
}

func (m *mockContentService) DeleteArticle(ctx context.Context, authorID int64, articleID string, isAdmin bool) error {
	if m.deleteArticleFunc != nil {
		return m.deleteArticleFunc(ctx, authorID, articleID, isAdmin)
	}
	return nil
}

func (m *mockContentService) PublishArticle(ctx context.Context, authorID int64, articleID string, isAdmin bool) error {
	if m.publishArticleFunc != nil {
		return m.publishArticleFunc(ctx, authorID, articleID, isAdmin)
	}
	return nil
}

func (m *mockContentService) ScheduleArticle(ctx context.Context, authorID int64, articleID string, req ScheduleArticleRequest, isAdmin bool) error {
	if m.scheduleArticleFunc != nil {
		return m.scheduleArticleFunc(ctx, authorID, articleID, req, isAdmin)
	}
	return nil
}

func (m *mockContentService) UnpublishArticle(ctx context.Context, authorID int64, articleID string, isAdmin bool) error {
	if m.unpublishArticleFunc != nil {
		return m.unpublishArticleFunc(ctx, authorID, articleID, isAdmin)
	}
	return nil
}

func (m *mockContentService) UploadMedia(ctx context.Context, authorID int64, articleID string, file *multipart.FileHeader, isAdmin bool) (string, error) {
	if m.uploadMediaFunc != nil {
		return m.uploadMediaFunc(ctx, authorID, articleID, file, isAdmin)
	}
	return "https://example.com/media.jpg", nil
}

func (m *mockContentService) UploadMarkdownFile(ctx context.Context, authorID int64, file *multipart.FileHeader, req CreateArticleRequest) (*Article, error) {
	if m.uploadMarkdownFileFunc != nil {
		return m.uploadMarkdownFileFunc(ctx, authorID, file, req)
	}
	return &Article{}, nil
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
			return &Article{ID: "art-1", AuthorID: authorID, Title: req.Title, Category: req.Category}, nil
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
		mock.getArticleFunc = func(ctx context.Context, authorID int64, articleID string, isAdmin bool) (*Article, error) {
			return &Article{ID: articleID, Title: "Test"}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/content/articles/art-1", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "art-1"}}

		handler.GetArticle(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("not found returns 404", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.getArticleFunc = func(ctx context.Context, authorID int64, articleID string, isAdmin bool) (*Article, error) {
			return nil, errors.New("not found")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/content/articles/art-1", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "art-1"}}

		handler.GetArticle(c)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.getArticleFunc = func(ctx context.Context, authorID int64, articleID string, isAdmin bool) (*Article, error) {
			return nil, errors.New("unauthorized: не принадлежит этому автору")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/content/articles/art-1", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "art-1"}}

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
}

func TestHandler_ListArticles(t *testing.T) {
	t.Run("success returns articles", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.listArticlesFunc = func(ctx context.Context, authorID int64, status string, category string, isAdmin bool) (*ArticlesListResponse, error) {
			return &ArticlesListResponse{
				Articles: []Article{{ID: "art-1", Title: "Test"}},
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
		mock.listArticlesFunc = func(ctx context.Context, authorID int64, status string, category string, isAdmin bool) (*ArticlesListResponse, error) {
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
		mock.deleteArticleFunc = func(ctx context.Context, authorID int64, articleID string, isAdmin bool) error {
			return nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodDelete, "/content/articles/art-1", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "art-1"}}

		handler.DeleteArticle(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("not found returns 404", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.deleteArticleFunc = func(ctx context.Context, authorID int64, articleID string, isAdmin bool) error {
			return errors.New("not found")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodDelete, "/content/articles/art-1", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "art-1"}}

		handler.DeleteArticle(c)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.deleteArticleFunc = func(ctx context.Context, authorID int64, articleID string, isAdmin bool) error {
			return errors.New("unauthorized: не принадлежит")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodDelete, "/content/articles/art-1", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "art-1"}}

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
		mock.publishArticleFunc = func(ctx context.Context, authorID int64, articleID string, isAdmin bool) error {
			return nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/content/articles/art-1/publish", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "art-1"}}

		handler.PublishArticle(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("not found returns 404", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.publishArticleFunc = func(ctx context.Context, authorID int64, articleID string, isAdmin bool) error {
			return errors.New("not found")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/content/articles/art-1/publish", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "art-1"}}

		handler.PublishArticle(c)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("unauthorized returns 403", func(t *testing.T) {
		handler, mock := setupContentTestHandler()
		mock.publishArticleFunc = func(ctx context.Context, authorID int64, articleID string, isAdmin bool) error {
			return errors.New("unauthorized: не принадлежит")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/content/articles/art-1/publish", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "art-1"}}

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
