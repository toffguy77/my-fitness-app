package migrations

import "embed"

// FS contains all migration SQL files embedded in the binary.
//
//go:embed *.sql
var FS embed.FS
