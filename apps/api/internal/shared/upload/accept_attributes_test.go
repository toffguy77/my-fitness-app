package upload

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

// webRoot is the frontend source, from this package.
func webRoot() string {
	return filepath.Join("..", "..", "..", "..", "..", "apps", "web", "src")
}

var acceptAttribute = regexp.MustCompile(`accept="([^"]*)"`)

// A file chooser that offers more than the server accepts produces the worst
// kind of refusal: the person picked a file the application itself showed them
// as valid, and got told it is not.
//
// On iOS this is not hypothetical. accept="image/*" lets the Files app hand
// over a HEIC photograph; a narrower list makes the same picker filter it out,
// and the photo library transcodes to JPEG on the way. The narrow list prevents
// the problem where the error message can only explain it.
func TestFileChoosersOfferNoMoreThanTheServerAccepts(t *testing.T) {
	served := map[string]bool{}
	for _, k := range AllowedContentMedia { // the widest image list in use
		served[string(k)] = true
	}

	var offences []string
	require.NoError(t, filepath.Walk(webRoot(), func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".tsx") {
			return err
		}
		body, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, m := range acceptAttribute.FindAllStringSubmatch(string(body), -1) {
			for _, item := range strings.Split(m[1], ",") {
				item = strings.TrimSpace(item)
				// Extension-based accepts and non-image types are the concern of
				// the endpoint that handles them, not of this list.
				if item == "" || !strings.HasPrefix(item, "image/") {
					continue
				}
				if item == "image/*" {
					offences = append(offences, path+`: accept="image/*"`)
					continue
				}
				if !served[item] {
					offences = append(offences, path+": "+item)
				}
			}
		}
		return nil
	}))

	sort.Strings(offences)
	assert.Empty(t, offences,
		"these choosers offer image types the server refuses: %v", offences)
}
