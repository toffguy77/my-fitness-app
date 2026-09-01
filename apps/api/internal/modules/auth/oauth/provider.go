// Package oauth adapts external sign-in providers to one interface.
//
// The providers differ in the shape of their profile response and in which
// fields they return at all, but not in the flow. Keeping those differences in
// an adapter means adding a provider is a new file, not a change to
// authentication.
package oauth

import (
	"context"
	"fmt"
)

// Profile is what every adapter returns, whatever the provider actually sent.
type Profile struct {
	// ProviderUserID is the provider's own identifier. Identity is the pair
	// (provider, this) — never the email, which can change and is not unique
	// across providers.
	ProviderUserID string
	// Email may be empty: not every provider returns one, and some require
	// extra scopes for it. The caller then asks the user for an address.
	Email     string
	Name      string
	AvatarURL string
}

// Provider is one external sign-in service.
type Provider interface {
	// Name is the stable identifier stored with the link.
	Name() string
	// AuthorizationURL builds the URL the browser is sent to.
	AuthorizationURL(state, codeChallenge, redirectURI string) string
	// Exchange turns an authorization code into a normalised profile.
	Exchange(ctx context.Context, code, codeVerifier, redirectURI string) (*Profile, error)
}

// Registry holds the providers this deployment has credentials for.
type Registry struct {
	providers map[string]Provider
}

// NewRegistry creates an empty registry.
func NewRegistry() *Registry {
	return &Registry{providers: make(map[string]Provider)}
}

// Register adds a provider. A provider without credentials is simply not
// registered, which is how "this deployment does not offer it" is expressed.
func (r *Registry) Register(p Provider) {
	r.providers[p.Name()] = p
}

// Get returns a provider by name.
func (r *Registry) Get(name string) (Provider, error) {
	p, ok := r.providers[name]
	if !ok {
		return nil, fmt.Errorf("provider %q is not configured", name)
	}
	return p, nil
}

// Names lists the configured providers, for the sign-in screen.
func (r *Registry) Names() []string {
	names := make([]string, 0, len(r.providers))
	for name := range r.providers {
		names = append(names, name)
	}
	return names
}

// Enabled reports whether any provider is configured.
func (r *Registry) Enabled() bool { return len(r.providers) > 0 }
