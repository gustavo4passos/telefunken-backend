import WebSocket from 'ws'

export type ConnectionID = number

export interface ExtWebSocket extends WebSocket {
  id: ConnectionID | null
  sendObject: <T>(data: T) => void
}
