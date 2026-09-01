package admin

import (
	"context"
	"net/http"
	"time"

	"github.com/burcev/api/internal/shared/jobs"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// JobsHandler exposes the periodic job schedule and history.
//
// It exists because "is this job running, and did it succeed?" previously had
// no answer short of reading container logs — which is how a snapshot collector
// that was never called went unnoticed indefinitely.
type JobsHandler struct {
	scheduler *jobs.Scheduler
	// manualRuns throttles the manual trigger so it cannot be used to hammer
	// an expensive job.
	lastManualRun map[string]time.Time
}

// NewJobsHandler creates the handler.
func NewJobsHandler(scheduler *jobs.Scheduler) *JobsHandler {
	return &JobsHandler{scheduler: scheduler, lastManualRun: make(map[string]time.Time)}
}

// manualRunCooldown between manual triggers of the same job.
const manualRunCooldown = time.Minute

type jobView struct {
	Name     string   `json:"name"`
	Schedule string   `json:"schedule"`
	LastRun  *runView `json:"last_run"`
}

type runView struct {
	StartedAt      time.Time  `json:"started_at"`
	FinishedAt     *time.Time `json:"finished_at"`
	Status         string     `json:"status"`
	Error          string     `json:"error,omitempty"`
	ItemsProcessed int        `json:"items_processed"`
}

// List handles GET /api/v1/admin/jobs.
func (h *JobsHandler) List(c *gin.Context) {
	registered := h.scheduler.Registry().All()
	views := make([]jobView, 0, len(registered))

	for _, job := range registered {
		view := jobView{Name: job.Name, Schedule: job.Schedule()}

		last, err := h.scheduler.LastRun(c.Request.Context(), job.Name)
		if err != nil {
			response.InternalError(c, "Не удалось загрузить историю задач")
			return
		}
		if last != nil {
			view.LastRun = &runView{
				StartedAt:      last.StartedAt,
				FinishedAt:     last.FinishedAt,
				Status:         string(last.Status),
				Error:          last.Error,
				ItemsProcessed: last.ItemsProcessed,
			}
		}
		views = append(views, view)
	}

	response.Success(c, http.StatusOK, gin.H{"jobs": views})
}

// Run handles POST /api/v1/admin/jobs/:name/run.
//
// The manual trigger exists for the first population of a newly enabled job and
// for verifying a fix without waiting for the schedule. It takes the same lock
// as a scheduled run, so it cannot cause a second concurrent execution.
func (h *JobsHandler) Run(c *gin.Context) {
	name := c.Param("name")

	job, found := h.scheduler.Registry().Get(name)
	if !found {
		response.NotFound(c, "Задача не найдена")
		return
	}

	// Throttle before touching the database: a request we are going to reject
	// should not cost a query.
	if last, ok := h.lastManualRun[name]; ok && time.Since(last) < manualRunCooldown {
		response.Error(c, http.StatusTooManyRequests,
			"Задачу можно запускать вручную не чаще одного раза в минуту")
		return
	}

	running, err := h.scheduler.IsRunning(c.Request.Context(), name)
	if err != nil {
		response.InternalError(c, "Не удалось проверить состояние задачи")
		return
	}
	if running {
		response.Error(c, http.StatusConflict, "Задача уже выполняется")
		return
	}

	h.lastManualRun[name] = time.Now()

	// Detached from the request: the operator should not have to hold the
	// connection open for a job that may run for minutes.
	go h.scheduler.Execute(context.WithoutCancel(c.Request.Context()), job)

	response.Success(c, http.StatusAccepted, gin.H{
		"job":     name,
		"started": true,
	})
}
