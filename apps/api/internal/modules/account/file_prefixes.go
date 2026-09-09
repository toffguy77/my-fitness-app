package account

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

// Bucket names as they are registered in NewService. They are the keys of the
// prefix map, so they have to agree with cmd/server/main.go.
const (
	BucketWeeklyPhotos  = "weekly-photos"
	BucketProfilePhotos = "profile-photos"
	BucketChat          = "chat"
	BucketFoodPhotos    = "food-photos"
	BucketExports       = "exports"
)

// FilePrefixes lists, per bucket, the key prefixes holding one user's files.
type FilePrefixes map[string][]string

// prefixesFor builds the list for a user.
//
// Every entry mirrors a key the application actually writes. Getting this wrong
// is silent: DeleteByPrefix finds nothing, reports no error, and the erasure
// records success while the photographs stay. That is what happened — deletion
// asked for "{userID}/" while every key begins with its purpose, so nothing was
// ever removed. TestPrefixesCoverEveryKeyTheApplicationWrites exists to stop it
// happening again.
//
// The chat bucket is the awkward one: its keys are
// chat/{conversation}/{user}/{file}, so the user id is not a prefix and the
// conversations have to be listed first. They must be listed *before* the
// erasure transaction, which anonymises them — afterwards nothing connects the
// user to them any more.
func (s *Service) prefixesFor(ctx context.Context, userID int64) (FilePrefixes, error) {
	prefixes := FilePrefixes{
		BucketWeeklyPhotos:  {fmt.Sprintf("weekly-photos/%d/", userID)},
		BucketProfilePhotos: {fmt.Sprintf("avatars/%d/", userID)},
		BucketFoodPhotos:    {fmt.Sprintf("food-photos/%d/", userID)},
		BucketExports:       {fmt.Sprintf("exports/%d/", userID)},
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT id FROM conversations WHERE client_id = $1 OR curator_id = $1`, userID)
	if err != nil {
		return nil, fmt.Errorf("list conversations for file removal: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var conversationID string
		if err := rows.Scan(&conversationID); err != nil {
			return nil, fmt.Errorf("scan conversation id: %w", err)
		}
		prefixes[BucketChat] = append(prefixes[BucketChat],
			fmt.Sprintf("chat/%s/%d/", conversationID, userID))
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return prefixes, nil
}

// rememberPrefixes stores the list on the user row, inside the erasure
// transaction.
//
// Without this the retry after a storage outage would recompute the list from
// links the transaction has just removed: it would find no conversations, delete
// nothing for the chat bucket, and record success.
func rememberPrefixes(ctx context.Context, tx *sql.Tx, userID int64, prefixes FilePrefixes) error {
	encoded, err := json.Marshal(prefixes)
	if err != nil {
		return fmt.Errorf("encode file prefixes: %w", err)
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE users SET pending_file_prefixes = $1 WHERE id = $2`, encoded, userID); err != nil {
		return fmt.Errorf("remember file prefixes: %w", err)
	}
	return nil
}

// storedPrefixes reads back what rememberPrefixes saved.
func (s *Service) storedPrefixes(ctx context.Context, userID int64) (FilePrefixes, error) {
	var encoded []byte
	err := s.db.QueryRowContext(ctx,
		`SELECT pending_file_prefixes FROM users WHERE id = $1`, userID).Scan(&encoded)
	if err != nil {
		return nil, fmt.Errorf("read file prefixes: %w", err)
	}
	if len(encoded) == 0 {
		return nil, nil
	}

	var prefixes FilePrefixes
	if err := json.Unmarshal(encoded, &prefixes); err != nil {
		return nil, fmt.Errorf("decode file prefixes: %w", err)
	}
	return prefixes, nil
}
