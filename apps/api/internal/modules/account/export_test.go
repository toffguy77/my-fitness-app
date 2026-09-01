package account

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The archive holds a copy of everything the account contains, so it is
// exactly the thing not to leave in a bucket indefinitely.
func TestPurgeExpiredExports_RemovesTheObjectAndThenTheRow(t *testing.T) {
	service, mock := fixture(t)

	mock.ExpectQuery("FROM data_exports").
		WillReturnRows(sqlmock.NewRows([]string{"id", "s3_key"}).
			AddRow("11111111-1111-1111-1111-111111111111", "exports/7/archive.zip"))
	mock.ExpectExec("DELETE FROM data_exports").WillReturnResult(sqlmock.NewResult(0, 1))

	removed, err := service.PurgeExpiredExports(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 1, removed)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestPurgeExpiredExports_NothingToDo(t *testing.T) {
	service, mock := fixture(t)

	mock.ExpectQuery("FROM data_exports").
		WillReturnRows(sqlmock.NewRows([]string{"id", "s3_key"}))

	removed, err := service.PurgeExpiredExports(context.Background())

	require.NoError(t, err)
	assert.Zero(t, removed)
}
