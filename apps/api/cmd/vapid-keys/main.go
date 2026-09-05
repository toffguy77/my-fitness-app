// Command vapid-keys prints a fresh VAPID key pair.
//
// Run it yourself and paste the result into the environment; the pair is
// generated where you run it and never passes through anything else.
//
//	go run ./cmd/vapid-keys
//
// The pair is generated once and then left alone: changing the public key
// invalidates every existing subscription, and every browser has to be asked
// for permission again — which most people only grant once.
package main

import (
	"fmt"
	"os"

	webpush "github.com/SherClockHolmes/webpush-go"
)

func main() {
	private, public, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		fmt.Fprintln(os.Stderr, "could not generate a VAPID key pair:", err)
		os.Exit(1)
	}

	fmt.Println("VAPID_PUBLIC_KEY=" + public)
	fmt.Println("VAPID_PRIVATE_KEY=" + private)
	fmt.Println("VAPID_SUBJECT=mailto:support@burcev.team")
	fmt.Fprintln(os.Stderr)
	fmt.Fprintln(os.Stderr, "Впишите это в окружение dev и prod (в Dokploy).")
	fmt.Fprintln(os.Stderr, "Приватный ключ — секрет: в git он не попадает.")
}
