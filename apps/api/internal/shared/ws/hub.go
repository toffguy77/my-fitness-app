package ws

import "sync"

// Hub maintains active WebSocket connections
type Hub struct {
	mu      sync.RWMutex
	clients map[int64][]*Client // userID -> clients (multiple tabs)
}

func NewHub() *Hub {
	return &Hub{clients: make(map[int64][]*Client)}
}

func (h *Hub) Register(userID int64, client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[userID] = append(h.clients[userID], client)
}

// UnregisterClient removes a specific client connection (e.g. one tab closed).
func (h *Hub) UnregisterClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	clients := h.clients[client.userID]
	for i, c := range clients {
		if c == client {
			h.clients[client.userID] = append(clients[:i], clients[i+1:]...)
			break
		}
	}
	if len(h.clients[client.userID]) == 0 {
		delete(h.clients, client.userID)
	}
	client.CloseSend()
}

// Unregister closes ALL connections for a user (force-disconnect).
func (h *Hub) Unregister(userID int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, client := range h.clients[userID] {
		client.CloseSend()
	}
	delete(h.clients, userID)
}

func (h *Hub) SendToUser(userID int64, event OutgoingEvent) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	clients, ok := h.clients[userID]
	if !ok {
		return false
	}
	sent := false
	for _, client := range clients {
		select {
		case client.send <- event:
			sent = true
		default:
			// Buffer full for this connection, skip
		}
	}
	return sent
}
