package upload

import (
	"fmt"
	"io"
	"mime/multipart"
)

// File is an accepted upload: validated, normalised, ready to store.
type File struct {
	// Data is the sanitized content. For images this is a re-encode, so it is
	// not byte-identical to what the client sent.
	Data []byte
	// Kind is what the bytes actually are, detected from content.
	Kind Kind
	// StoredKind is the type the file is saved as (WebP becomes PNG).
	StoredKind Kind
	// OriginalName is what the client called it. Kept only for display; it
	// never reaches the storage key.
	OriginalName string
	Size         int
}

// ContentType is the value to store the object under. It comes from the
// detected type, never from the client's header.
func (f File) ContentType() string { return string(f.StoredKind) }

// Receive reads, validates and normalises one uploaded file.
//
// The order matters: size first (cheapest), then detect the real type, then —
// for images — dimensions from the header before any decompression, and only
// then a full decode. Each step avoids doing expensive work on input the next
// step would reject anyway.
func Receive(header *multipart.FileHeader, allowed Allowed, maxBytes int64) (File, error) {
	if header.Size > maxBytes {
		return File{}, fmt.Errorf("файл больше %d МБ", maxBytes/(1024*1024))
	}

	src, err := header.Open()
	if err != nil {
		return File{}, fmt.Errorf("не удалось прочитать файл")
	}
	defer func() { _ = src.Close() }()

	// LimitReader guards against a header that understates the real size.
	data, err := io.ReadAll(io.LimitReader(src, maxBytes+1))
	if err != nil {
		return File{}, fmt.Errorf("не удалось прочитать файл")
	}
	if int64(len(data)) > maxBytes {
		return File{}, fmt.Errorf("файл больше %d МБ", maxBytes/(1024*1024))
	}

	kind, err := Check(data, allowed)
	if err != nil {
		return File{}, err
	}

	if kind != KindPDF {
		if _, err := ValidateImage(data); err != nil {
			return File{}, err
		}
	}

	clean, err := Sanitize(data, kind)
	if err != nil {
		return File{}, err
	}

	return File{
		Data:         clean,
		Kind:         kind,
		StoredKind:   StoredKind(kind),
		OriginalName: header.Filename,
		Size:         len(clean),
	}, nil
}
