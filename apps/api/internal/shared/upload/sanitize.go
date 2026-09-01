package upload

import (
	"bytes"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
)

// jpegQuality for re-encoding. High enough that a progress photo does not
// visibly degrade.
const jpegQuality = 92

// Sanitize re-encodes an image, dropping everything that is not pixels.
//
// This removes EXIF, which matters more here than it might elsewhere: progress
// photos are pictures of someone's body taken at home, and EXIF routinely
// carries GPS coordinates. Some of the buckets are public.
//
// Re-encoding also proves the file really is the image it claims to be — a
// polyglot file that both parses as an image and executes as something else
// does not survive a decode/encode round trip.
//
// PDFs are passed through unchanged: they are not images, and re-encoding is
// not possible. They are accepted only as chat attachments and stored privately.
func Sanitize(data []byte, kind Kind) ([]byte, error) {
	if kind == KindPDF {
		return data, nil
	}

	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("не удалось прочитать изображение: %w", err)
	}

	var out bytes.Buffer
	switch kind {
	case KindJPEG:
		err = jpeg.Encode(&out, img, &jpeg.Options{Quality: jpegQuality})
	case KindPNG:
		err = png.Encode(&out, img)
	case KindGIF:
		// Only the first frame survives; animation is not needed for the
		// illustrations this accepts.
		err = gif.Encode(&out, img, nil)
	case KindWebP:
		// The standard library decodes WebP but cannot encode it. Storing PNG
		// keeps the file lossless and metadata-free; callers use the kind
		// returned here, not the one they detected.
		err = png.Encode(&out, img)
	default:
		return nil, fmt.Errorf("неподдерживаемый тип для обработки: %s", kind)
	}
	if err != nil {
		return nil, fmt.Errorf("не удалось сохранить изображение: %w", err)
	}

	return out.Bytes(), nil
}

// StoredKind reports the kind a sanitized file is stored as. WebP is re-encoded
// to PNG because the standard library has no WebP encoder.
func StoredKind(kind Kind) Kind {
	if kind == KindWebP {
		return KindPNG
	}
	return kind
}
