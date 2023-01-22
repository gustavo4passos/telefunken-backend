import { ExtWebSocket } from './connection/socket'
import { GameState, PlayerID } from './game/gameState'
import { storage } from './game/storage'
import {
  GameMessage,
  GameMessageType,
  MessageStatusType,
  MJoinGame,
  MPlay,
  MStartGame
} from './messages/gameMessages'
import { assertIsDefined } from './utils/assert'
import MessageBuilder from './messages/serverMessageBuilder'
import { Player } from './game/clientGameState'
import { Game, GameAdvanceState, MAX_NUM_PLAYERS } from './game/game'
import { Logger } from './utils/logger'
import { simulateAi } from './game/ai'

// export const onConnect = (ws: ExtWebSocket): void => {}

// TODO: When players disconnect, check if they are in a game, and if they are:
// * Either transform their player into an AI player or remove them from the game
export const onClose = (ws: ExtWebSocket) => {
  if (ws.id == null) return
  storage.connections.delete(ws.id)
}

export const messageAllGamePlayers = <T extends GameMessage>(
  game: Game,
  message: (p: PlayerID) => T
) => {
  game.players.forEach((p) => {
    const player = storage.players.get(p)
    assertIsDefined(player)
    if (player.isAi) return // Do not talk to robots
    const conn = storage.connections.get(player.connectionId)
    if (conn == undefined)
      Logger.logError(
        `Trying to send message to player with id ${p} that does not have a connection.`
      )
    else conn.sendObject(message(p))
  })
}

export const onMessage = (ws: ExtWebSocket, messageString: string): void => {
  // Sanity check
  assertIsDefined(ws.id)
  const message = JSON.parse(messageString) as GameMessage

  switch (message.type) {
    case GameMessageType.CreateGame: {
      const playerId = storage.AddPlayer(ws.id)
      const player = storage.players.get(playerId)
      assertIsDefined(player)
      const gameId = storage.CreateGame(playerId)

      assertIsDefined(player)
      ws.sendObject(
        MessageBuilder.gameCreated(
          storage.extractClientGameData(gameId, playerId)
        )
      )

      break
    }

    case GameMessageType.JoinGame: {
      const { gameId } = message as MJoinGame
      let { playerId } = message as MJoinGame
      const game = storage.games.get(gameId)

      // Invalid game id
      if (!game) {
        ws.sendObject(
          MessageBuilder.gameJoined(undefined, {
            type: MessageStatusType.GameNotExist
          })
        )
        return
      }

      if (game.isFull()) {
        ws.sendObject(
          MessageBuilder.gameJoined(undefined, {
            type: MessageStatusType.GameFull
          })
        )
        return
      }

      if (game.state != GameState.WaitingForPlayers) {
        ws.sendObject(
          MessageBuilder.gameJoined(undefined, {
            type: MessageStatusType.GameAlreadyStarted
          })
        )
        return
      }

      // If player hasn't been created yet, create it
      if (playerId == null) playerId = storage.AddPlayer(ws.id)
      game.addPlayer(playerId)

      const clientGameData = storage.extractClientGameData(gameId, playerId)
      assertIsDefined(clientGameData)

      // Let other players know a new player joined
      const joinedPlayerData = storage.players.get(playerId)
      assertIsDefined(joinedPlayerData)
      const clientPlayerData: Player = joinedPlayerData as Player

      // Let players know game started
      messageAllGamePlayers(game, (p) => {
        if (p == playerId) return MessageBuilder.gameJoined(clientGameData)
        return MessageBuilder.playerJoined(clientPlayerData, game.players)
      })

      break
    }

    case GameMessageType.StartGame: {
      const startGameMessage = message as MStartGame
      const gameId = startGameMessage.gameId
      const playerId = startGameMessage.playerId

      const game = storage.games.get(gameId)

      // TODO: Game doesn't exist error message
      if (!game) return

      // TODO: Player doesn't own the room error message
      if (game.owner != playerId) return

      while (game.players.length < MAX_NUM_PLAYERS) {
        const aiId = storage.AddPlayer(0, true)
        game.addPlayer(aiId)
      }
      // TODO: Unable to start game message
      if (!game.startGame()) return

      // Let players know game started
      messageAllGamePlayers(game, (p) =>
        MessageBuilder.gameStarted(storage.extractClientGameData(gameId, p))
      )

      simulateAi(game, gameId)
      break
    }
    case GameMessageType.Play: {
      const { gameId, playerId, playerMove } = message as MPlay

      const player = storage.players.get(playerId)
      if (!player) {
        Logger.logError(
          `Player with id ${playerId} tried to play, but it's not a valid player`
        )
      }

      const game = storage.games.get(gameId)
      if (!game) {
        Logger.logError(
          `Player ${playerId} tried to play but provided an invalid game`
        )
        return
      }

      if (!game.isPlayerInGame(playerId)) {
        Logger.logError(
          `Player ${playerId} tried to play but it doesn't belong to game ${gameId}`
        )
        return
      }

      // It's not the player turn
      // TODO: This should return an error to the client?
      if (game.playerTurn != playerId) return

      game.executePlayerMove(playerId, playerMove)
      const gameAdvanceState = game.advance()

      if (gameAdvanceState == GameAdvanceState.TurnChanged) {
        messageAllGamePlayers(game, (p) =>
          MessageBuilder.turnChanged(storage.extractClientGameData(gameId, p))
        )
      } else if (gameAdvanceState == GameAdvanceState.DealChanged) {
        messageAllGamePlayers(game, (p) =>
          MessageBuilder.dealChanged(storage.extractClientGameData(gameId, p))
        )
      }

      simulateAi(game, gameId)

      break
    }

    default: {
      Logger.logError(`Unhadled message: ${message}`)
    }
  }
}
