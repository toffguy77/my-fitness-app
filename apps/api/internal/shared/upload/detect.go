// Package upload validates and normalises files before they reach storage.
//
// Every upload endpoint previously trusted the Content-Type header the client
// sent, and stored the object under that type. An HTML file announced as
// image/png was therefore stored as HTML — and some buckets are served
// publicly. Nothing here trusts anything the client says about a file.
package upload

import (
	"fmt"
	"net/http"
	"strings"
)

// Kind is a file type this system accepts.
type Kind string

const (
	KindJPEG Kind = "image/jpeg"
	KindPNG  Kind = "image/png"
	KindWebP Kind = "image/webp"
	KindGIF  Kind = "image/gif"
	KindPDF  Kind = "application/pdf"
)

// Extension returns the filename extension for a kind. Used to build storage
// keys, so the extension always matches the detected content rather than
// whatever the client named the file.
func (k Kind) Extension() string {
	switch k {
	case KindJPEG:
		return ".jpg"
	case KindPNG:
		return ".png"
	case KindWebP:
		return ".webp"
	case KindGIF:
		return ".gif"
	case KindPDF:
		return ".pdf"
	}
	return ""
}

// Russian names used in messages shown to the user.
var kindNames = map[Kind]string{
	KindJPEG: "JPEG",
	KindPNG:  "PNG",
	KindWebP: "WebP",
	KindGIF:  "GIF",
	KindPDF:  "PDF",
}

// Allowed lists the kinds one upload endpoint accepts.
type Allowed []Kind

// Common allow-lists. They differ per endpoint on purpose: an avatar and a chat
// attachment carry different risk and different user expectations.
var (
	// AllowedImages covers profile photos, food photos and progress photos.
	AllowedImages = Allowed{KindJPEG, KindPNG, KindWebP}
	// AllowedContentMedia additionally permits GIF for article illustrations.
	AllowedContentMedia = Allowed{KindJPEG, KindPNG, KindWebP, KindGIF}
	// AllowedChatAttachments additionally permits PDF, which curators send.
	AllowedChatAttachments = Allowed{KindJPEG, KindPNG, KindWebP, KindPDF}
)

// Describe renders the allow-list for an error message.
func (a Allowed) Describe() string {
	names := make([]string, 0, len(a))
	for _, k := range a {
		names = append(names, kindNames[k])
	}
	return strings.Join(names, ", ")
}

func (a Allowed) contains(k Kind) bool {
	for _, allowed := range a {
		if allowed == k {
			return true
		}
	}
	return false
}

// sniffLength is how much of the file http.DetectContentType needs.
const sniffLength = 512

// Detect determines a file's kind from its bytes.
//
// The client's Content-Type header is not consulted at all: it is attacker
// controlled, and treating it as the truth is what let a file be stored under a
// type that did not match its contents.
func Detect(data []byte) (Kind, error) {
	if len(data) == 0 {
		return "", fmt.Errorf("файл пустой")
	}

	head := data
	if len(head) > sniffLength {
		head = head[:sniffLength]
	}

	// DetectContentType appends charset parameters for text types; take the
	// media type only.
	detected := http.DetectContentType(head)
	if idx := strings.IndexByte(detected, ';'); idx >= 0 {
		detected = detected[:idx]
	}

	switch Kind(detected) {
	case KindJPEG, KindPNG, KindWebP, KindGIF, KindPDF:
		return Kind(detected), nil
	}
	return "", fmt.Errorf("неподдерживаемый тип файла")
}

// Check detects the kind and confirms the endpoint accepts it.
func Check(data []byte, allowed Allowed) (Kind, error) {
	kind, err := Detect(data)
	if err != nil {
		return "", fmt.Errorf("%w: допустимые форматы — %s", err, allowed.Describe())
	}
	if !allowed.contains(kind) {
		return "", fmt.Errorf("файл в формате %s не принимается: допустимые форматы — %s",
			kindNames[kind], allowed.Describe())
	}
	return kind, nil
}
