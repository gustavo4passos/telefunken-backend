import { ExtWebSocket } from './connection/socket'
import { GameID, GameState, PlayerID } from './game/gameState'
import { Storage, storage } from './game/storage'
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
import { Game, MAX_NUM_PLAYERS } from './game/game'
import { Logger } from './utils/logger'
import { calculateMove } from './game/ai'

// export const onConnect = (ws: ExtWebSocket): void => {}

const messageAllGamePlayers = <T extends GameMessage>(
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

const AI_PLAY_DELAY = 1000
const aiPlay = (game: Game, gameId: GameID) => {
  const nextPlayerId = game.playerTurn
  const nextPlayer = storage.players.get(nextPlayerId)
  assertIsDefined(nextPlayer)

  if (!nextPlayer.isAi) return

  const aiMove = calculateMove(game.playerCards[nextPlayer.id])
  game.executePlayerMove(nextPlayerId, aiMove)
  game.advance()
  messageAllGamePlayers(game, (p) =>
    MessageBuilder.gameStarted(storage.extractClientGameData(gameId, p))
  )

  setTimeout(() => aiPlay(game, gameId), AI_PLAY_DELAY)
}

const simulateAi = (game: Game, gameId: GameID) => {
  setTimeout(() => aiPlay(game, gameId), AI_PLAY_DELAY)
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
      const joinGameMessage = message as MJoinGame
      const gameId = joinGameMessage.gameId
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

      // Add player to game
      const playerId = storage.AddPlayer(ws.id)
      game.addPlayer(playerId)
      const clientGameData = storage.extractClientGameData(gameId, playerId)
      assertIsDefined(clientGameData)
      ws.sendObject(MessageBuilder.gameJoined(clientGameData))

      // Let other players know a new player joined
      const joinedPlayerData = storage.players.get(playerId)
      assertIsDefined(joinedPlayerData)
      const clientPlayerData: Player = joinedPlayerData as Player

      game.players.forEach((p) => {
        if (p == playerId) return // Don't tell a player about themselves
        const player = storage.players.get(p)
        assertIsDefined(player)

        const conn = storage.connections.get(player.connectionId)
        assertIsDefined(conn)

        conn.sendObject(
          MessageBuilder.playerJoined(clientPlayerData, game.players)
        )
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
      game.advance()

      messageAllGamePlayers(game, (p) =>
        MessageBuilder.turnChanged(storage.extractClientGameData(gameId, p))
      )

      simulateAi(game, gameId)

      break
    }

    default: {
      Logger.logError(`Unhadled message: ${message}`)
    }
  }
}
