package upload

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// isoFile builds the first bytes of an ISO base media file: box size, "ftyp",
// the major brand, a version, then the compatible brands.
func isoFile(major string, compatible ...string) []byte {
	head := make([]byte, 0, 64)
	head = append(head, 0x00, 0x00, 0x00, 0x18)
	head = append(head, []byte("ftyp")...)
	head = append(head, []byte(major)...)
	head = append(head, 0x00, 0x00, 0x00, 0x00)
	for _, brand := range compatible {
		head = append(head, []byte(brand)...)
	}
	return append(head, make([]byte, 512-len(head))...)
}

// A photograph taken on an iPhone is HEIC, and Go's sniffer does not know the
// format: it comes back as application/octet-stream, which the endpoint refuses
// as "неподдерживаемый тип файла". That sentence, about a photograph the person
// took a minute ago, tells them nothing they can act on.
//
// Recognising HEIC changes nothing about what is accepted. It changes what the
// person is told.
func TestHEICIsRefusedWithSomethingActionable(t *testing.T) {
	for _, brand := range []string{"heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"} {
		t.Run(brand, func(t *testing.T) {
			_, err := Check(isoFile(brand), AllowedImages)
			require.Error(t, err)
			assert.True(t, errors.Is(err, ErrHEIC), "should be recognised as HEIC, got %v", err)
			assert.Contains(t, err.Error(), "iPhone", "the message must name where the file came from")
			assert.Contains(t, err.Error(), "галереи", "and say what to do instead")
			assert.NotContains(t, err.Error(), "неподдерживаемый тип файла",
				"the generic refusal must not survive alongside the specific one")
		})
	}
}

// The brand can sit in either the major-brand slot or among the compatible
// brands, so both have to be found.
func TestHEICBrandInCompatibleList(t *testing.T) {
	_, err := Check(isoFile("mp42", "isom", "heic"), AllowedImages)
	assert.True(t, errors.Is(err, ErrHEIC))
}

// An ISO base media file that is not a photograph must not be claimed as one.
// A video announced as "your iPhone photo" would send the person to the camera
// settings for a problem those settings do not cause.
func TestNonPhotoISOFilesAreNotClaimedAsHEIC(t *testing.T) {
	_, err := Check(isoFile("mp42", "isom", "avc1"), AllowedImages)
	require.Error(t, err)
	assert.False(t, errors.Is(err, ErrHEIC))
	assert.Contains(t, err.Error(), "допустимые форматы")
}

// The formats that are accepted must stay accepted: a sniffer change that broke
// ordinary uploads would be a far worse outcome than the message this fixes.
func TestOrdinaryPhotographsStillPass(t *testing.T) {
	jpeg := append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, make([]byte, 512)...)
	png := append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 512)...)
	webp := append([]byte("RIFF\x00\x00\x00\x00WEBPVP8 "), make([]byte, 512)...)

	for name, data := range map[string][]byte{"jpeg": jpeg, "png": png, "webp": webp} {
		t.Run(name, func(t *testing.T) {
			kind, err := Check(data, AllowedImages)
			require.NoError(t, err)
			assert.NotEmpty(t, kind)
		})
	}
}

// A file too short to hold an ftyp box must not crash the check.
func TestShortFilesDoNotPanic(t *testing.T) {
	for _, data := range [][]byte{{}, {0x00}, {0x00, 0x00, 0x00, 0x18, 'f', 't'}} {
		assert.NotPanics(t, func() { _, _ = Check(data, AllowedImages) })
	}
}
