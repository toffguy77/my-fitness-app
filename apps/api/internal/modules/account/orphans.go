package account

import (
	"context"
	"fmt"
)

// OrphanReport is what one account left behind in storage.
type OrphanReport struct {
	UserID  int64
	Objects map[string]int // bucket -> objects still there
}

// Total counts every object across the buckets.
func (r OrphanReport) Total() int {
	total := 0
	for _, n := range r.Objects {
		total += n
	}
	return total
}

// orphanedAccounts lists accounts erased before the file removal worked.
//
// Until users.pending_file_prefixes existed, erasure asked S3 for objects under
// "{userID}/" — a prefix no key has ever started with. It deleted nothing,
// listing nothing is not an error, so it recorded success and set
// files_purged_at. Those accounts therefore look clean and the daily retry
// skips them: it only picks up rows where files_purged_at is NULL.
//
// They are exactly the rows that were erased and have no prefix list.
func (s *Service) orphanedAccounts(ctx context.Context) ([]int64, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id FROM users
		WHERE deleted_at IS NOT NULL
		  AND pending_file_prefixes IS NULL
		ORDER BY deleted_at`)
	if err != nil {
		return nil, fmt.Errorf("list accounts erased before prefixes were recorded: %w", err)
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan account id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ReportOrphanedFiles counts what erased accounts still have in storage. It
// deletes nothing.
//
// Deletion is not reversible and this walks accounts nobody is watching any
// more, so the count comes first and the removal is a separate decision.
func (s *Service) ReportOrphanedFiles(ctx context.Context) ([]OrphanReport, error) {
	ids, err := s.orphanedAccounts(ctx)
	if err != nil {
		return nil, err
	}

	var reports []OrphanReport
	for _, id := range ids {
		report := OrphanReport{UserID: id, Objects: map[string]int{}}

		for bucket, prefix := range idPrefixes(id) {
			client := s.buckets[bucket]
			if client == nil {
				continue
			}
			n, err := client.CountByPrefix(ctx, prefix)
			if err != nil {
				return reports, fmt.Errorf("count %s for user %d: %w", bucket, id, err)
			}
			if n > 0 {
				report.Objects[bucket] = n
			}
		}

		if client := s.buckets[BucketChat]; client != nil {
			keys, err := s.chatKeysFor(ctx, id)
			if err != nil {
				return reports, err
			}
			if len(keys) > 0 {
				report.Objects[BucketChat] = len(keys)
			}
		}

		if report.Total() > 0 {
			reports = append(reports, report)
		}
	}

	s.log.Info("Orphaned files report", "accounts_with_leftovers", len(reports))
	return reports, nil
}

// PurgeOrphanedFiles removes what ReportOrphanedFiles found, and marks each
// account so it is not walked again.
func (s *Service) PurgeOrphanedFiles(ctx context.Context) (int, error) {
	ids, err := s.orphanedAccounts(ctx)
	if err != nil {
		return 0, err
	}

	removed := 0
	for _, id := range ids {
		complete := true

		for bucket, prefix := range idPrefixes(id) {
			client := s.buckets[bucket]
			if client == nil {
				continue
			}
			n, err := client.DeleteByPrefix(ctx, prefix)
			removed += n
			if err != nil {
				s.log.Error("Failed to purge orphaned files",
					"bucket", bucket, "user_id", id, "error", err)
				complete = false
			}
		}

		if client := s.buckets[BucketChat]; client != nil {
			keys, err := s.chatKeysFor(ctx, id)
			if err != nil {
				s.log.Error("Failed to list orphaned chat files", "user_id", id, "error", err)
				complete = false
			} else {
				n, err := client.DeleteKeys(ctx, keys)
				removed += n
				if err != nil {
					s.log.Error("Failed to purge orphaned chat files", "user_id", id, "error", err)
					complete = false
				}
			}
		}

		if !complete {
			// Leave the account unmarked so the next run tries it again.
			continue
		}

		// An empty list rather than NULL: the account has been walked, and
		// leaving it NULL would make every future run walk the whole chat
		// bucket for it again.
		if _, err := s.db.ExecContext(ctx,
			`UPDATE users SET pending_file_prefixes = '{}'::jsonb WHERE id = $1`, id); err != nil {
			return removed, fmt.Errorf("mark account %d walked: %w", id, err)
		}
	}

	s.log.Info("Purged orphaned files", "objects", removed, "accounts", len(ids))
	return removed, nil
}

// idPrefixes are the buckets whose keys start with the user id, and so can be
// addressed without knowing anything else.
func idPrefixes(userID int64) map[string]string {
	return map[string]string{
		BucketWeeklyPhotos:  fmt.Sprintf("weekly-photos/%d/", userID),
		BucketProfilePhotos: fmt.Sprintf("avatars/%d/", userID),
		BucketFoodPhotos:    fmt.Sprintf("food-photos/%d/", userID),
		BucketExports:       fmt.Sprintf("exports/%d/", userID),
	}
}

// chatKeysFor finds one user's chat attachments by walking the bucket.
//
// Their key is chat/{conversation}/{user}/{file}, and after an erasure nothing
// connects the conversations to the person any more. Walking is the only way
// left; it is why this is a one-off pass and not the daily one.
func (s *Service) chatKeysFor(ctx context.Context, userID int64) ([]string, error) {
	client := s.buckets[BucketChat]
	if client == nil {
		return nil, nil
	}
	keys, err := client.KeysMatching(ctx, "chat/", fmt.Sprintf("/%d/", userID))
	if err != nil {
		return nil, fmt.Errorf("list chat files for user %d: %w", userID, err)
	}
	return keys, nil
}
