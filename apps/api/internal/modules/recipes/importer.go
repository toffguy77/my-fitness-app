package recipes

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/httpx"
	"github.com/burcev/api/internal/shared/upload"
	"github.com/google/uuid"
)

// maxPhotoBytes matches article media: a dish photo has no reason to be larger.
const maxPhotoBytes = 10 * 1024 * 1024

// UploadedPhoto is the answer to a photo upload.
type UploadedPhoto struct {
	PhotoKey string `json:"photo_key"`
	PhotoURL string `json:"photo_url"`
}

// UploadPhoto stores a dish or step photo the team uploads. The same checks as
// article covers: the bytes decide the type, never the client's header, because
// the bucket is public.
func (s *Service) UploadPhoto(ctx context.Context, file *multipart.FileHeader) (*UploadedPhoto, error) {
	if s.photos == nil {
		return nil, errPhotosOff
	}
	accepted, err := upload.Receive(file, upload.AllowedContentMedia, maxPhotoBytes)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", apperrors.ErrUnsupportedMedia, err)
	}
	return s.storePhoto(ctx, accepted)
}

func (s *Service) storePhoto(ctx context.Context, f upload.File) (*UploadedPhoto, error) {
	key := PhotoPrefix + uuid.New().String() + f.StoredKind.Extension()
	url, err := s.photos.UploadPublicFile(ctx, key, bytes.NewReader(f.Data), f.ContentType(), int64(f.Size))
	if err != nil {
		return nil, fmt.Errorf("upload recipe photo: %w", err)
	}
	return &UploadedPhoto{PhotoKey: key, PhotoURL: url}, nil
}

// acceptBytes runs a downloaded image through the same checks as an upload.
func acceptBytes(data []byte) (upload.File, error) {
	if len(data) > maxPhotoBytes {
		return upload.File{}, fmt.Errorf("%w: photo too large", apperrors.ErrUnsupportedMedia)
	}
	kind, err := upload.Check(data, upload.AllowedContentMedia)
	if err != nil {
		return upload.File{}, fmt.Errorf("%w: %w", apperrors.ErrUnsupportedMedia, err)
	}
	if _, err := upload.ValidateImage(data); err != nil {
		return upload.File{}, fmt.Errorf("%w: %w", apperrors.ErrUnsupportedMedia, err)
	}
	clean, err := upload.Sanitize(data, kind)
	if err != nil {
		return upload.File{}, fmt.Errorf("%w: %w", apperrors.ErrUnsupportedMedia, err)
	}
	return upload.File{Data: clean, Kind: kind, StoredKind: upload.StoredKind(kind), Size: len(clean)}, nil
}

// imageClient re-checks the host on every redirect: checking only the first
// address would let a redirect from vkusvill.ru point our server anywhere.
var imageClient = func() *http.Client {
	c := httpx.NewClient(15 * time.Second)
	c.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= 3 {
			return fmt.Errorf("%w: too many photo redirects", ErrUpstream)
		}
		if !isVkusvillURL(req.URL) {
			return fmt.Errorf("%w: photo redirect leaves vkusvill.ru", ErrUpstream)
		}
		return nil
	}
	return c
}()

func isVkusvillURL(u *url.URL) bool {
	host := u.Hostname()
	return u.Scheme == "https" && (host == "vkusvill.ru" || strings.HasSuffix(host, ".vkusvill.ru"))
}

// fetchVkusvillImage downloads a photo from VkusVill — and only from there: the
// address comes from a third party's answer, and following it anywhere would
// let that answer point our server at our own network.
func fetchVkusvillImage(ctx context.Context, raw string) ([]byte, error) {
	u, err := url.Parse(raw)
	if err != nil || !isVkusvillURL(u) {
		return nil, fmt.Errorf("%w: photo address is not vkusvill.ru", ErrUpstream)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrUpstream, err)
	}
	resp, err := imageClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrUpstream, err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: photo HTTP %d", ErrUpstream, resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, maxPhotoBytes+1))
}

// copyPhoto brings one source photo into our storage.
func (s *Service) copyPhoto(ctx context.Context, src string) (*string, error) {
	if strings.TrimSpace(src) == "" {
		return nil, nil
	}
	data, err := s.fetchImage(ctx, src)
	if err != nil {
		return nil, err
	}
	accepted, err := acceptBytes(data)
	if err != nil {
		return nil, fmt.Errorf("%w: photo %s: %w", ErrUpstream, src, err)
	}
	stored, err := s.storePhoto(ctx, accepted)
	if err != nil {
		return nil, err
	}
	return &stored.PhotoKey, nil
}

// ---------------------------------------------------------------------------
// VkusVill search and import
// ---------------------------------------------------------------------------

// VkusvillItem is one search result as the team sees it.
type VkusvillItem struct {
	SourceRef        string  `json:"source_ref"`
	Name             string  `json:"name"`
	PhotoURL         *string `json:"photo_url"`
	Portions         int     `json:"portions"`
	CookMinutes      int     `json:"cook_minutes"`
	Complexity       string  `json:"complexity"`
	IngredientsCount int     `json:"ingredients_count"`
	ImportedRecipeID *string `json:"imported_recipe_id"`
}

// VkusvillResults is a page of search results.
type VkusvillResults struct {
	Items   []VkusvillItem `json:"items"`
	HasMore bool           `json:"has_more"`
}

func (s *Service) importEnabled() bool { return s.vv != nil && s.photos != nil }

// SearchVkusvill searches VkusVill and marks what is already imported.
func (s *Service) SearchVkusvill(ctx context.Context, q string, page int) (*VkusvillResults, error) {
	if !s.importEnabled() {
		return nil, errImportOff
	}
	found, err := s.vv.Search(ctx, strings.TrimSpace(q), page)
	if err != nil {
		return nil, err
	}
	s.cache.put(found.Items)

	refs := make([]string, 0, len(found.Items))
	for _, r := range found.Items {
		refs = append(refs, strconv.FormatInt(r.ID, 10))
	}
	imported := map[string]string{}
	rows, err := s.db.QueryContext(ctx,
		`SELECT source_ref, id::text FROM recipes WHERE source = 'vkusvill' AND source_ref = ANY($1)`, refs)
	if err != nil {
		return nil, fmt.Errorf("match imported recipes: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var ref, id string
		if err := rows.Scan(&ref, &id); err != nil {
			return nil, err
		}
		imported[ref] = id
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := &VkusvillResults{Items: []VkusvillItem{}, HasMore: found.HasMore}
	for _, r := range found.Items {
		ref := strconv.FormatInt(r.ID, 10)
		item := VkusvillItem{
			SourceRef: ref, Name: r.Name, Portions: r.Portions,
			CookMinutes: MapCookMinutes(r.CookingTime), Complexity: MapComplexity(r.Complexity),
		}
		if r.Image != "" {
			img := r.Image
			item.PhotoURL = &img
		}
		for _, ing := range r.Ingredients {
			if !isSectionHeading(ing) {
				item.IngredientsCount++
			}
		}
		if id, ok := imported[ref]; ok {
			item.ImportedRecipeID = &id
		}
		out.Items = append(out.Items, item)
	}
	return out, nil
}

// importSearchPages bounds the re-search on a cache miss.
const importSearchPages = 3

// findVkusvill takes the recipe from the search cache, or searches again by
// name: the tool has no "get by id".
func (s *Service) findVkusvill(ctx context.Context, ref, q string) (*VkusvillRecipe, error) {
	if r, ok := s.cache.get(ref); ok {
		return &r, nil
	}
	q = strings.TrimSpace(q)
	if q == "" {
		return nil, fmt.Errorf("%w: vkusvill recipe %s is not in recent search results", apperrors.ErrNotFound, ref)
	}
	for page := 1; page <= importSearchPages; page++ {
		found, err := s.vv.Search(ctx, q, page)
		if err != nil {
			return nil, err
		}
		s.cache.put(found.Items)
		for _, r := range found.Items {
			if strconv.FormatInt(r.ID, 10) == ref {
				return &r, nil
			}
		}
		if !found.HasMore {
			break
		}
	}
	return nil, fmt.Errorf("%w: vkusvill recipe %s", apperrors.ErrNotFound, ref)
}

func (s *Service) existingImport(ctx context.Context, ref string) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx,
		`SELECT id::text FROM recipes WHERE source_ref = $1`, ref).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return id, err
}

// ImportVkusvill creates a draft from a VkusVill recipe, or returns the recipe
// already imported from it (existing = true).
//
// Text, servings, time, complexity, meal types, allergens, steps and photos are
// carried over; photos are copied into our storage. Each ingredient keeps its
// name and quantity label, gets catalogue candidates and — where the label
// allows — a weight, but no product: a person confirms it, and until then the
// draft cannot go to review.
func (s *Service) ImportVkusvill(ctx context.Context, userID int64, ref, q string) (string, bool, error) {
	if !s.importEnabled() {
		return "", false, errImportOff
	}
	ref = strings.TrimSpace(ref)
	if _, err := strconv.ParseInt(ref, 10, 64); err != nil {
		return "", false, validation("source_ref must be a VkusVill recipe id")
	}
	if id, err := s.existingImport(ctx, ref); err != nil || id != "" {
		return id, id != "", err
	}

	src, err := s.findVkusvill(ctx, ref, q)
	if err != nil {
		return "", false, err
	}

	v := &preparedVersion{
		Name:        cleanText(src.Name),
		Description: cleanText(src.Description),
		CookMinutes: MapCookMinutes(src.CookingTime),
		Complexity:  MapComplexity(src.Complexity),
		Servings:    max(src.Portions, 1),
		MealTypes:   MapMealTypes(src.Sections),
		Tags:        []string{},
		Allergens:   MapAllergens(src.Allergens),
	}

	if v.PhotoKey, err = s.copyPhoto(ctx, src.Image); err != nil {
		return "", false, err
	}
	for _, st := range src.Steps {
		text := cleanText(st.Text)
		var key *string
		if st.Image != nil {
			if key, err = s.copyPhoto(ctx, *st.Image); err != nil {
				return "", false, err
			}
		}
		if text == "" && key == nil {
			continue
		}
		v.Steps = append(v.Steps, preparedStep{Text: text, PhotoKey: key})
	}

	for _, ing := range src.Ingredients {
		if isSectionHeading(ing) {
			continue
		}
		name := cleanText(ing.Name)
		if name == "" {
			continue
		}
		label := strings.TrimSpace(*ing.Quantity)
		p := preparedIngredient{SourceName: &name}
		if label != "" {
			p.DisplayQuantity = &label
		}
		quantity := ParseQuantity(label)
		p.ToTaste = quantity.ToTaste

		found, err := s.foods.SearchCatalogue(ctx, name, 5)
		if err != nil {
			return "", false, fmt.Errorf("find candidates for %q: %w", name, err)
		}
		for _, f := range found {
			p.Candidates = append(p.Candidates, Candidate{FoodID: f.FoodID, Name: f.Name, DefaultWeight: f.DefaultWeight})
		}

		switch {
		case quantity.Grams != nil:
			p.Grams = quantity.Grams
		case quantity.Pieces != nil && len(found) > 0 && found[0].DefaultWeight != nil && *found[0].DefaultWeight > 0:
			g := round1(*quantity.Pieces * *found[0].DefaultWeight)
			p.Grams = &g
		}
		v.Ingredients = append(v.Ingredients, p)
	}
	// Ни один ингредиент не подтверждён — считать нечего, пока человек не выберет продукты.
	v.Nutrition = ComputeNutrition(nil, nil, v.Servings)

	recipeID, _, err := s.insertRecipe(ctx, userID, SourceVkusvill, &ref, v)
	if errors.Is(err, apperrors.ErrConflict) {
		// Параллельный импорт того же рецепта успел первым.
		id, lookupErr := s.existingImport(ctx, ref)
		if lookupErr != nil {
			return "", false, lookupErr
		}
		return id, true, nil
	}
	if err != nil {
		return "", false, err
	}
	return recipeID, false, nil
}
