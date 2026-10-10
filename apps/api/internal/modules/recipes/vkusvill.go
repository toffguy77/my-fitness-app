package recipes

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/burcev/api/internal/shared/httpx"
)

// ErrUpstream: VkusVill did not answer, or answered with an error. The handler
// answers 502 — the failure is theirs, and the rest of the catalogue works.
var ErrUpstream = errors.New("vkusvill is unavailable")

// vkusvillTimeout bounds one call; the tool answers in well under a second.
const vkusvillTimeout = 10 * time.Second

// vkusvillPerMinute is our share of their ~60 requests a minute: half, so a
// burst from the editor never gets the whole server throttled.
const vkusvillPerMinute = 30

// VkusvillRecipe is one recipe of the vkusvill_recipes tool, with the fields we
// carry over. Their КБЖУ («nutritional») is deliberately not read: ours is
// computed from our catalogue.
type VkusvillRecipe struct {
	ID          int64           `json:"id"`
	Name        string          `json:"name"`
	URL         string          `json:"url"`
	Description string          `json:"description"`
	Portions    int             `json:"portions"`
	Image       string          `json:"image"`
	CookingTime *vkusvillNamed  `json:"cooking_time"`
	Complexity  *vkusvillNamed  `json:"complexity"`
	Ingredients []VkusvillIngr  `json:"ingredients"`
	Steps       []VkusvillStep  `json:"steps"`
	Allergens   []vkusvillNamed `json:"allergens"`
	Sections    []vkusvillNamed `json:"sections"`
}

type vkusvillNamed struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

// VkusvillIngr is an ingredient line: a name and a human quantity label.
// quantity is null on section headings such as «<b>Для подачи:</b>».
type VkusvillIngr struct {
	Name     string  `json:"name"`
	Quantity *string `json:"quantity"`
}

// VkusvillStep is a cooking step with an optional photo.
type VkusvillStep struct {
	Number int     `json:"step_number"`
	Text   string  `json:"text"`
	Image  *string `json:"img"`
}

// VkusvillPage is one page of search results.
type VkusvillPage struct {
	Items   []VkusvillRecipe
	Total   int
	HasMore bool
}

// VkusvillClient is a minimal MCP client: JSON-RPC over HTTP, one tool.
//
// No initialize handshake: the server answers tools/call without a session
// (checked against the live server when this was written).
type VkusvillClient struct {
	url     string
	http    *http.Client
	limiter *minuteLimiter
	nextID  atomic.Int64
}

// NewVkusvillClient builds a client for the MCP endpoint at url.
func NewVkusvillClient(url string) *VkusvillClient {
	return &VkusvillClient{
		url:     url,
		http:    httpx.NewClient(vkusvillTimeout),
		limiter: newMinuteLimiter(vkusvillPerMinute),
	}
}

type rpcRequest struct {
	JSONRPC string    `json:"jsonrpc"`
	ID      int64     `json:"id"`
	Method  string    `json:"method"`
	Params  rpcParams `json:"params"`
}

type rpcParams struct {
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments"`
}

type rpcResponse struct {
	Result *struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		IsError bool `json:"isError"`
	} `json:"result"`
	Error *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

type toolPayload struct {
	OK   bool `json:"ok"`
	Data struct {
		Meta struct {
			Total   int  `json:"total"`
			HasMore bool `json:"has_more"`
		} `json:"meta"`
		Items []VkusvillRecipe `json:"items"`
	} `json:"data"`
}

// Search calls vkusvill_recipes. Every argument is required by the tool —
// leaving one out is answered with -32602.
func (c *VkusvillClient) Search(ctx context.Context, q string, page int) (*VkusvillPage, error) {
	if page < 1 {
		page = 1
	}
	if err := c.limiter.Wait(ctx); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrUpstream, err)
	}

	body, err := json.Marshal(rpcRequest{
		JSONRPC: "2.0",
		ID:      c.nextID.Add(1),
		Method:  "tools/call",
		Params: rpcParams{Name: "vkusvill_recipes", Arguments: map[string]any{
			"q":                           q,
			"page":                        page,
			"sort":                        "popularity",
			"id_feature_filter":           0,
			"id_cooking_time_filter":      0,
			"id_cooking_method_filter":    0,
			"id_complexity_filter":        0,
			"id_category_filter":          0,
			"id_exclude_allergens_filter": []int{},
		}},
	})
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, vkusvillTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrUpstream, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrUpstream, err)
	}
	defer func() { _ = resp.Body.Close() }()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, fmt.Errorf("%w: read: %w", ErrUpstream, err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: HTTP %d", ErrUpstream, resp.StatusCode)
	}
	if strings.HasPrefix(resp.Header.Get("Content-Type"), "text/event-stream") {
		raw = lastSSEData(raw)
	}

	var rpc rpcResponse
	if err := json.Unmarshal(raw, &rpc); err != nil {
		return nil, fmt.Errorf("%w: decode: %w", ErrUpstream, err)
	}
	if rpc.Error != nil {
		return nil, fmt.Errorf("%w: rpc %d: %s", ErrUpstream, rpc.Error.Code, rpc.Error.Message)
	}
	if rpc.Result == nil || len(rpc.Result.Content) == 0 || rpc.Result.IsError {
		return nil, fmt.Errorf("%w: empty or failed tool result", ErrUpstream)
	}

	var payload toolPayload
	if err := json.Unmarshal([]byte(rpc.Result.Content[0].Text), &payload); err != nil {
		return nil, fmt.Errorf("%w: decode tool payload: %w", ErrUpstream, err)
	}
	if !payload.OK {
		return nil, fmt.Errorf("%w: tool answered ok=false", ErrUpstream)
	}

	return &VkusvillPage{
		Items:   payload.Data.Items,
		Total:   payload.Data.Meta.Total,
		HasMore: payload.Data.Meta.HasMore,
	}, nil
}

// lastSSEData extracts the JSON of the last "data:" event of a stream answer.
func lastSSEData(raw []byte) []byte {
	var last []byte
	scanner := bufio.NewScanner(bytes.NewReader(raw))
	scanner.Buffer(make([]byte, 0, 64*1024), 8<<20)
	for scanner.Scan() {
		line := scanner.Bytes()
		if bytes.HasPrefix(line, []byte("data:")) {
			last = append([]byte(nil), bytes.TrimSpace(line[len("data:"):])...)
		}
	}
	if last == nil {
		return raw
	}
	return last
}

// minuteLimiter allows n calls in any sliding minute and makes the rest wait.
type minuteLimiter struct {
	mu    sync.Mutex
	n     int
	calls []time.Time
	now   func() time.Time
}

func newMinuteLimiter(n int) *minuteLimiter {
	return &minuteLimiter{n: n, now: time.Now}
}

// Wait blocks until a call is allowed or ctx ends.
func (l *minuteLimiter) Wait(ctx context.Context) error {
	for {
		l.mu.Lock()
		now := l.now()
		cutoff := now.Add(-time.Minute)
		kept := l.calls[:0]
		for _, at := range l.calls {
			if at.After(cutoff) {
				kept = append(kept, at)
			}
		}
		l.calls = kept
		if len(l.calls) < l.n {
			l.calls = append(l.calls, now)
			l.mu.Unlock()
			return nil
		}
		wait := l.calls[0].Add(time.Minute).Sub(now)
		l.mu.Unlock()

		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}

// ---------------------------------------------------------------------------
// Mapping VkusVill vocabularies onto ours
// ---------------------------------------------------------------------------

var vkusvillComplexity = map[string]string{
	"легкий": "easy", "лёгкий": "easy", "средний": "medium", "профи": "hard",
}

var vkusvillCookingMinutes = map[string]int{
	"до 20 минут": 20, "до 40 минут": 40, "до 1 часа": 60, "1-2 часа": 120, "более 2 часов": 180,
}

var vkusvillMealSections = map[string]string{
	"на завтрак": "breakfast", "на обед": "lunch", "на ужин": "dinner", "перекус": "snack",
}

// Лук и Сахар у ВкусВилла — аллергены, у нас — нет: в нашем списке их нет, и
// клиент не сможет их у себя отметить.
var vkusvillAllergens = map[string]string{
	"орехи": "nuts", "глютен": "gluten", "лактоза": "lactose", "яйца": "eggs",
	"кунжут": "sesame", "горчица": "mustard",
}

func key(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

// MapComplexity maps «Легкий/Средний/Профи»; unknown is easy.
func MapComplexity(c *vkusvillNamed) string {
	if c != nil {
		if v, ok := vkusvillComplexity[key(c.Name)]; ok {
			return v
		}
	}
	return "easy"
}

// MapCookMinutes maps a cooking-time bucket to its upper bound in minutes.
func MapCookMinutes(c *vkusvillNamed) int {
	if c != nil {
		if v, ok := vkusvillCookingMinutes[key(c.Name)]; ok {
			return v
		}
	}
	return 0
}

// MapMealTypes reads meal types from sections; lunch and dinner if none.
func MapMealTypes(sections []vkusvillNamed) []string {
	found := map[string]bool{}
	for _, s := range sections {
		if v, ok := vkusvillMealSections[key(s.Name)]; ok {
			found[v] = true
		}
	}
	var out []string
	for _, m := range MealTypes {
		if found[m] {
			out = append(out, m)
		}
	}
	if len(out) == 0 {
		return []string{"lunch", "dinner"}
	}
	return out
}

// MapAllergens maps the allergens we share a meaning with and drops the rest.
func MapAllergens(list []vkusvillNamed) []string {
	found := map[string]bool{}
	for _, a := range list {
		if v, ok := vkusvillAllergens[key(a.Name)]; ok {
			found[v] = true
		}
	}
	out := []string{}
	for _, a := range Allergens {
		if found[a] {
			out = append(out, a)
		}
	}
	return out
}

var htmlTag = regexp.MustCompile(`<[^>]*>`)

// isSectionHeading: «<b>Для подачи:</b>» with no quantity is a heading of the
// ingredient list, not an ingredient.
func isSectionHeading(ing VkusvillIngr) bool {
	return ing.Quantity == nil || strings.Contains(ing.Name, "<")
}

func cleanText(s string) string {
	return strings.TrimSpace(htmlTag.ReplaceAllString(s, ""))
}

// ---------------------------------------------------------------------------
// Search cache
// ---------------------------------------------------------------------------

// recipeCache keeps recently found recipes by id: the tool has no "get by
// id", so import takes the recipe the person just saw in search.
type recipeCache struct {
	mu    sync.Mutex
	ttl   time.Duration
	items map[string]cachedRecipe
	now   func() time.Time
}

type cachedRecipe struct {
	recipe  VkusvillRecipe
	expires time.Time
}

func newRecipeCache(ttl time.Duration) *recipeCache {
	return &recipeCache{ttl: ttl, items: map[string]cachedRecipe{}, now: time.Now}
}

func (c *recipeCache) put(recipes []VkusvillRecipe) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	for k, v := range c.items {
		if now.After(v.expires) {
			delete(c.items, k)
		}
	}
	for _, r := range recipes {
		c.items[fmt.Sprint(r.ID)] = cachedRecipe{recipe: r, expires: now.Add(c.ttl)}
	}
}

func (c *recipeCache) get(ref string) (VkusvillRecipe, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.items[ref]
	if !ok || c.now().After(v.expires) {
		return VkusvillRecipe{}, false
	}
	return v.recipe, true
}
