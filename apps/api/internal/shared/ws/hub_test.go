package ws

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// Presence для пуша о сообщении чата: подключён, пока открыта хотя бы одна
// вкладка; после закрытия последней — нет.
func TestHubIsConnected(t *testing.T) {
	hub := NewHub()
	assert.False(t, hub.IsConnected(7))

	first, second := NewClient(hub, nil, 7), NewClient(hub, nil, 7)
	hub.Register(7, first)
	hub.Register(7, second)
	assert.True(t, hub.IsConnected(7))
	assert.False(t, hub.IsConnected(8), "чужое соединение не в счёт")

	hub.UnregisterClient(first)
	assert.True(t, hub.IsConnected(7), "вторая вкладка ещё открыта")
	hub.UnregisterClient(second)
	assert.False(t, hub.IsConnected(7))

	hub.Register(7, NewClient(hub, nil, 7))
	hub.Unregister(7)
	assert.False(t, hub.IsConnected(7))
}
