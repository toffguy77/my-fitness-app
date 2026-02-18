package dashboard

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// TestDocumentationNoCoachReferences validates Property 6: Отсутствие "coach" в документации
// For any markdown file in .kiro/ or docs/ directories, after refactoring
// the file should not contain "coach" or "тренер" (except historical references).
//
// Feature: coach-to-curator-refactoring
// Property 6: Отсутствие "coach" в документации
// **Validates: Requirements 4.1, 4.2, 4.3**
func TestDocumentationNoCoachReferences(t *testing.T) {
	// Skip if running in CI without access to project root
	projectRoot := findProjectRoot()
	if projectRoot == "" {
		t.Skip("Could not find project root")
	}

	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 1 // Single test that checks all files
	properties := gopter.NewProperties(parameters)

	properties.Property("documentation files should not contain 'coach' references", prop.ForAll(
		func(_ int) bool {
			// Directories to check
			dirs := []string{
				filepath.Join(projectRoot, ".kiro", "steering"),
				filepath.Join(projectRoot, ".kiro", "specs"),
			}

			// Patterns to search for (case-insensitive)
			coachPatterns := []*regexp.Regexp{
				regexp.MustCompile(`(?i)\bcoach\b`),
				regexp.MustCompile(`(?i)\bcoaches\b`),
				regexp.MustCompile(`(?i)\bcoaching\b`),
				regexp.MustCompile(`(?i)coach_id`),
				regexp.MustCompile(`(?i)coach_feedback`),
				regexp.MustCompile(`(?i)coach_client`),
			}

			// Files to exclude (historical references in refactoring spec)
			excludePatterns := []string{
				"coach-to-curator-refactoring",
			}

			violations := []string{}

			for _, dir := range dirs {
				if _, err := os.Stat(dir); os.IsNotExist(err) {
					continue
				}

				err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
					if err != nil {
						return nil // Skip files we can't access
					}

					if info.IsDir() {
						return nil
					}

					// Only check markdown files
					if !strings.HasSuffix(path, ".md") {
						return nil
					}

					// Skip excluded files
					for _, exclude := range excludePatterns {
						if strings.Contains(path, exclude) {
							return nil
						}
					}

					content, err := os.ReadFile(path)
					if err != nil {
						return nil
					}

					contentStr := string(content)

					// Check for coach patterns
					for _, pattern := range coachPatterns {
						if pattern.MatchString(contentStr) {
							relPath, _ := filepath.Rel(projectRoot, path)
							violations = append(violations, relPath+": contains '"+pattern.String()+"'")
							break
						}
					}

					return nil
				})

				if err != nil {
					t.Logf("Error walking directory %s: %v", dir, err)
				}
			}

			if len(violations) > 0 {
				t.Errorf("Found 'coach' references in documentation:\n%s", strings.Join(violations, "\n"))
				return false
			}

			return true
		},
		gopter.Gen(gen.Const(1)), // Dummy generator since we're checking all files
	))

	properties.TestingRun(t)
}

// findProjectRoot finds the project root by looking for go.mod
func findProjectRoot() string {
	// Start from current directory and go up
	dir, err := os.Getwd()
	if err != nil {
		return ""
	}

	for {
		// Check if we're in the api directory
		if filepath.Base(dir) == "api" {
			// Go up two levels to get to project root
			return filepath.Dir(filepath.Dir(dir))
		}

		// Check if .kiro exists (we're at project root)
		if _, err := os.Stat(filepath.Join(dir, ".kiro")); err == nil {
			return dir
		}

		// Go up one level
		parent := filepath.Dir(dir)
		if parent == dir {
			// Reached filesystem root
			return ""
		}
		dir = parent
	}
}
