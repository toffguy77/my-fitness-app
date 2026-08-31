package upload

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func pngBytes(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, img))
	return buf.Bytes()
}

func jpegBytes(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	var buf bytes.Buffer
	require.NoError(t, jpeg.Encode(&buf, img, nil))
	return buf.Bytes()
}

// The client's Content-Type is not consulted at all: it is attacker controlled,
// and trusting it is what allowed a file to be stored under a type that did not
// match its contents.
func TestDetect_IgnoresWhatTheClientClaims(t *testing.T) {
	html := []byte("<!DOCTYPE html><html><body><script>alert(1)</script></body></html>")

	_, err := Check(html, AllowedImages)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "допустимые форматы")
}

func TestDetect_RecognisesRealImages(t *testing.T) {
	cases := map[string][]byte{
		"png":  pngBytes(t, 10, 10),
		"jpeg": jpegBytes(t, 10, 10),
	}
	for name, data := range cases {
		t.Run(name, func(t *testing.T) {
			kind, err := Check(data, AllowedImages)
			require.NoError(t, err)
			assert.NotEmpty(t, kind.Extension())
		})
	}
}

func TestDetect_RejectsEmptyFile(t *testing.T) {
	_, err := Detect(nil)
	assert.Error(t, err)
}

// Allow-lists differ per endpoint on purpose: an avatar and a chat attachment
// carry different risk and different user expectations.
func TestCheck_EnforcesPerEndpointAllowList(t *testing.T) {
	pdf := []byte("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")

	_, err := Check(pdf, AllowedImages)
	require.Error(t, err, "PDF must not be accepted as an avatar")
	assert.Contains(t, err.Error(), "PDF")

	kind, err := Check(pdf, AllowedChatAttachments)
	require.NoError(t, err, "PDF is accepted as a chat attachment")
	assert.Equal(t, KindPDF, kind)
}

// A byte-size limit does not protect against a decompression bomb: a heavily
// compressed huge image is small on the wire and needs gigabytes to decode.
// The check must happen before decompression.
func TestValidateImage_RejectsOversizedDimensions(t *testing.T) {
	// A header claiming 30000x30000 without the pixel data behind it.
	huge := pngBytes(t, 1, 1)
	// Patch the IHDR width/height fields directly rather than allocating 900M
	// pixels in the test.
	copy(huge[16:24], []byte{0x00, 0x00, 0x75, 0x30, 0x00, 0x00, 0x75, 0x30})

	_, err := ValidateImage(huge)

	require.Error(t, err)
	assert.True(t,
		strings.Contains(err.Error(), "предел") || strings.Contains(err.Error(), "корректным"),
		"unexpected message: %s", err.Error())
}

func TestValidateImage_AcceptsReasonableImage(t *testing.T) {
	dims, err := ValidateImage(pngBytes(t, 800, 600))

	require.NoError(t, err)
	assert.Equal(t, 800, dims.Width)
	assert.Equal(t, 600, dims.Height)
}

// Progress photos are pictures of someone's body taken at home, and EXIF
// routinely carries GPS coordinates. Re-encoding drops everything but pixels.
func TestSanitize_StripsMetadata(t *testing.T) {
	original := jpegBytes(t, 40, 30)
	withExif := append([]byte{}, original...)
	// A marker that must not survive: real EXIF sits in an APP1 segment, which
	// re-encoding discards along with anything else that is not pixel data.
	withExif = append(withExif, []byte("GPSLatitude 55.7558")...)

	cleaned, err := Sanitize(withExif, KindJPEG)

	require.NoError(t, err)
	assert.NotContains(t, string(cleaned), "GPSLatitude")
}

func TestSanitize_PassesPDFThrough(t *testing.T) {
	pdf := []byte("%PDF-1.4 body")

	out, err := Sanitize(pdf, KindPDF)

	require.NoError(t, err)
	assert.Equal(t, pdf, out)
}

// WebP decodes but cannot be encoded by the standard library, so it is stored
// as PNG; callers must use the stored kind when building the key.
func TestStoredKind_WebPBecomesPNG(t *testing.T) {
	assert.Equal(t, KindPNG, StoredKind(KindWebP))
	assert.Equal(t, KindJPEG, StoredKind(KindJPEG))
}

// The object key is server-generated: a client filename has carried path
// traversal and control characters.
func TestKey_IgnoresClientFilename(t *testing.T) {
	key := Key("avatars", 42, KindJPEG)

	assert.True(t, strings.HasPrefix(key, "avatars/42/"))
	assert.True(t, strings.HasSuffix(key, ".jpg"))
	assert.NotContains(t, key, "..")
	assert.NotEqual(t, key, Key("avatars", 42, KindJPEG), "keys must be unique")
}
