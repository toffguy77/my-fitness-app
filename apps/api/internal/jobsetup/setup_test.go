package jobsetup

import (
	"testing"
	"time"

	"github.com/burcev/api/internal/shared/jobs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Register panics on an invalid declaration, so this test is the guarantee that
// every job in the list can actually be scheduled — the previous arrangement
// had two written jobs that were simply never wired up, and nothing noticed.
func TestRegister_DeclaresEveryJobValidly(t *testing.T) {
	registry := jobs.NewRegistry()

	require.NotPanics(t, func() { Register(registry, Deps{}) })

	names := make([]string, 0)
	for _, j := range registry.All() {
		names = append(names, j.Name)
		assert.NotZero(t, j.Timeout, "%s must declare a timeout", j.Name)
		assert.NotNil(t, j.Run, "%s must have a run function", j.Name)
	}

	assert.ElementsMatch(t, []string{
		"content.publish-scheduled",
		"curator.daily-snapshot",
		"curator.weekly-snapshot",
		"cleanup.password-reset-attempts",
		"cleanup.data-exports",
		"cleanup.ws-tickets",
		"cleanup.refresh-tokens",
		"cleanup.oauth-pending-links",
		"leads.send-reminders",
		"leads.purge-expired",
		"analytics.purge-events",
		"support.purge-conversations",
		"cleanup.job-runs",
		"account.build-exports",
		"account.execute-deletions",
	}, names)
}

// A daily job must run after the day it summarises has ended, and the cleanups
// must not collide with the snapshot they could otherwise race.
func TestRegister_SchedulesDoNotOverlap(t *testing.T) {
	registry := jobs.NewRegistry()
	Register(registry, Deps{})

	daily, ok := registry.Get("curator.daily-snapshot")
	require.True(t, ok)
	assert.Equal(t, jobs.PeriodDaily, daily.Period)
	assert.Equal(t, 3, daily.RunAt.Hour)

	weekly, ok := registry.Get("curator.weekly-snapshot")
	require.True(t, ok)
	assert.Equal(t, time.Monday, weekly.Weekday)
	assert.Greater(t, weekly.RunAt.Hour, daily.RunAt.Hour,
		"the weekly roll-up must run after the daily snapshot it may read")

	cleanup, ok := registry.Get("cleanup.password-reset-attempts")
	require.True(t, ok)
	assert.Less(t, cleanup.RunAt.Hour, daily.RunAt.Hour)
}

func TestRegister_PublishingIsMinutely(t *testing.T) {
	registry := jobs.NewRegistry()
	Register(registry, Deps{})

	publish, ok := registry.Get("content.publish-scheduled")
	require.True(t, ok)
	// An author choosing a publish time expects it honoured to the minute.
	assert.Equal(t, time.Minute, publish.Interval)
}
