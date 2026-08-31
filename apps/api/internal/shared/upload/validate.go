package upload

import (
	"bytes"
	"fmt"
	"image"

	// Registered for image.DecodeConfig so dimensions can be read without
	// decoding the whole image.
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"

	_ "golang.org/x/image/webp"
)

// Pixel limits.
//
// A byte-size limit alone does not protect against a decompression bomb: a
// heavily compressed 30000x30000 PNG is small on the wire and needs gigabytes
// to decode. DecodeConfig reads only the header, so these are checked before
// anything is decompressed.
const (
	MaxDimension = 8000
	MaxPixels    = 50_000_000
)

// Dimensions of a validated image.
type Dimensions struct {
	Width  int
	Height int
}

// ValidateImage confirms the bytes decode as an image and are within limits.
func ValidateImage(data []byte) (Dimensions, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return Dimensions{}, fmt.Errorf("файл не является корректным изображением")
	}

	if cfg.Width > MaxDimension || cfg.Height > MaxDimension {
		return Dimensions{}, fmt.Errorf(
			"размер изображения %dx%d превышает предел %d пикселей по стороне",
			cfg.Width, cfg.Height, MaxDimension)
	}
	if cfg.Width*cfg.Height > MaxPixels {
		return Dimensions{}, fmt.Errorf(
			"изображение %dx%d содержит слишком много пикселей (предел %d)",
			cfg.Width, cfg.Height, MaxPixels)
	}

	return Dimensions{Width: cfg.Width, Height: cfg.Height}, nil
}
