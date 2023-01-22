import WebSocket from 'ws'
import { ExtWebSocket } from './connection/socket'
import { storage } from './game/storage'
import { onMessage } from './messageHandlers'
import express from 'express'

const PORT = process.env.PORT ? Number(process.env.PORT) : 7071

const httpApp = express()

httpApp.get('/data', (req, res) => {
  res.send(JSON.stringify(storage))
})

const httpServer = httpApp.listen(PORT, () =>
  console.log(`HTTP server listening on port ${PORT}`)
)

const wss = new WebSocket.Server({ server: httpServer })

wss.on('connection', (ws: ExtWebSocket) => {
  const connId = storage.AddConnection(ws)
  ws.id = connId
  console.log('Client connected, id: ', ws.id)
  // TODO: Terrible. Fix it. Find how to extend the class, if possible, of create a middleware
  ws.sendObject = <T>(data: T) => {
    ws.send(JSON.stringify(data))
  }

  ws.on('message', (messageAsString: string) => onMessage(ws, messageAsString))

  ws.on('close', () => {
    console.log('Client closed')
    //
    storage.connections.delete(connId)
  })
})

console.log('Telefunken Backend started')
