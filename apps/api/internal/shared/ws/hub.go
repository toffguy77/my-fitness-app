package ws

import "sync"

// Hub maintains active WebSocket connections
type Hub struct {
	mu      sync.RWMutex
	clients map[int64]*Client // userID -> client
}

func NewHub() *Hub {
	return &Hub{clients: make(map[int64]*Client)}
}

func (h *Hub) Register(userID int64, client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	// Close existing connection for this user (if reconnecting)
	if existing, ok := h.clients[userID]; ok {
		existing.CloseSend()
	}
	h.clients[userID] = client
}

func (h *Hub) Unregister(userID int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if client, ok := h.clients[userID]; ok {
		client.CloseSend()
		delete(h.clients, userID)
	}
}

func (h *Hub) SendToUser(userID int64, event OutgoingEvent) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	client, ok := h.clients[userID]
	if !ok {
		return false
	}
	select {
	case client.send <- event:
		return true
	default:
		// Buffer full, drop message
		return false
	}
}
