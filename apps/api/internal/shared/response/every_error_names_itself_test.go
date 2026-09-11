package response

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// An error response without a code leaves the client one option: show the
// server's Russian sentence. That sentence is the one piece of text nobody can
// translate, so a single such response is enough to make a second language
// impossible on that path — and nothing about it looks broken.
//
// Every error must therefore go through this package, which derives a code from
// the status when the caller does not name one. This walks the source looking
// for the ones that do not.
func TestNoHandlerAnswersAnErrorWithoutACode(t *testing.T) {
	// c.JSON / c.AbortWithStatusJSON with a 4xx or 5xx constant.
	direct := regexp.MustCompile(
		`c\.(?:JSON|AbortWithStatusJSON)\(\s*http\.Status(BadRequest|Unauthorized|PaymentRequired|Forbidden|NotFound|MethodNotAllowed|Conflict|Gone|UnsupportedMediaType|UnprocessableEntity|TooManyRequests|InternalServerError|NotImplemented|BadGateway|ServiceUnavailable|GatewayTimeout)`)

	var offences []string
	root := filepath.Join("..", "..", "..", "internal")
	require.NoError(t, filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return err
		}
		body, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		lines := strings.Split(string(body), "\n")
		for i, line := range lines {
			if !direct.MatchString(line) {
				continue
			}
			// The exemption is written above the line, in the same style the
			// rest of the repository uses for deliberate departures.
			exempt := false
			for j := i - 3; j <= i; j++ {
				if j >= 0 && j < len(lines) && strings.Contains(lines[j], "error-code-exempt") {
					exempt = true
				}
			}
			// The panic handler writes the shape by hand precisely because it
			// must not depend on anything that could itself fail.
			if strings.Contains(line, "AbortWithStatusJSON") &&
				containsWithin(lines, i, 4, "apperrors.CodeInternal") {
				exempt = true
			}
			if !exempt {
				offences = append(offences, filepathRel(path)+":"+itoa(i+1))
			}
		}
		return nil
	}))

	sort.Strings(offences)
	assert.Empty(t, offences,
		"these answer an error without a machine-readable code — use response.Error or "+
			"response.ErrorCode, or mark the line \"error-code-exempt\" with a reason: %v", offences)
}

// containsWithin reports whether needle appears within n lines after i.
func containsWithin(lines []string, i, n int, needle string) bool {
	for j := i; j < i+n && j < len(lines); j++ {
		if strings.Contains(lines[j], needle) {
			return true
		}
	}
	return false
}

func filepathRel(path string) string {
	return strings.TrimPrefix(filepath.ToSlash(path), "../../../")
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}

// Whatever the status, the body must carry a code: the client decides what to
// say, and it can only decide from something it can compare.
func TestEveryStatusYieldsACode(t *testing.T) {
	for _, status := range []int{400, 401, 403, 404, 409, 410, 415, 429, 500, 502, 503, 599} {
		assert.NotEmpty(t, codeForStatus(status), "status %d produced no code", status)
	}
}
