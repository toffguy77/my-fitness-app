package recipes

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/burcev/api/internal/config"
	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeService answers every call with err, and records what it was given.
type fakeService struct {
	ServiceInterface
	err        error
	existing   bool
	gotEdits   *VersionInput
	gotComment string
	gotRef     string
	gotQ       string
	gotClient  int64
	gotQuery   ListQuery
}

func (f *fakeService) ListAdmin(_ context.Context, q ListQuery) ([]RecipeSummary, int, error) {
	f.gotQuery = q
	return nil, 0, f.err
}
func (f *fakeService) Submit(context.Context, string) (*RecipeVersion, error) {
	return &RecipeVersion{State: StateReview}, f.err
}
func (f *fakeService) Approve(_ context.Context, _ int64, _ string, edits *VersionInput) (*RecipeVersion, error) {
	f.gotEdits = edits
	return &RecipeVersion{State: StateApproved}, f.err
}
func (f *fakeService) Return(_ context.Context, _ int64, _ string, comment string) (*RecipeVersion, error) {
	f.gotComment = comment
	return &RecipeVersion{State: StateDraft}, f.err
}
func (f *fakeService) GetAvailable(context.Context, int64, string) (*RecipeVersion, error) {
	return &RecipeVersion{}, f.err
}
func (f *fakeService) SearchVkusvill(context.Context, string, int) (*VkusvillResults, error) {
	return &VkusvillResults{}, f.err
}
func (f *fakeService) ImportVkusvill(_ context.Context, _ int64, ref, q string) (string, bool, error) {
	f.gotRef, f.gotQ = ref, q
	return "recipe-1", f.existing, f.err
}
func (f *fakeService) SetRestrictions(_ context.Context, userID int64, _ RestrictionsInput, _ bool) (*FoodRestrictions, error) {
	f.gotClient = userID
	return &FoodRestrictions{}, f.err
}
func (f *fakeService) Hide(_ context.Context, _, clientID int64, _ string) error {
	f.gotClient = clientID
	return f.err
}
func (f *fakeService) SearchCatalogue(context.Context, string) ([]foodtracker.CatalogueFood, error) {
	return []foodtracker.CatalogueFood{}, f.err
}

func testHandler(svc ServiceInterface, features config.Features) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := NewHandler(&config.Config{Features: features}, logger.New(), svc)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("user_id", int64(7))
		c.Set(middleware.ContextClientID, int64(42))
	})
	r.GET("/admin/recipes", h.AdminList)
	r.POST("/admin/recipes/:id/submit", h.AdminSubmit)
	r.PUT("/admin/recipes/:id/draft", h.AdminSaveDraft)
	r.POST("/admin/recipes/photos", h.AdminUploadPhoto)
	r.GET("/admin/recipes/catalogue-search", h.AdminCatalogueSearch)
	r.GET("/admin/recipes/import/vkusvill", h.AdminVkusvillSearch)
	r.POST("/admin/recipes/import/vkusvill/:sourceRef", h.AdminVkusvillImport)
	r.POST("/curator/recipes/:id/approve", h.CuratorApprove)
	r.POST("/curator/recipes/:id/return", h.CuratorReturn)
	r.PUT("/curator/clients/:id/food-restrictions", h.CuratorSetClientRestrictions)
	r.PUT("/curator/clients/:id/hidden-recipes/:recipeId", h.CuratorHide)
	r.GET("/recipes/:id", h.Get)
	return r
}

func do(r *gin.Engine, method, path, body string) (*httptest.ResponseRecorder, map[string]any) {
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, reader)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var decoded map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &decoded)
	return w, decoded
}

var allOn = config.Features{RecipeImport: true, ContentMedia: true}

// Сценарий «Отправка на проверку неполного рецепта»: 422 с перечнем полей.
func TestSubmitIncompleteAnswers422WithMissingFields(t *testing.T) {
	svc := &fakeService{err: &MissingFieldsError{Missing: []string{"ingredients", "steps", "meal_types"}}}
	w, body := do(testHandler(svc, allOn), http.MethodPost, "/admin/recipes/r1/submit", "")

	assert.Equal(t, http.StatusUnprocessableEntity, w.Code)
	assert.Equal(t, apperrors.CodeValidation, body["code"])
	params := body["params"].(map[string]any)
	assert.Equal(t, []any{"ingredients", "steps", "meal_types"}, params["missing"])
}

func TestErrorsMapToStatuses(t *testing.T) {
	cases := []struct {
		err    error
		status int
		code   string
	}{
		{fmt.Errorf("x: %w", apperrors.ErrValidation), http.StatusUnprocessableEntity, apperrors.CodeValidation},
		{errRecipeNotFound, http.StatusNotFound, apperrors.CodeNotFound},
		{errWrongState, http.StatusConflict, apperrors.CodeConflict},
		{errImportOff, http.StatusServiceUnavailable, apperrors.CodeFeatureUnavailable},
		{fmt.Errorf("%w: HTTP 503", ErrUpstream), http.StatusBadGateway, apperrors.CodeInternal},
		{fmt.Errorf("%w: x", apperrors.ErrUnsupportedMedia), http.StatusUnsupportedMediaType, apperrors.CodeUnsupportedMedia},
		{fmt.Errorf("boom"), http.StatusInternalServerError, apperrors.CodeInternal},
	}
	for _, tc := range cases {
		t.Run(tc.err.Error(), func(t *testing.T) {
			w, body := do(testHandler(&fakeService{err: tc.err}, allOn), http.MethodPost, "/admin/recipes/r1/submit", "")
			assert.Equal(t, tc.status, w.Code)
			assert.Equal(t, tc.code, body["code"])
		})
	}
}

// Сценарий «ВкусВилл недоступен»: поиск и импорт — 502, каталог работает.
func TestVkusvillUnavailableIs502AndCatalogueStillWorks(t *testing.T) {
	svc := &fakeService{err: fmt.Errorf("%w: timeout", ErrUpstream)}
	r := testHandler(svc, allOn)

	w, _ := do(r, http.MethodGet, "/admin/recipes/import/vkusvill?q=суп", "")
	assert.Equal(t, http.StatusBadGateway, w.Code)
	w, _ = do(r, http.MethodPost, "/admin/recipes/import/vkusvill/123?q=суп", "")
	assert.Equal(t, http.StatusBadGateway, w.Code)

	svc.err = nil
	w, _ = do(r, http.MethodGet, "/admin/recipes", "")
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestImportAnswers201ThenExisting200(t *testing.T) {
	svc := &fakeService{}
	r := testHandler(svc, allOn)

	w, body := do(r, http.MethodPost, "/admin/recipes/import/vkusvill/5776208?q=Пирожки", "")
	assert.Equal(t, http.StatusCreated, w.Code)
	assert.Equal(t, "recipe-1", body["data"].(map[string]any)["recipe_id"])
	assert.Equal(t, "5776208", svc.gotRef)
	assert.Equal(t, "Пирожки", svc.gotQ)

	svc.existing = true
	w, body = do(r, http.MethodPost, "/admin/recipes/import/vkusvill/5776208", "")
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, true, body["data"].(map[string]any)["existing"])
}

func TestImportAndPhotosOffAnswer503(t *testing.T) {
	r := testHandler(&fakeService{}, config.Features{})
	for _, req := range []struct{ method, path string }{
		{http.MethodGet, "/admin/recipes/import/vkusvill?q=суп"},
		{http.MethodPost, "/admin/recipes/import/vkusvill/1"},
		{http.MethodPost, "/admin/recipes/photos"},
	} {
		w, body := do(r, req.method, req.path, "")
		assert.Equal(t, http.StatusServiceUnavailable, w.Code, req.path)
		assert.Equal(t, apperrors.CodeFeatureUnavailable, body["code"])
	}
}

func TestApproveBodyIsOptional(t *testing.T) {
	svc := &fakeService{}
	r := testHandler(svc, allOn)

	w, _ := do(r, http.MethodPost, "/curator/recipes/r1/approve", "")
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Nil(t, svc.gotEdits)

	w, _ = do(r, http.MethodPost, "/curator/recipes/r1/approve",
		`{"version":{"name":"Суп","ingredients":[{"food_id":123,"grams":250}]}}`)
	assert.Equal(t, http.StatusOK, w.Code)
	require.NotNil(t, svc.gotEdits)
	assert.Equal(t, "Суп", svc.gotEdits.Name)
	require.Len(t, svc.gotEdits.Ingredients, 1)
	assert.Equal(t, "123", *svc.gotEdits.Ingredients[0].FoodID.Value, "a numeric products id is accepted")
}

func TestReturnPassesTheComment(t *testing.T) {
	svc := &fakeService{}
	w, _ := do(testHandler(svc, allOn), http.MethodPost, "/curator/recipes/r1/return", `{"comment":"Уточните вес"}`)
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "Уточните вес", svc.gotComment)
}

// Кураторские маршруты берут клиента из того, что проверил
// RequireClientRelationship, а не из пути.
func TestCuratorRoutesUseTheVerifiedClient(t *testing.T) {
	svc := &fakeService{}
	r := testHandler(svc, allOn)

	w, _ := do(r, http.MethodPut, "/curator/clients/999/food-restrictions", `{"allergens":["nuts"]}`)
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, int64(42), svc.gotClient)

	svc.gotClient = 0
	w, _ = do(r, http.MethodPut, "/curator/clients/999/hidden-recipes/r1", "")
	assert.Equal(t, http.StatusNoContent, w.Code)
	assert.Equal(t, int64(42), svc.gotClient)
}

func TestListParsesPageAndState(t *testing.T) {
	svc := &fakeService{}
	w, body := do(testHandler(svc, allOn), http.MethodGet, "/admin/recipes?page=3&page_size=10&state=review&q=суп", "")
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, ListQuery{Q: "суп", State: "review", Limit: 10, Offset: 20}, svc.gotQuery)
	data := body["data"].(map[string]any)
	assert.Equal(t, []any{}, data["items"])
	assert.EqualValues(t, 10, data["limit"])
	assert.EqualValues(t, 20, data["offset"])
}

// --- Photo upload against the real service with an in-memory store ---

type memoryStore struct {
	mu    sync.Mutex
	files map[string][]byte
	types map[string]string
}

func newMemoryStore() *memoryStore {
	return &memoryStore{files: map[string][]byte{}, types: map[string]string{}}
}

func (m *memoryStore) UploadPublicFile(_ context.Context, key string, data io.Reader, contentType string, _ int64) (string, error) {
	b, err := io.ReadAll(data)
	if err != nil {
		return "", err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.files[key] = b
	m.types[key] = contentType
	return m.PublicURL(key), nil
}

func (m *memoryStore) PublicURL(key string) string {
	return "https://storage.example.test/content/" + key
}

func pngBytes(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	for x := 0; x < 8; x++ {
		img.Set(x, x, color.RGBA{R: 200, A: 255})
	}
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, img))
	return buf.Bytes()
}

func multipartRequest(t *testing.T, name string, content []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, err := mw.CreateFormFile("file", name)
	require.NoError(t, err)
	_, err = part.Write(content)
	require.NoError(t, err)
	require.NoError(t, mw.Close())
	req := httptest.NewRequest(http.MethodPost, "/admin/recipes/photos", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	return req
}

// Сценарий «Загрузка не изображения»: 415, и в хранилище ничего не попало.
func TestUploadingNonImageAnswers415(t *testing.T) {
	store := newMemoryStore()
	r := testHandler(NewService(nil, logger.New(), nil, store, nil), allOn)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, multipartRequest(t, "photo.png", []byte("<html><script>alert(1)</script></html>")))

	assert.Equal(t, http.StatusUnsupportedMediaType, w.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, apperrors.CodeUnsupportedMedia, body["code"])
	assert.Empty(t, store.files)
}

func TestUploadingImageStoresItUnderRecipes(t *testing.T) {
	store := newMemoryStore()
	r := testHandler(NewService(nil, logger.New(), nil, store, nil), allOn)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, multipartRequest(t, "anything.txt", pngBytes(t)))

	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	var body struct {
		Data UploadedPhoto `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.True(t, strings.HasPrefix(body.Data.PhotoKey, "recipes/"))
	assert.True(t, strings.HasSuffix(body.Data.PhotoKey, ".png"), "extension comes from the bytes, not the name")
	assert.Equal(t, store.PublicURL(body.Data.PhotoKey), body.Data.PhotoURL)
	assert.Equal(t, "image/png", store.types[body.Data.PhotoKey])
}

func TestFlexIDAcceptsNumbersAndStrings(t *testing.T) {
	var in struct {
		IDs []FlexID `json:"ids"`
	}
	require.NoError(t, json.Unmarshal([]byte(`{"ids":[123,"456","6f1d2c9a-0b7e-4a51-9f2c-2b0a7d3e8c11",null,""]}`), &in))
	require.Len(t, in.IDs, 5)
	assert.Equal(t, "123", *in.IDs[0].Value)
	assert.Equal(t, "456", *in.IDs[1].Value)
	assert.Equal(t, "6f1d2c9a-0b7e-4a51-9f2c-2b0a7d3e8c11", *in.IDs[2].Value)
	assert.Nil(t, in.IDs[3].Value)
	assert.Nil(t, in.IDs[4].Value)

	assert.Error(t, json.Unmarshal([]byte(`{"ids":[1.5]}`), &in))
}
