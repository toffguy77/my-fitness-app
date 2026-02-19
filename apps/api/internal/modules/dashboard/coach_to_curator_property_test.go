package dashboard

import (
	"bufio"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/stretchr/testify/mock"
)

// Property 1: Отсутствие "coach" в Go-коде
// **Feature: coach-to-curator-refactoring, Property 1: Отсутствие "coach" в Go-коде**
// **Validates: Requirements 1.1, 1.3, 1.4, 1.5**
//
// Для любого Go-файла в директории apps/api/internal/modules/dashboard/,
// после рефакторинга файл не должен содержать строку "coach" в:
// - Именах переменных
// - Именах функций
// - Именах полей структур
// - JSON/DB тегах
// - Сообщениях об ошибках
//
// Исключения:
// - Файлы миграций
// - Исторические комментарии о миграции
// - Этот тестовый файл (coach_to_curator_property_test.go)

// GoFileInfo represents information about a Go source file
type GoFileInfo struct {
	Path    string
	Content string
	Lines   []string
}

// CoachReference represents a found "coach" reference in code
type CoachReference struct {
	Line       int
	Content    string
	RefType    string // "variable", "function", "field", "tag", "error", "comment"
	IsExcluded bool
}

// getGoFilesInDashboard returns all Go files in the dashboard module
func getGoFilesInDashboard() ([]GoFileInfo, error) {
	var files []GoFileInfo

	// Get the directory path relative to the test file
	dashboardDir := "."

	err := filepath.Walk(dashboardDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip directories
		if info.IsDir() {
			return nil
		}

		// Only process .go files
		if !strings.HasSuffix(path, ".go") {
			return nil
		}

		// Skip this test file itself and documentation property test file
		// (they intentionally contain "coach" references for testing purposes)
		if strings.Contains(path, "coach_to_curator_property_test.go") {
			return nil
		}
		if strings.Contains(path, "documentation_property_test.go") {
			return nil
		}

		// Read file content
		content, err := os.ReadFile(path)
		if err != nil {
			return err
		}

		// Split into lines
		var lines []string
		scanner := bufio.NewScanner(strings.NewReader(string(content)))
		for scanner.Scan() {
			lines = append(lines, scanner.Text())
		}

		files = append(files, GoFileInfo{
			Path:    path,
			Content: string(content),
			Lines:   lines,
		})

		return nil
	})

	return files, err
}

// findCoachReferences finds all "coach" references in a Go file
func findCoachReferences(file GoFileInfo) []CoachReference {
	var refs []CoachReference

	// Patterns to detect different types of "coach" references
	patterns := map[string]*regexp.Regexp{
		"variable": regexp.MustCompile(`(?i)\bcoach[A-Za-z0-9_]*\b`),
		"function": regexp.MustCompile(`(?i)func\s+\([^)]*\)\s+[A-Za-z]*[Cc]oach[A-Za-z]*\s*\(`),
		"field":    regexp.MustCompile(`(?i)[Cc]oach[A-Za-z0-9_]*\s+`),
		"tag":      regexp.MustCompile(`(?i)(json|db):"[^"]*coach[^"]*"`),
		"error":    regexp.MustCompile(`(?i)(fmt\.Errorf|errors\.New)\([^)]*coach[^)]*\)`),
		"string":   regexp.MustCompile(`(?i)"[^"]*coach[^"]*"`),
	}

	// Patterns for exclusions (migration comments, historical references)
	exclusionPatterns := []*regexp.Regexp{
		regexp.MustCompile(`(?i)//.*migration.*coach`),
		regexp.MustCompile(`(?i)//.*refactor.*coach.*curator`),
		regexp.MustCompile(`(?i)//.*renamed.*coach.*curator`),
		regexp.MustCompile(`(?i)//.*was.*coach`),
		regexp.MustCompile(`(?i)//.*previously.*coach`),
		regexp.MustCompile(`(?i)//.*legacy.*coach`),
	}

	for lineNum, line := range file.Lines {
		// Check if line is excluded (migration comment)
		isExcluded := false
		for _, excPattern := range exclusionPatterns {
			if excPattern.MatchString(line) {
				isExcluded = true
				break
			}
		}

		// Check each pattern
		for refType, pattern := range patterns {
			if pattern.MatchString(line) {
				refs = append(refs, CoachReference{
					Line:       lineNum + 1,
					Content:    strings.TrimSpace(line),
					RefType:    refType,
					IsExcluded: isExcluded,
				})
			}
		}
	}

	return refs
}

// TestNoCoachInGoCode_Property tests that Go files don't contain "coach" references
// **Feature: coach-to-curator-refactoring, Property 1: Отсутствие "coach" в Go-коде**
// **Validates: Requirements 1.1, 1.3, 1.4, 1.5**
func TestNoCoachInGoCode_Property(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Get all Go files in dashboard module
	files, err := getGoFilesInDashboard()
	if err != nil {
		t.Fatalf("Failed to get Go files: %v", err)
	}

	if len(files) == 0 {
		t.Skip("No Go files found in dashboard module")
	}

	// Property: For any Go file, there should be no non-excluded "coach" references
	properties.Property("Go files should not contain 'coach' references", prop.ForAll(
		func(fileIndex int) bool {
			// Ensure index is within bounds
			if fileIndex < 0 || fileIndex >= len(files) {
				return true // Skip invalid indices
			}

			file := files[fileIndex]
			refs := findCoachReferences(file)

			// Filter out excluded references
			var nonExcludedRefs []CoachReference
			for _, ref := range refs {
				if !ref.IsExcluded {
					nonExcludedRefs = append(nonExcludedRefs, ref)
				}
			}

			// Property: No non-excluded "coach" references should exist
			if len(nonExcludedRefs) > 0 {
				t.Logf("File %s contains 'coach' references:", file.Path)
				for _, ref := range nonExcludedRefs {
					t.Logf("  Line %d (%s): %s", ref.Line, ref.RefType, ref.Content)
				}
				return false
			}

			return true
		},
		// Generate file indices
		gen.IntRange(0, len(files)-1),
	))

	properties.TestingRun(t)
}

// TestNoCoachInVariableNames_Property tests that variable names don't contain "coach"
// **Feature: coach-to-curator-refactoring, Property 1: Отсутствие "coach" в Go-коде**
// **Validates: Requirements 1.1**
func TestNoCoachInVariableNames_Property(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	files, err := getGoFilesInDashboard()
	if err != nil {
		t.Fatalf("Failed to get Go files: %v", err)
	}

	if len(files) == 0 {
		t.Skip("No Go files found in dashboard module")
	}

	// Pattern for variable declarations with "coach"
	varPattern := regexp.MustCompile(`(?i)\b(var|const)?\s*coach[A-Za-z0-9_]*\s*(,|=|:=|\s+[A-Za-z])`)
	paramPattern := regexp.MustCompile(`(?i)coach[A-Za-z0-9_]*\s+(int64|string|bool|\*?[A-Z][A-Za-z0-9_]*)`)

	properties.Property("Variable names should not contain 'coach'", prop.ForAll(
		func(fileIndex int) bool {
			if fileIndex < 0 || fileIndex >= len(files) {
				return true
			}

			file := files[fileIndex]

			for lineNum, line := range file.Lines {
				// Skip comments
				trimmedLine := strings.TrimSpace(line)
				if strings.HasPrefix(trimmedLine, "//") {
					continue
				}

				if varPattern.MatchString(line) || paramPattern.MatchString(line) {
					t.Logf("File %s, Line %d: Variable with 'coach' found: %s",
						file.Path, lineNum+1, strings.TrimSpace(line))
					return false
				}
			}

			return true
		},
		gen.IntRange(0, len(files)-1),
	))

	properties.TestingRun(t)
}

// TestNoCoachInStructFields_Property tests that struct fields don't contain "coach"
// **Feature: coach-to-curator-refactoring, Property 1: Отсутствие "coach" в Go-коде**
// **Validates: Requirements 1.3**
func TestNoCoachInStructFields_Property(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	files, err := getGoFilesInDashboard()
	if err != nil {
		t.Fatalf("Failed to get Go files: %v", err)
	}

	if len(files) == 0 {
		t.Skip("No Go files found in dashboard module")
	}

	// Pattern for struct fields with "coach"
	fieldPattern := regexp.MustCompile(`(?i)^\s*[Cc]oach[A-Za-z0-9_]*\s+`)

	properties.Property("Struct fields should not contain 'coach'", prop.ForAll(
		func(fileIndex int) bool {
			if fileIndex < 0 || fileIndex >= len(files) {
				return true
			}

			file := files[fileIndex]
			inStruct := false

			for lineNum, line := range file.Lines {
				// Track struct blocks
				if strings.Contains(line, "type") && strings.Contains(line, "struct") {
					inStruct = true
					continue
				}
				if inStruct && strings.TrimSpace(line) == "}" {
					inStruct = false
					continue
				}

				// Check struct fields
				if inStruct && fieldPattern.MatchString(line) {
					t.Logf("File %s, Line %d: Struct field with 'coach' found: %s",
						file.Path, lineNum+1, strings.TrimSpace(line))
					return false
				}
			}

			return true
		},
		gen.IntRange(0, len(files)-1),
	))

	properties.TestingRun(t)
}

// TestNoCoachInJSONTags_Property tests that JSON/DB tags don't contain "coach"
// **Feature: coach-to-curator-refactoring, Property 1: Отсутствие "coach" в Go-коде**
// **Validates: Requirements 1.4**
func TestNoCoachInJSONTags_Property(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	files, err := getGoFilesInDashboard()
	if err != nil {
		t.Fatalf("Failed to get Go files: %v", err)
	}

	if len(files) == 0 {
		t.Skip("No Go files found in dashboard module")
	}

	// Pattern for JSON/DB tags with "coach"
	tagPattern := regexp.MustCompile(`(?i)(json|db):"[^"]*coach[^"]*"`)

	properties.Property("JSON/DB tags should not contain 'coach'", prop.ForAll(
		func(fileIndex int) bool {
			if fileIndex < 0 || fileIndex >= len(files) {
				return true
			}

			file := files[fileIndex]

			for lineNum, line := range file.Lines {
				if tagPattern.MatchString(line) {
					t.Logf("File %s, Line %d: Tag with 'coach' found: %s",
						file.Path, lineNum+1, strings.TrimSpace(line))
					return false
				}
			}

			return true
		},
		gen.IntRange(0, len(files)-1),
	))

	properties.TestingRun(t)
}

// TestNoCoachInErrorMessages_Property tests that error messages don't contain "coach"
// **Feature: coach-to-curator-refactoring, Property 1: Отсутствие "coach" в Go-коде**
// **Validates: Requirements 1.5**
func TestNoCoachInErrorMessages_Property(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	files, err := getGoFilesInDashboard()
	if err != nil {
		t.Fatalf("Failed to get Go files: %v", err)
	}

	if len(files) == 0 {
		t.Skip("No Go files found in dashboard module")
	}

	// Patterns for error messages with "coach"
	errorPatterns := []*regexp.Regexp{
		regexp.MustCompile(`(?i)fmt\.Errorf\([^)]*coach[^)]*\)`),
		regexp.MustCompile(`(?i)errors\.New\([^)]*coach[^)]*\)`),
		regexp.MustCompile(`(?i)return\s+nil,\s*fmt\.Errorf\([^)]*coach`),
	}

	properties.Property("Error messages should not contain 'coach'", prop.ForAll(
		func(fileIndex int) bool {
			if fileIndex < 0 || fileIndex >= len(files) {
				return true
			}

			file := files[fileIndex]

			for lineNum, line := range file.Lines {
				// Skip comments
				trimmedLine := strings.TrimSpace(line)
				if strings.HasPrefix(trimmedLine, "//") {
					continue
				}

				for _, pattern := range errorPatterns {
					if pattern.MatchString(line) {
						t.Logf("File %s, Line %d: Error message with 'coach' found: %s",
							file.Path, lineNum+1, strings.TrimSpace(line))
						return false
					}
				}
			}

			return true
		},
		gen.IntRange(0, len(files)-1),
	))

	properties.TestingRun(t)
}

// TestNoCoachInFunctionNames_Property tests that function names don't contain "coach"
// **Feature: coach-to-curator-refactoring, Property 1: Отсутствие "coach" в Go-коде**
// **Validates: Requirements 1.3**
func TestNoCoachInFunctionNames_Property(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	files, err := getGoFilesInDashboard()
	if err != nil {
		t.Fatalf("Failed to get Go files: %v", err)
	}

	if len(files) == 0 {
		t.Skip("No Go files found in dashboard module")
	}

	// Pattern for function declarations with "coach"
	funcPattern := regexp.MustCompile(`(?i)func\s+(\([^)]*\)\s+)?[A-Za-z]*[Cc]oach[A-Za-z]*\s*\(`)

	properties.Property("Function names should not contain 'coach'", prop.ForAll(
		func(fileIndex int) bool {
			if fileIndex < 0 || fileIndex >= len(files) {
				return true
			}

			file := files[fileIndex]

			for lineNum, line := range file.Lines {
				if funcPattern.MatchString(line) {
					t.Logf("File %s, Line %d: Function with 'coach' found: %s",
						file.Path, lineNum+1, strings.TrimSpace(line))
					return false
				}
			}

			return true
		},
		gen.IntRange(0, len(files)-1),
	))

	properties.TestingRun(t)
}

// TestAllFilesScanned_Property verifies that all expected Go files are scanned
// This is a meta-property to ensure the test coverage is complete
func TestAllFilesScanned_Property(t *testing.T) {
	files, err := getGoFilesInDashboard()
	if err != nil {
		t.Fatalf("Failed to get Go files: %v", err)
	}

	// Expected files in dashboard module (excluding this test file)
	expectedFiles := []string{
		"handler.go",
		"handler_test.go",
		"service.go",
		"types.go",
		"types_test.go",
		"properties_test.go",
		"report_properties_test.go",
		"notifications_test.go",
	}

	foundFiles := make(map[string]bool)
	for _, file := range files {
		baseName := filepath.Base(file.Path)
		foundFiles[baseName] = true
	}

	for _, expected := range expectedFiles {
		if !foundFiles[expected] {
			t.Logf("Warning: Expected file %s not found in scan", expected)
		}
	}

	t.Logf("Scanned %d Go files in dashboard module", len(files))
}

// Property 2: Корректность проверки роли curator
// **Feature: coach-to-curator-refactoring, Property 2: Корректность проверки роли curator**
// **Validates: Requirements 1.6**
//
// Для любого запроса к защищённому эндпоинту:
// - Если пользователь имеет роль "curator", система должна предоставить доступ
// - Если роль "coach" (старая роль) — система должна отклонить запрос
// - Если роль другая (client, admin, etc.) — система должна отклонить запрос

// RoleTestCase represents a test case for role-based access control
type RoleTestCase struct {
	Role            string
	ShouldBeAllowed bool
	Description     string
}

// generateDisallowedRoleTestCases returns role test cases that should be rejected
func generateDisallowedRoleTestCases() []RoleTestCase {
	return []RoleTestCase{
		// Old coach role should be rejected
		{Role: "coach", ShouldBeAllowed: false, Description: "old coach role should be rejected"},

		// Other roles should be rejected
		{Role: "client", ShouldBeAllowed: false, Description: "client role should be rejected"},
		{Role: "admin", ShouldBeAllowed: false, Description: "admin role should be rejected"},
		{Role: "user", ShouldBeAllowed: false, Description: "user role should be rejected"},
		{Role: "", ShouldBeAllowed: false, Description: "empty role should be rejected"},
		{Role: "CURATOR", ShouldBeAllowed: false, Description: "uppercase CURATOR should be rejected (case-sensitive)"},
		{Role: "Curator", ShouldBeAllowed: false, Description: "mixed case Curator should be rejected (case-sensitive)"},
	}
}

// TestCuratorRoleAccess_CreateWeeklyPlan_Property tests role-based access for CreateWeeklyPlan
// **Feature: coach-to-curator-refactoring, Property 2: Корректность проверки роли curator**
// **Validates: Requirements 1.6**
func TestCuratorRoleAccess_CreateWeeklyPlan_Property(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	testCases := generateDisallowedRoleTestCases()

	properties.Property("CreateWeeklyPlan: disallowed roles should be rejected with 403", prop.ForAll(
		func(caseIndex int) bool {
			if caseIndex < 0 || caseIndex >= len(testCases) {
				return true
			}

			tc := testCases[caseIndex]

			// Setup test handler
			gin.SetMode(gin.TestMode)
			handler, _ := setupTestHandlerWithMock()

			// Create test router
			router := gin.New()
			router.POST("/weekly-plan", func(c *gin.Context) {
				c.Set("user_id", int64(1))
				if tc.Role != "" {
					c.Set("user_role", tc.Role)
				}
				handler.CreateWeeklyPlan(c)
			})

			// Create valid request body
			reqBody := CreateWeeklyPlanRequest{
				UserID:       2,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
			}
			body, _ := json.Marshal(reqBody)

			// Make request
			req := httptest.NewRequest(http.MethodPost, "/weekly-plan", bytes.NewBuffer(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// For disallowed roles, we expect forbidden (403)
			if w.Code != http.StatusForbidden {
				t.Logf("FAIL: Role '%s' got status %d but should be forbidden (403)", tc.Role, w.Code)
				return false
			}
			return true
		},
		gen.IntRange(0, len(testCases)-1),
	))

	properties.TestingRun(t)
}

// TestCuratorRoleAccess_CreateTask_Property tests role-based access for CreateTask
// **Feature: coach-to-curator-refactoring, Property 2: Корректность проверки роли curator**
// **Validates: Requirements 1.6**
func TestCuratorRoleAccess_CreateTask_Property(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	testCases := generateDisallowedRoleTestCases()

	properties.Property("CreateTask: disallowed roles should be rejected with 403", prop.ForAll(
		func(caseIndex int) bool {
			if caseIndex < 0 || caseIndex >= len(testCases) {
				return true
			}

			tc := testCases[caseIndex]

			// Setup test handler
			gin.SetMode(gin.TestMode)
			handler, _ := setupTestHandlerWithMock()

			// Create test router
			router := gin.New()
			router.POST("/tasks", func(c *gin.Context) {
				c.Set("user_id", int64(1))
				if tc.Role != "" {
					c.Set("user_role", tc.Role)
				}
				handler.CreateTask(c)
			})

			// Create valid request body
			reqBody := CreateTaskRequest{
				UserID:     2,
				Title:      "Test Task",
				WeekNumber: 1,
				DueDate:    time.Now().AddDate(0, 0, 7),
			}
			body, _ := json.Marshal(reqBody)

			// Make request
			req := httptest.NewRequest(http.MethodPost, "/tasks", bytes.NewBuffer(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// For disallowed roles, we expect forbidden (403)
			if w.Code != http.StatusForbidden {
				t.Logf("FAIL: Role '%s' got status %d but should be forbidden (403)", tc.Role, w.Code)
				return false
			}
			return true
		},
		gen.IntRange(0, len(testCases)-1),
	))

	properties.TestingRun(t)
}

// TestCuratorRoleRejection_OldCoachRole_Property specifically tests that old "coach" role is rejected
// **Feature: coach-to-curator-refactoring, Property 2: Корректность проверки роли curator**
// **Validates: Requirements 1.6**
func TestCuratorRoleRejection_OldCoachRole_Property(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Endpoints that require curator role
	endpoints := []struct {
		Name    string
		Method  string
		Path    string
		Handler func(*Handler) gin.HandlerFunc
		Body    interface{}
	}{
		{
			Name:   "CreateWeeklyPlan",
			Method: http.MethodPost,
			Path:   "/weekly-plan",
			Handler: func(h *Handler) gin.HandlerFunc {
				return h.CreateWeeklyPlan
			},
			Body: CreateWeeklyPlanRequest{
				UserID:       2,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
			},
		},
		{
			Name:   "CreateTask",
			Method: http.MethodPost,
			Path:   "/tasks",
			Handler: func(h *Handler) gin.HandlerFunc {
				return h.CreateTask
			},
			Body: CreateTaskRequest{
				UserID:     2,
				Title:      "Test Task",
				WeekNumber: 1,
				DueDate:    time.Now().AddDate(0, 0, 7),
			},
		},
	}

	properties.Property("Old 'coach' role should be rejected on all curator-only endpoints", prop.ForAll(
		func(endpointIndex int) bool {
			if endpointIndex < 0 || endpointIndex >= len(endpoints) {
				return true
			}

			ep := endpoints[endpointIndex]

			// Setup test handler
			gin.SetMode(gin.TestMode)
			handler, _ := setupTestHandlerWithMock()

			// Create test router with OLD "coach" role
			router := gin.New()
			router.Handle(ep.Method, ep.Path, func(c *gin.Context) {
				c.Set("user_id", int64(1))
				c.Set("user_role", "coach") // OLD role that should be rejected
				ep.Handler(handler)(c)
			})

			// Create request body
			body, _ := json.Marshal(ep.Body)

			// Make request
			req := httptest.NewRequest(ep.Method, ep.Path, bytes.NewBuffer(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Old "coach" role should be forbidden
			if w.Code != http.StatusForbidden {
				t.Logf("FAIL: Endpoint %s with old 'coach' role got status %d but should be forbidden (403)",
					ep.Name, w.Code)
				return false
			}

			return true
		},
		gen.IntRange(0, len(endpoints)-1),
	))

	properties.TestingRun(t)
}

// TestCuratorRoleAccess_RandomRoles_Property tests with randomly generated role strings
// **Feature: coach-to-curator-refactoring, Property 2: Корректность проверки роли curator**
// **Validates: Requirements 1.6**
func TestCuratorRoleAccess_RandomRoles_Property(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Test that non-curator roles are rejected
	properties.Property("Non-curator roles should be rejected with 403", prop.ForAll(
		func(role string) bool {
			// Setup test handler
			gin.SetMode(gin.TestMode)
			handler, _ := setupTestHandlerWithMock()

			// Create test router
			router := gin.New()
			router.POST("/weekly-plan", func(c *gin.Context) {
				c.Set("user_id", int64(1))
				c.Set("user_role", role)
				handler.CreateWeeklyPlan(c)
			})

			// Create valid request body
			reqBody := CreateWeeklyPlanRequest{
				UserID:       2,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
			}
			body, _ := json.Marshal(reqBody)

			// Make request
			req := httptest.NewRequest(http.MethodPost, "/weekly-plan", bytes.NewBuffer(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// All these roles should be forbidden (none of them is exactly "curator")
			if w.Code != http.StatusForbidden {
				t.Logf("FAIL: Role '%s' got status %d but should be forbidden (403)", role, w.Code)
				return false
			}

			return true
		},
		// Generate various role strings that are NOT "curator" (edge cases)
		gen.OneConstOf(
			"coach",     // old role
			"client",    // other role
			"admin",     // other role
			"CURATOR",   // uppercase (case-sensitive check)
			"Curator",   // mixed case (case-sensitive check)
			"curator ",  // trailing space
			" curator",  // leading space
			"curator\n", // newline
			"curator\t", // tab
			"",          // empty
			"curators",  // plural
			"cur",       // partial
			"curatorx",  // extra char
		),
	))

	properties.TestingRun(t)
}

// TestCuratorRoleAccess_NoRoleSet_Property tests behavior when no role is set
// **Feature: coach-to-curator-refactoring, Property 2: Корректность проверки роли curator**
// **Validates: Requirements 1.6**
func TestCuratorRoleAccess_NoRoleSet_Property(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	properties.Property("Missing role should result in forbidden access", prop.ForAll(
		func(userID int64) bool {
			// Setup test handler
			gin.SetMode(gin.TestMode)
			handler, _ := setupTestHandlerWithMock()

			// Create test router WITHOUT setting user_role
			router := gin.New()
			router.POST("/weekly-plan", func(c *gin.Context) {
				c.Set("user_id", userID)
				// Note: NOT setting user_role
				handler.CreateWeeklyPlan(c)
			})

			// Create valid request body
			reqBody := CreateWeeklyPlanRequest{
				UserID:       2,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
			}
			body, _ := json.Marshal(reqBody)

			// Make request
			req := httptest.NewRequest(http.MethodPost, "/weekly-plan", bytes.NewBuffer(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Missing role should be forbidden
			if w.Code != http.StatusForbidden {
				t.Logf("FAIL: Missing role got status %d but should be forbidden (403)", w.Code)
				return false
			}

			return true
		},
		gen.Int64Range(1, 1000000),
	))

	properties.TestingRun(t)
}

// TestCuratorRoleAccess_CuratorAllowed_Property tests that "curator" role IS allowed
// **Feature: coach-to-curator-refactoring, Property 2: Корректность проверки роли curator**
// **Validates: Requirements 1.6**
func TestCuratorRoleAccess_CuratorAllowed_Property(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	properties.Property("Curator role should pass role check (not return 403)", prop.ForAll(
		func(curatorID int64) bool {
			// Setup test handler with mock
			gin.SetMode(gin.TestMode)
			handler, mockService := setupTestHandlerWithMock()

			// Setup mock to return a plan (so we can verify the role check passed)
			mockService.On("CreatePlan", mock.Anything, curatorID, int64(2), mock.AnythingOfType("*dashboard.WeeklyPlan")).
				Return(&WeeklyPlan{
					ID:           "test-plan-id",
					UserID:       2,
					CuratorID:    curatorID,
					CaloriesGoal: 2000,
					ProteinGoal:  150,
					IsActive:     true,
				}, nil)

			// Create test router with "curator" role
			router := gin.New()
			router.POST("/weekly-plan", func(c *gin.Context) {
				c.Set("user_id", curatorID)
				c.Set("user_role", "curator") // Correct role
				handler.CreateWeeklyPlan(c)
			})

			// Create valid request body
			reqBody := CreateWeeklyPlanRequest{
				UserID:       2,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
			}
			body, _ := json.Marshal(reqBody)

			// Make request
			req := httptest.NewRequest(http.MethodPost, "/weekly-plan", bytes.NewBuffer(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Curator role should NOT be forbidden (should pass role check)
			// We expect either 201 (success) or 400 (service error), but NOT 403
			if w.Code == http.StatusForbidden {
				t.Logf("FAIL: Curator role was forbidden but should be allowed")
				return false
			}

			// Verify the mock was called (meaning role check passed)
			mockService.AssertExpectations(t)

			return true
		},
		gen.Int64Range(1, 1000000),
	))

	properties.TestingRun(t)
}

// TestCuratorRoleAccess_CreateTaskCuratorAllowed_Property tests that "curator" role IS allowed for CreateTask
// **Feature: coach-to-curator-refactoring, Property 2: Корректность проверки роли curator**
// **Validates: Requirements 1.6**
func TestCuratorRoleAccess_CreateTaskCuratorAllowed_Property(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	properties.Property("Curator role should pass role check for CreateTask (not return 403)", prop.ForAll(
		func(curatorID int64) bool {
			// Setup test handler with mock
			gin.SetMode(gin.TestMode)
			handler, mockService := setupTestHandlerWithMock()

			// Setup mock to return a task (so we can verify the role check passed)
			mockService.On("CreateTask", mock.Anything, curatorID, int64(2), mock.AnythingOfType("*dashboard.Task")).
				Return(&Task{
					ID:         "test-task-id",
					UserID:     2,
					CuratorID:  curatorID,
					Title:      "Test Task",
					WeekNumber: 1,
					Status:     TaskStatusActive,
				}, nil)

			// Create test router with "curator" role
			router := gin.New()
			router.POST("/tasks", func(c *gin.Context) {
				c.Set("user_id", curatorID)
				c.Set("user_role", "curator") // Correct role
				handler.CreateTask(c)
			})

			// Create valid request body
			reqBody := CreateTaskRequest{
				UserID:     2,
				Title:      "Test Task",
				WeekNumber: 1,
				DueDate:    time.Now().AddDate(0, 0, 7),
			}
			body, _ := json.Marshal(reqBody)

			// Make request
			req := httptest.NewRequest(http.MethodPost, "/tasks", bytes.NewBuffer(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Curator role should NOT be forbidden (should pass role check)
			// We expect either 201 (success) or 400 (service error), but NOT 403
			if w.Code == http.StatusForbidden {
				t.Logf("FAIL: Curator role was forbidden but should be allowed for CreateTask")
				return false
			}

			// Verify the mock was called (meaning role check passed)
			mockService.AssertExpectations(t)

			return true
		},
		gen.Int64Range(1, 1000000),
	))

	properties.TestingRun(t)
}

// Property 7: Корректность JSON API
// **Feature: coach-to-curator-refactoring, Property 7: Корректность JSON API**
// **Validates: Requirements 6.1, 6.2**
//
// Для любого API-ответа, содержащего информацию о кураторе,
// JSON должен содержать поле "curator_id" вместо "coach_id".

// TestAPIResponse_CuratorID_Property tests that API responses use curator_id instead of coach_id
// **Feature: coach-to-curator-refactoring, Property 7: Корректность JSON API**
// **Validates: Requirements 6.1, 6.2**
func TestAPIResponse_CuratorID_Property(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Test WeeklyPlan JSON serialization
	properties.Property("WeeklyPlan JSON should contain curator_id, not coach_id", prop.ForAll(
		func(curatorID int64) bool {
			plan := WeeklyPlan{
				ID:           "test-plan-id",
				UserID:       1,
				CuratorID:    curatorID,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				IsActive:     true,
			}

			// Serialize to JSON
			jsonBytes, err := json.Marshal(plan)
			if err != nil {
				t.Logf("Failed to marshal WeeklyPlan: %v", err)
				return false
			}

			jsonStr := string(jsonBytes)

			// Check that curator_id is present
			if !strings.Contains(jsonStr, `"curator_id"`) {
				t.Logf("WeeklyPlan JSON does not contain 'curator_id': %s", jsonStr)
				return false
			}

			// Check that coach_id is NOT present
			if strings.Contains(jsonStr, `"coach_id"`) {
				t.Logf("WeeklyPlan JSON contains 'coach_id' (should be curator_id): %s", jsonStr)
				return false
			}

			return true
		},
		gen.Int64Range(1, 1000000),
	))

	properties.TestingRun(t)
}

// TestAPIResponse_Task_CuratorID_Property tests that Task API responses use curator_id
// **Feature: coach-to-curator-refactoring, Property 7: Корректность JSON API**
// **Validates: Requirements 6.1, 6.2**
func TestAPIResponse_Task_CuratorID_Property(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	properties.Property("Task JSON should contain curator_id, not coach_id", prop.ForAll(
		func(curatorID int64) bool {
			task := Task{
				ID:         "test-task-id",
				UserID:     1,
				CuratorID:  curatorID,
				Title:      "Test Task",
				WeekNumber: 1,
				Status:     TaskStatusActive,
			}

			// Serialize to JSON
			jsonBytes, err := json.Marshal(task)
			if err != nil {
				t.Logf("Failed to marshal Task: %v", err)
				return false
			}

			jsonStr := string(jsonBytes)

			// Check that curator_id is present
			if !strings.Contains(jsonStr, `"curator_id"`) {
				t.Logf("Task JSON does not contain 'curator_id': %s", jsonStr)
				return false
			}

			// Check that coach_id is NOT present
			if strings.Contains(jsonStr, `"coach_id"`) {
				t.Logf("Task JSON contains 'coach_id' (should be curator_id): %s", jsonStr)
				return false
			}

			return true
		},
		gen.Int64Range(1, 1000000),
	))

	properties.TestingRun(t)
}

// TestAPIResponse_WeeklyReport_CuratorID_Property tests that WeeklyReport API responses use curator_id and curator_feedback
// **Feature: coach-to-curator-refactoring, Property 7: Корректность JSON API**
// **Validates: Requirements 6.1, 6.2**
func TestAPIResponse_WeeklyReport_CuratorID_Property(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	properties.Property("WeeklyReport JSON should contain curator_id and curator_feedback, not coach_*", prop.ForAll(
		func(curatorID int64) bool {
			feedback := "Great progress!"
			report := WeeklyReport{
				ID:              "test-report-id",
				UserID:          1,
				CuratorID:       curatorID,
				WeekNumber:      1,
				Summary:         "Test Summary",
				CuratorFeedback: &feedback,
			}

			// Serialize to JSON
			jsonBytes, err := json.Marshal(report)
			if err != nil {
				t.Logf("Failed to marshal WeeklyReport: %v", err)
				return false
			}

			jsonStr := string(jsonBytes)

			// Check that curator_id is present
			if !strings.Contains(jsonStr, `"curator_id"`) {
				t.Logf("WeeklyReport JSON does not contain 'curator_id': %s", jsonStr)
				return false
			}

			// Check that curator_feedback is present
			if !strings.Contains(jsonStr, `"curator_feedback"`) {
				t.Logf("WeeklyReport JSON does not contain 'curator_feedback': %s", jsonStr)
				return false
			}

			// Check that coach_id is NOT present
			if strings.Contains(jsonStr, `"coach_id"`) {
				t.Logf("WeeklyReport JSON contains 'coach_id' (should be curator_id): %s", jsonStr)
				return false
			}

			// Check that coach_feedback is NOT present
			if strings.Contains(jsonStr, `"coach_feedback"`) {
				t.Logf("WeeklyReport JSON contains 'coach_feedback' (should be curator_feedback): %s", jsonStr)
				return false
			}

			return true
		},
		gen.Int64Range(1, 1000000),
	))

	properties.TestingRun(t)
}

// TestAPIResponse_AllStructures_NoCoachinJSON_Property tests all structures for absence of coach in JSON
// **Feature: coach-to-curator-refactoring, Property 7: Корректность JSON API**
// **Validates: Requirements 6.1, 6.2**
func TestAPIResponse_AllStructures_NoCoachinJSON_Property(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	feedback := "Great progress!"

	// Test all structures that might contain curator-related fields
	structures := []interface{}{
		WeeklyPlan{
			ID:           "test-plan-id",
			UserID:       1,
			CuratorID:    100,
			CaloriesGoal: 2000,
			ProteinGoal:  150,
			IsActive:     true,
		},
		Task{
			ID:         "test-task-id",
			UserID:     1,
			CuratorID:  100,
			Title:      "Test Task",
			WeekNumber: 1,
			Status:     TaskStatusActive,
		},
		WeeklyReport{
			ID:              "test-report-id",
			UserID:          1,
			CuratorID:       100,
			WeekNumber:      1,
			Summary:         "Test Summary",
			CuratorFeedback: &feedback,
		},
	}

	properties.Property("All structures should use curator_* in JSON, not coach_*", prop.ForAll(
		func(structIndex int) bool {
			if structIndex < 0 || structIndex >= len(structures) {
				return true
			}

			structure := structures[structIndex]

			// Serialize to JSON
			jsonBytes, err := json.Marshal(structure)
			if err != nil {
				t.Logf("Failed to marshal structure: %v", err)
				return false
			}

			jsonStr := string(jsonBytes)

			// Check that coach_* is NOT present
			if strings.Contains(jsonStr, `"coach_`) {
				t.Logf("Structure JSON contains 'coach_*' field: %s", jsonStr)
				return false
			}

			return true
		},
		gen.IntRange(0, len(structures)-1),
	))

	properties.TestingRun(t)
}
