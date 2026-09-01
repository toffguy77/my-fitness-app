package upload

import (
	"fmt"

	"github.com/google/uuid"
)

// Key builds the storage key for an uploaded file.
//
// The client's filename is deliberately not part of it. A name is attacker
// controlled and has carried path traversal and control characters; the object
// key is server-generated and the extension comes from the detected type, not
// from what the file was called. Callers that need to show the original name
// store it as a separate field.
//
// The user id in the path is also what makes bulk deletion possible when an
// account is erased.
func Key(prefix string, userID int64, kind Kind) string {
	return fmt.Sprintf("%s/%d/%s%s", prefix, userID, uuid.New().String(), StoredKind(kind).Extension())
}
