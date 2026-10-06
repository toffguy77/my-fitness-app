package content

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/jackc/pgx/v5/pgconn"
)

// maxSlugLength bounds the readable part of an article's address.
const maxSlugLength = 80

// translit is the simplified scheme Yandex uses in its own addresses: one
// Latin spelling per letter, hard and soft signs dropped. Migration 090 repeats
// it in SQL for the articles that existed before slugs did; the two agree on
// slugCases in slug_test.go.
var translit = map[rune]string{
	'а': "a", 'б': "b", 'в': "v", 'г': "g", 'д': "d", 'е': "e", 'ё': "e",
	'ж': "zh", 'з': "z", 'и': "i", 'й': "y", 'к': "k", 'л': "l", 'м': "m",
	'н': "n", 'о': "o", 'п': "p", 'р': "r", 'с': "s", 'т': "t", 'у': "u",
	'ф': "f", 'х': "kh", 'ц': "ts", 'ч': "ch", 'ш': "sh", 'щ': "shch",
	'ъ': "", 'ы': "y", 'ь': "", 'э': "e", 'ю': "yu", 'я': "ya",
}

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Slugify turns a title into an address: Latin letters, digits and single
// hyphens, at most maxSlugLength long and cut at a word boundary where there
// is one. A title with nothing transliterable gives an empty string; the
// caller decides what to do about that.
func Slugify(title string) string {
	var b strings.Builder
	pendingHyphen := false

	for _, r := range strings.ToLower(title) {
		var piece string
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			piece = string(r)
		default:
			if t, ok := translit[r]; ok {
				piece = t
			}
		}

		if piece == "" {
			// A dropped sign joins its neighbours rather than splitting them:
			// "подъезд" is one word.
			if _, isSign := translit[r]; !isSign {
				pendingHyphen = true
			}
			continue
		}
		if pendingHyphen && b.Len() > 0 {
			b.WriteByte('-')
		}
		pendingHyphen = false
		b.WriteString(piece)
	}

	slug := b.String()
	if len(slug) <= maxSlugLength {
		return slug
	}

	cut := slug[:maxSlugLength]
	if i := strings.LastIndexByte(cut, '-'); i > 0 && slug[maxSlugLength] != '-' {
		cut = cut[:i]
	}
	return strings.TrimSuffix(cut, "-")
}

// fallbackSlug addresses an article whose title has nothing to transliterate.
const fallbackSlug = "statya"

// BaseSlug is the address an article's title asks for, before repeats are
// told apart.
func BaseSlug(title string) string {
	if s := Slugify(title); s != "" {
		return s
	}
	return fallbackSlug
}

// SuffixedSlug is the n-th article to want the same base: "-2", "-3" and so
// on, with the base shortened so the whole stays within maxSlugLength.
func SuffixedSlug(base string, n int) string {
	suffix := "-" + strconv.Itoa(n)
	if len(base)+len(suffix) > maxSlugLength {
		base = strings.TrimRight(base[:maxSlugLength-len(suffix)], "-")
	}
	return base + suffix
}

// ValidSlug reports whether s may be used as an article's address.
func ValidSlug(s string) bool {
	return len(s) <= maxSlugLength && slugPattern.MatchString(s)
}

// rowQueryer is satisfied by both *sql.DB and *sql.Tx.
type rowQueryer interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// maxSlugAttempts bounds the search for a free numbered variant. Reaching it
// means a thousand articles share one title, which is a different problem.
const maxSlugAttempts = 1000

// freeSlug returns base if nobody holds it, otherwise the first of base-2,
// base-3, … that is free.
//
// Two articles created at the same moment with the same title can both be
// handed the same answer. The unique constraint refuses the second, which the
// caller reports as a conflict: rare enough that retrying by hand is fine.
func freeSlug(ctx context.Context, q rowQueryer, base string) (string, error) {
	for n := 1; n <= maxSlugAttempts; n++ {
		candidate := base
		if n > 1 {
			candidate = SuffixedSlug(base, n)
		}
		var taken bool
		if err := q.QueryRowContext(ctx,
			`SELECT EXISTS (SELECT 1 FROM articles WHERE slug = $1)`, candidate,
		).Scan(&taken); err != nil {
			return "", fmt.Errorf("check slug %q: %w", candidate, err)
		}
		if !taken {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("no free slug for %q: %w", base, apperrors.ErrConflict)
}

// isSlugTaken reports a collision on the slug's unique constraint — by code
// and constraint name, not message text.
func isSlugTaken(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "articles_slug_key"
}

// slugChangeAllowed decides an explicit change of address. It reports false
// with no error when the slug is already the article's own, so resending a
// form unchanged is not refused.
func (s *Service) slugChangeAllowed(ctx context.Context, articleID, slug string) (bool, error) {
	if !ValidSlug(slug) {
		return false, fmt.Errorf("slug %q: %w", slug, apperrors.ErrValidation)
	}

	var current, status string
	err := s.db.QueryRowContext(ctx,
		`SELECT slug, status FROM articles WHERE id = $1`, articleID,
	).Scan(&current, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return false, fmt.Errorf("article not found: %w", apperrors.ErrNotFound)
	}
	if err != nil {
		return false, fmt.Errorf("read slug: %w", err)
	}

	if slug == current {
		return false, nil
	}
	// A published address is already in links, in search and in the sitemap.
	// Moving it would break all three, and there is no redirect from an old
	// slug to a new one.
	if status == "published" {
		return false, fmt.Errorf("slug of a published article cannot change: %w", apperrors.ErrConflict)
	}
	return true, nil
}
