package auth

import (
	"database/sql"
	"testing"
)

// PasswordIsSet is the one rule every caller shares. It used to be three: an
// empty string counted as "has a password" in HasPassword and in
// ConfirmLinkWithPassword's !hash.Valid check, and did not in RequestDeletion
// — three answers for the same stored value, discovered only because Login
// had already been burned by exactly this column once.
func TestPasswordIsSet(t *testing.T) {
	cases := []struct {
		name     string
		password sql.NullString
		want     bool
	}{
		{"NULL is not a password", sql.NullString{}, false},
		{"empty string is not a password", sql.NullString{Valid: true, String: ""}, false},
		{"a real hash is a password", sql.NullString{Valid: true, String: "$2a$10$somehash"}, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := PasswordIsSet(tc.password); got != tc.want {
				t.Errorf("PasswordIsSet(%+v) = %v, want %v", tc.password, got, tc.want)
			}
		})
	}
}
