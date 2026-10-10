package mealplan

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeService struct {
	err      error
	gotUser  int64
	gotDate  string
	gotMeal  string
	gotInput ItemUpdate
}

func (f *fakeService) Get(_ context.Context, userID int64, date string) (*MealPlan, error) {
	f.gotUser, f.gotDate = userID, date
	return &MealPlan{Date: date}, f.err
}

func (f *fakeService) Regenerate(_ context.Context, userID int64, date string) (*MealPlan, error) {
	f.gotUser, f.gotDate = userID, date
	return &MealPlan{Date: date}, f.err
}

func (f *fakeService) UpdateItem(_ context.Context, userID int64, date, meal string, in ItemUpdate) (*MealPlan, error) {
	f.gotUser, f.gotDate, f.gotMeal, f.gotInput = userID, date, meal, in
	return &MealPlan{Date: date}, f.err
}

func (f *fakeService) Alternatives(_ context.Context, userID int64, date, meal string) ([]Alternative, error) {
	f.gotUser, f.gotDate, f.gotMeal = userID, date, meal
	return []Alternative{{RecipeID: "r"}}, f.err
}

func (f *fakeService) GetSettings(_ context.Context, userID int64) (*Settings, error) {
	f.gotUser = userID
	return &Settings{MealTypes: []string{"lunch"}}, f.err
}

func (f *fakeService) SetSettings(_ context.Context, userID int64, in Settings) (*Settings, error) {
	f.gotUser = userID
	return &in, f.err
}

func engine(svc ServiceInterface) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := NewHandler(logger.New(), svc)
	e := gin.New()
	e.Use(func(c *gin.Context) { c.Set("user_id", int64(7)); c.Next() })
	e.GET("/meal-plans/:date", h.Get)
	e.POST("/meal-plans/:date/regenerate", h.Regenerate)
	e.GET("/meal-plans/:date/items/:mealType/alternatives", h.Alternatives)
	e.PUT("/meal-plans/:date/items/:mealType", h.UpdateItem)
	e.GET("/meal-plan-settings", h.GetSettings)
	e.PUT("/meal-plan-settings", h.SetSettings)
	return e
}

func do(e *gin.Engine, method, path, body string) (*httptest.ResponseRecorder, map[string]any) {
	var req *http.Request
	if body != "" {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
	} else {
		req = httptest.NewRequest(method, path, nil)
	}
	w := httptest.NewRecorder()
	e.ServeHTTP(w, req)
	out := map[string]any{}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w, out
}

// The owner is the session's user, and the path is passed through as is.
func TestHandlerPassesOwnerAndPath(t *testing.T) {
	svc := &fakeService{}
	e := engine(svc)

	w, _ := do(e, http.MethodPut, "/meal-plans/2026-10-11/items/dinner", `{"grams":200,"locked":true}`)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, int64(7), svc.gotUser)
	assert.Equal(t, "2026-10-11", svc.gotDate)
	assert.Equal(t, "dinner", svc.gotMeal)
	require.NotNil(t, svc.gotInput.Grams)
	assert.Equal(t, 200.0, *svc.gotInput.Grams)
	require.NotNil(t, svc.gotInput.Locked)
	assert.True(t, *svc.gotInput.Locked)
	assert.Nil(t, svc.gotInput.RecipeID)

	w, body := do(e, http.MethodGet, "/meal-plans/2026-10-11/items/dinner/alternatives", "")
	require.Equal(t, http.StatusOK, w.Code)
	items := body["data"].(map[string]any)["items"].([]any)
	assert.Len(t, items, 1)
}

// Сценарий «Нет веса» на уровне ответа: 409, код target_missing и перечень.
func TestHandlerTargetMissing(t *testing.T) {
	e := engine(&fakeService{err: &TargetMissingError{Missing: []string{"weight"}}})
	w, body := do(e, http.MethodGet, "/meal-plans/2026-10-11", "")
	assert.Equal(t, http.StatusConflict, w.Code)
	assert.Equal(t, apperrors.CodeTargetMissing, body["code"])
	assert.Equal(t, map[string]any{"missing": []any{"weight"}}, body["params"])
}

func TestHandlerErrorMapping(t *testing.T) {
	cases := []struct {
		err  error
		code int
	}{
		{fmt.Errorf("%w: date", apperrors.ErrValidation), http.StatusUnprocessableEntity},
		{fmt.Errorf("%w: plan", apperrors.ErrNotFound), http.StatusNotFound},
		{fmt.Errorf("boom"), http.StatusInternalServerError},
	}
	for _, c := range cases {
		e := engine(&fakeService{err: c.err})
		for _, r := range []struct{ method, path, body string }{
			{http.MethodGet, "/meal-plans/2026-10-11", ""},
			{http.MethodPost, "/meal-plans/2026-10-11/regenerate", ""},
			{http.MethodPut, "/meal-plans/2026-10-11/items/lunch", `{}`},
			{http.MethodGet, "/meal-plans/2026-10-11/items/lunch/alternatives", ""},
			{http.MethodGet, "/meal-plan-settings", ""},
			{http.MethodPut, "/meal-plan-settings", `{"meal_types":[]}`},
		} {
			w, _ := do(e, r.method, r.path, r.body)
			assert.Equal(t, c.code, w.Code, "%s %s with %v", r.method, r.path, c.err)
		}
	}
}

func TestHandlerRejectsMalformedBodies(t *testing.T) {
	e := engine(&fakeService{})
	w, _ := do(e, http.MethodPut, "/meal-plans/2026-10-11/items/lunch", `{"grams":"много"}`)
	assert.Equal(t, http.StatusBadRequest, w.Code)
	w, _ = do(e, http.MethodPut, "/meal-plan-settings", `nope`)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestHandlerRequiresSession(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewHandler(logger.New(), &fakeService{})
	e := gin.New()
	e.GET("/meal-plans/:date", h.Get)
	w, _ := do(e, http.MethodGet, "/meal-plans/2026-10-11", "")
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}
