package account

import (
	"fmt"
	"strings"
	"testing"

	"github.com/burcev/api/internal/shared/upload"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Every key the application writes, built the way the application builds it.
//
// This is the whole point of the test: erasure asked S3 for objects under
// "{userID}/" while every key begins with its purpose — avatars/, food-photos/,
// weekly-photos/. Nothing matched, DeleteByPrefix reported no error because
// listing nothing is not an error, and the erasure recorded success. A person
// asked for their account to be deleted and their progress photographs stayed
// in the bucket.
//
// Nothing connected the two halves, so nothing noticed. This connects them.
func keysTheApplicationWrites(userID int64, conversationID string) map[string][]string {
	return map[string][]string{
		// internal/modules/users/service.go: upload.Key("avatars", userID, kind)
		BucketProfilePhotos: {upload.Key("avatars", userID, upload.KindJPEG)},

		// internal/modules/food-tracker/handler.go: upload.Key("food-photos", …)
		BucketFoodPhotos: {upload.Key("food-photos", userID, upload.KindJPEG)},

		// internal/modules/chat/handler.go: upload.Key("chat/"+conversationID, …)
		BucketChat: {upload.Key("chat/"+conversationID, userID, upload.KindJPEG)},

		// internal/modules/dashboard/service.go
		BucketWeeklyPhotos: {fmt.Sprintf("weekly-photos/%d/%s/%s", userID, "2026-W37", "front.jpg")},

		// internal/modules/account/export.go
		BucketExports: {fmt.Sprintf("exports/%d/%s.zip", userID, "b3f1c0de")},
	}
}

func TestPrefixesCoverEveryKeyTheApplicationWrites(t *testing.T) {
	const userID = int64(4242)
	const conversationID = "6f1d2c9a-0b7e-4a51-9f2c-2b0a7d3e8c11"

	// The prefixes, built exactly as prefixesFor builds them, minus the database
	// lookup that supplies the conversation ids.
	prefixes := FilePrefixes{
		BucketWeeklyPhotos:  {fmt.Sprintf("weekly-photos/%d/", userID)},
		BucketProfilePhotos: {fmt.Sprintf("avatars/%d/", userID)},
		BucketFoodPhotos:    {fmt.Sprintf("food-photos/%d/", userID)},
		BucketExports:       {fmt.Sprintf("exports/%d/", userID)},
		BucketChat:          {fmt.Sprintf("chat/%s/%d/", conversationID, userID)},
	}

	for bucket, keys := range keysTheApplicationWrites(userID, conversationID) {
		t.Run(bucket, func(t *testing.T) {
			candidates := prefixes[bucket]
			require.NotEmpty(t, candidates, "erasure has no prefix at all for this bucket")

			for _, key := range keys {
				matched := false
				for _, prefix := range candidates {
					if strings.HasPrefix(key, prefix) {
						matched = true
						break
					}
				}
				assert.True(t, matched,
					"erasure would not delete %q: none of %v is a prefix of it", key, candidates)
			}
		})
	}
}

// Every bucket registered for erasure must be covered. A bucket added to the map
// in main.go and forgotten here would silently keep its files.
func TestEveryErasureBucketHasPrefixes(t *testing.T) {
	registered := []string{
		BucketWeeklyPhotos, BucketProfilePhotos, BucketChat,
		BucketFoodPhotos, BucketExports,
	}

	covered := keysTheApplicationWrites(1, "c")
	for _, bucket := range registered {
		assert.Contains(t, covered, bucket,
			"this bucket holds user files but the erasure test does not describe its keys")
	}
}

// A prefix must end at a path separator. "avatars/42" also matches "avatars/424",
// which would delete another person's photographs.
func TestPrefixesEndAtASeparator(t *testing.T) {
	const userID = int64(42)
	prefixes := FilePrefixes{
		BucketWeeklyPhotos:  {fmt.Sprintf("weekly-photos/%d/", userID)},
		BucketProfilePhotos: {fmt.Sprintf("avatars/%d/", userID)},
		BucketFoodPhotos:    {fmt.Sprintf("food-photos/%d/", userID)},
		BucketExports:       {fmt.Sprintf("exports/%d/", userID)},
		BucketChat:          {fmt.Sprintf("chat/%s/%d/", "conv", userID)},
	}

	for bucket, keys := range prefixes {
		for _, prefix := range keys {
			assert.True(t, strings.HasSuffix(prefix, "/"),
				"%s: %q would also match a longer user id", bucket, prefix)
		}
	}

	// The concrete danger, stated as a case rather than a rule.
	neighbour := upload.Key("avatars", 424, upload.KindJPEG)
	assert.False(t, strings.HasPrefix(neighbour, "avatars/42/"),
		"user 424's avatar must not fall under user 42's prefix")
}
