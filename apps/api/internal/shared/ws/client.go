package ws

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 1024
)

// Client represents a single WebSocket connection
type Client struct {
	hub       *Hub
	conn      *websocket.Conn
	send      chan OutgoingEvent
	userID    int64
	closeOnce sync.Once
}

func NewClient(hub *Hub, conn *websocket.Conn, userID int64) *Client {
	return &Client{
		hub:    hub,
		conn:   conn,
		send:   make(chan OutgoingEvent, 256),
		userID: userID,
	}
}

// CloseSend safely closes the send channel exactly once, preventing double-close panics.
func (c *Client) CloseSend() {
	c.closeOnce.Do(func() {
		close(c.send)
	})
}

// ReadPump reads incoming JSON events from the WebSocket connection.
// It calls onMessage for each event received (e.g. typing indicators).
// Must be run in its own goroutine.
func (c *Client) ReadPump(onMessage func(userID int64, event IncomingEvent)) {
	defer func() {
		c.hub.UnregisterClient(c)
		// The connection is being torn down; a close error has no reader left.
		_ = c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	// A deadline can only fail on an already-broken connection, which the read
	// loop below detects on its next iteration.
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		var event IncomingEvent
		err := c.conn.ReadJSON(&event)
		if err != nil {
			break
		}
		if onMessage != nil {
			onMessage(c.userID, event)
		}
	}
}

// WritePump writes outgoing events from the send channel to the WebSocket
// connection and sends periodic pings. Must be run in its own goroutine.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()
	for {
		select {
		case event, ok := <-c.send:
			if err := c.conn.SetWriteDeadline(time.Now().Add(writeWait)); err != nil {
				return
			}
			if !ok {
				// Hub closed the channel: say goodbye, best effort.
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteJSON(event); err != nil {
				return
			}
		case <-ticker.C:
			if err := c.conn.SetWriteDeadline(time.Now().Add(writeWait)); err != nil {
				return
			}
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
