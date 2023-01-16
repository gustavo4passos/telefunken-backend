import WebSocket from 'ws'
import { ExtWebSocket } from './connection/socket'
import { storage } from './game/storage'
import { onMessage } from './messageHandlers'
const wss = new WebSocket.Server({ port: 443 })

wss.on('connection', (ws: ExtWebSocket) => {
  ws.id = storage.AddConnection(ws)
  // TODO: Terrible. Fix it. Find how to extend the class, if possible, of create a middleware
  ws.sendObject = <T>(data: T) => {
    ws.send(JSON.stringify(data))
  }

  ws.on('message', (messageAsString: string) => onMessage(ws, messageAsString))

  ws.on('close', () => {
    console.log('Client closed')
  })
})

console.log('Telefunken Backend started')
