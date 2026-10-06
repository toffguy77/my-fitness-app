package content

import "time"

// Request types

type CreateArticleRequest struct {
	Title         string  `json:"title" binding:"required,max=500"`
	Excerpt       string  `json:"excerpt" binding:"max=1000"`
	Body          string  `json:"body,omitempty"`
	CoverImageURL string  `json:"cover_image_url,omitempty"`
	Category      string  `json:"category" binding:"required"`
	AudienceScope string  `json:"audience_scope" binding:"required"`
	ClientIDs     []int64 `json:"client_ids,omitempty"`
	// Slug is the article's address. Left out, it is made from the title.
	Slug *string `json:"slug,omitempty"`
}

type UpdateArticleRequest struct {
	Title         *string `json:"title" binding:"omitempty,max=500"`
	Excerpt       *string `json:"excerpt" binding:"omitempty,max=1000"`
	Body          *string `json:"body,omitempty"`
	Category      *string `json:"category,omitempty"`
	AudienceScope *string `json:"audience_scope,omitempty"`
	ClientIDs     []int64 `json:"client_ids,omitempty"`
	CoverImageURL *string `json:"cover_image_url,omitempty"`
	// Slug may change only while the article is unpublished: a published
	// address is already in links and in search.
	Slug *string `json:"slug,omitempty"`
}

type ScheduleArticleRequest struct {
	ScheduledAt time.Time `json:"scheduled_at" binding:"required"`
}

// Response types

type Article struct {
	ID            string     `json:"id"`
	Slug          string     `json:"slug"`
	AuthorID      int64      `json:"author_id"`
	AuthorName    string     `json:"author_name"`
	Title         string     `json:"title"`
	Excerpt       string     `json:"excerpt"`
	CoverImageURL string     `json:"cover_image_url,omitempty"`
	Category      string     `json:"category"`
	Status        string     `json:"status"`
	AudienceScope string     `json:"audience_scope"`
	Body          string     `json:"body,omitempty"`
	IsOwn         bool       `json:"is_own"`
	ScheduledAt   *time.Time `json:"scheduled_at,omitempty"`
	PublishedAt   *time.Time `json:"published_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

type ArticleCard struct {
	ID string `json:"id"`
	// Slug is present only when the article has a public address. A card for
	// an article meant for one curator's clients links by id: its public page
	// would not find it.
	Slug          string     `json:"slug,omitempty"`
	AuthorName    string     `json:"author_name"`
	Title         string     `json:"title"`
	Excerpt       string     `json:"excerpt"`
	CoverImageURL string     `json:"cover_image_url,omitempty"`
	Category      string     `json:"category"`
	PublishedAt   *time.Time `json:"published_at,omitempty"`
}

type ArticlesListResponse struct {
	Articles []Article `json:"articles"`
	Total    int       `json:"total"`
}

type FeedResponse struct {
	Articles []ArticleCard `json:"articles"`
	Total    int           `json:"total"`
}
