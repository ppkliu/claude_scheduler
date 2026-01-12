/**
 * WebSocket Service
 * Handles real-time communication between backend and connected clients
 */

import { WebSocketServer, WebSocket } from 'ws'
import type { WebSocketMessage, BuildLogUpdate, MetricsUpdate } from '../types/deployment.types'

interface ClientMetadata {
  id: string
  connectedAt: Date
  lastPing: Date
}

export class WebSocketService {
  private wss: WebSocketServer | null = null
  private clients: Map<WebSocket, ClientMetadata> = new Map()
  private clientIdCounter = 0
  private pingInterval: NodeJS.Timeout | null = null

  /**
   * Initialize WebSocket server on an HTTP server
   */
  initialize(server: any): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws/deployment'
    })

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = `client-${++this.clientIdCounter}`
      const metadata: ClientMetadata = {
        id: clientId,
        connectedAt: new Date(),
        lastPing: new Date()
      }

      this.clients.set(ws, metadata)
      console.log(`[WebSocket] Client ${clientId} connected. Total clients: ${this.clients.size}`)

      // Send connection confirmation
      this.send(ws, 'connection:established', {
        clientId,
        timestamp: new Date().toISOString(),
        connectedClients: this.clients.size
      })

      // Handle incoming messages
      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleMessage(ws, message, metadata)
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error)
          this.send(ws, 'error', {
            code: 'PARSE_ERROR',
            message: 'Failed to parse message'
          })
        }
      })

      // Handle client disconnection
      ws.on('close', () => {
        this.clients.delete(ws)
        console.log(`[WebSocket] Client ${clientId} disconnected. Total clients: ${this.clients.size}`)
      })

      // Handle errors
      ws.on('error', (error) => {
        console.error(`[WebSocket] Error with client ${clientId}:`, error)
        this.clients.delete(ws)
      })

      // Handle pong response to keep-alive
      ws.on('pong', () => {
        const meta = this.clients.get(ws)
        if (meta) {
          meta.lastPing = new Date()
        }
      })
    })

    // Start ping-pong keep-alive
    this.startKeepAlive()

    console.log('[WebSocket] Server initialized on /ws/deployment')
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(ws: WebSocket, message: any, metadata: ClientMetadata): void {
    const { event } = message

    switch (event) {
      case 'ping':
        this.send(ws, 'pong', { timestamp: new Date().toISOString() })
        break

      case 'subscribe:builds':
        console.log(`[WebSocket] Client ${metadata.id} subscribed to builds`)
        this.send(ws, 'subscribed', { channel: 'builds' })
        break

      case 'subscribe:metrics':
        console.log(`[WebSocket] Client ${metadata.id} subscribed to metrics`)
        this.send(ws, 'subscribed', { channel: 'metrics' })
        break

      case 'subscribe:all':
        console.log(`[WebSocket] Client ${metadata.id} subscribed to all channels`)
        this.send(ws, 'subscribed', { channel: 'all' })
        break

      default:
        console.log(`[WebSocket] Unknown event from ${metadata.id}:`, event)
    }
  }

  /**
   * Send message to a specific client
   */
  send(ws: WebSocket, event: string, data: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = {
        event,
        data,
        timestamp: new Date().toISOString()
      }
      ws.send(JSON.stringify(message), (error) => {
        if (error) {
          console.error('[WebSocket] Send error:', error)
        }
      })
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(event: string, data: any): void {
    const message: WebSocketMessage = {
      event,
      data,
      timestamp: new Date().toISOString()
    }
    const messageStr = JSON.stringify(message)

    let sentCount = 0
    let failedCount = 0

    this.clients.forEach((metadata, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr, (error) => {
          if (error) {
            console.error(`[WebSocket] Send error to ${metadata.id}:`, error)
            failedCount++
          } else {
            sentCount++
          }
        })
      }
    })

    if (sentCount > 0) {
      console.log(`[WebSocket] Broadcast '${event}' to ${sentCount} clients${failedCount > 0 ? `, ${failedCount} failed` : ''}`)
    }
  }

  /**
   * Broadcast build log update
   */
  broadcastBuildLog(buildId: number, output: string): void {
    this.broadcast('build:output', {
      buildId,
      output
    } as BuildLogUpdate)
  }

  /**
   * Broadcast build error
   */
  broadcastBuildError(buildId: number, error: string): void {
    this.broadcast('build:error', {
      buildId,
      error
    })
  }

  /**
   * Broadcast build completion
   */
  broadcastBuildComplete(buildId: number, success: boolean, duration: number, exitCode: number): void {
    this.broadcast('build:complete', {
      buildId,
      success,
      duration,
      exitCode
    })
  }

  /**
   * Broadcast metrics update
   */
  broadcastMetrics(metrics: any): void {
    this.broadcast('metrics:update', metrics as MetricsUpdate)
  }

  /**
   * Broadcast system event
   */
  broadcastEvent(eventType: string, data: any): void {
    this.broadcast(`event:${eventType}`, data)
  }

  /**
   * Get number of connected clients
   */
  getConnectedClientsCount(): number {
    return this.clients.size
  }

  /**
   * Get list of connected clients info
   */
  getConnectedClientsInfo(): Array<{ id: string; connectedAt: string; lastPing: string }> {
    return Array.from(this.clients.values()).map(meta => ({
      id: meta.id,
      connectedAt: meta.connectedAt.toISOString(),
      lastPing: meta.lastPing.toISOString()
    }))
  }

  /**
   * Start keep-alive ping-pong mechanism
   */
  private startKeepAlive(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
    }

    this.pingInterval = setInterval(() => {
      const now = Date.now()
      const timeout = 30000 // 30 seconds

      this.clients.forEach((metadata, ws) => {
        const timeSinceLastPing = now - metadata.lastPing.getTime()

        if (timeSinceLastPing > timeout) {
          console.log(`[WebSocket] Terminating unresponsive client ${metadata.id}`)
          ws.terminate()
          this.clients.delete(ws)
        } else {
          ws.ping()
        }
      })
    }, 30000) // Check every 30 seconds
  }

  /**
   * Shutdown WebSocket service
   */
  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }

    // Close all client connections
    this.clients.forEach((_, ws) => {
      ws.close(1000, 'Server shutting down')
    })
    this.clients.clear()

    // Close server
    if (this.wss) {
      this.wss.close(() => {
        console.log('[WebSocket] Server closed')
      })
      this.wss = null
    }
  }
}

// Export singleton instance
export const websocketService = new WebSocketService()
