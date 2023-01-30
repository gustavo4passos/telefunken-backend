import { ExtWebSocket } from './connection/socket'
import { GameID, GameState, PlayerID, ServerPlayer } from './game/gameState'
import { storage } from './game/storage'
import {
  GameMessage,
  GameMessageType,
  MBuyCard,
  MCreateGame,
  MessageStatusType,
  MJoinGame,
  MPlay,
  MStartGame
} from './messages/gameMessages'
import { assertIsDefined } from './utils/assert'
import MessageBuilder from './messages/serverMessageBuilder'
import { Player } from './game/clientGameState'
import {
  Game,
  GameAdvanceState,
  MAX_NUM_PLAYERS,
  MIN_NUM_PLAYERS
} from './game/game'
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

export const communicateGameAdvanceState = (
  gameAdvanceState: GameAdvanceState,
  game: Game,
  gameId: GameID
) => {
  switch (gameAdvanceState) {
    case GameAdvanceState.TurnChanged: {
      messageAllGamePlayers(game, (p) => {
        return MessageBuilder.turnChanged(
          storage.extractClientGameData(gameId, p)
        )
      })
      break
    }
    case GameAdvanceState.DealChanged: {
      messageAllGamePlayers(game, (p) =>
        MessageBuilder.dealChanged(storage.extractClientGameData(gameId, p))
      )
      break
    }
    case GameAdvanceState.GameEnded: {
      messageAllGamePlayers(game, (p) =>
        MessageBuilder.gameEnded(storage.extractClientGameData(gameId, p))
      )
      break
    }
    default: {
      Logger.logError(
        `Unhandled game advance state: ${GameAdvanceState[gameAdvanceState]}`
      )
      break
    }
  }
}

const getGameAndPlayer = (
  gameId: GameID,
  playerId: PlayerID
): { player: ServerPlayer | null; game: Game | null; success: boolean } => {
  const player = storage.players.get(playerId)

  if (!player) {
    Logger.logError(
      `Player with id ${playerId} tried to play, but it's not a valid player`
    )

    return { game: null, player: null, success: false }
  }

  const game = storage.games.get(gameId)
  if (!game) {
    Logger.logError(
      `Player ${playerId} tried to play but provided an invalid game`
    )
    return { player, game: null, success: false }
  }

  if (!game.isPlayerInGame(playerId)) {
    Logger.logError(
      `Player ${playerId} tried to play but it doesn't belong to game ${gameId}`
    )
    return { player, game, success: false }
  }

  return { player, game, success: true }
}

export const onMessage = (ws: ExtWebSocket, messageString: string): void => {
  // Sanity check
  assertIsDefined(ws.id)
  const message = JSON.parse(messageString) as GameMessage

  switch (message.type) {
    case GameMessageType.CreateGame: {
      let { playerId } = message as MCreateGame
      // If player does not exist, create it
      if (playerId == undefined || storage.players.get(playerId) == undefined)
        playerId = storage.AddPlayer(ws.id)

      const player = storage.players.get(playerId)
      assertIsDefined(player)
      // TODO: This will fail if player is at more than one game at the same time
      // Update or set player connection id
      // It might change if player closed then reopened the game
      player.connectionId = ws.id
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

      // If player is already in game, is valid just return current status of the game for them (= rejoin)
      if (
        playerId != undefined &&
        storage.isValidPlayer(playerId) &&
        game.players.findIndex((p) => p == playerId) != -1
      ) {
        // Update player connection id
        const player = storage.players.get(playerId)
        assertIsDefined(player)
        player.connectionId = ws.id
        ws.sendObject(
          MessageBuilder.gameJoined(
            storage.extractClientGameData(gameId, playerId)
          )
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
      if (playerId == undefined || !storage.isValidPlayer(playerId))
        playerId = storage.AddPlayer(ws.id)

      const player = storage.players.get(playerId)
      assertIsDefined(player)
      // TODO: This will fail if player is at more than one game at the same time
      // Update or set player connection id
      // It might change if player closed then reopened the game
      player.connectionId = ws.id
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

      const { player, game, success } = getGameAndPlayer(gameId, playerId)
      if (!success || player == null || game == null) return

      // It's not the player turn
      // TODO: This should return an error to the client?
      if (game.playerTurn != playerId) return

      if (!game.executePlayerMove(playerId, playerMove)) return
      const gameAdvanceState = game.advance()

      communicateGameAdvanceState(gameAdvanceState, game, gameId)

      if (game.state == GameState.InProgress) simulateAi(game, gameId)
      else console.log('Game is not in progress')

      break
    }

    case GameMessageType.BuyCard: {
      const { gameId, playerId, card } = message as MBuyCard

      const { player, game, success } = getGameAndPlayer(gameId, playerId)
      if (!success || player == null || game == null) return

      if (!game.buyCard(playerId, card)) {
        ws.sendObject(
          MessageBuilder.cardBought(
            playerId,
            false,
            card,
            null,
            storage.extractClientGameData(gameId, playerId)
          )
        )
        return
      }

      messageAllGamePlayers(game, (p) => {
        if (p == playerId) {
          return MessageBuilder.cardBought(
            playerId,
            true,
            card,
            game.playerCards[playerId][game.playerCards[playerId].length - 1],
            storage.extractClientGameData(gameId, p)
          )
        } else
          return MessageBuilder.cardBought(
            playerId,
            true,
            null,
            null,
            storage.extractClientGameData(gameId, p)
          )
      })
      break
    }

    default: {
      Logger.logError(`Unhadled message: ${message}`)
    }
  }
}
