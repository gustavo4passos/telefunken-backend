import { ConnectionID, ExtWebSocket } from '../connection/socket'
import { assertIsDefined } from '../utils/assert'
import { GameData, Player } from './clientGameState'
import { Game } from './game'
import { ServerPlayer, PlayerID, GameID } from './gameState'

export class Storage {
  nextGameId: number
  nextPlayerId: PlayerID
  nextConnectionId: ConnectionID
  games: Map<GameID, Game>
  players: Map<PlayerID, ServerPlayer>
  connections: Map<ConnectionID, ExtWebSocket>

  constructor() {
    this.nextGameId = 0
    this.nextPlayerId = 0
    this.nextConnectionId = 0
    this.games = new Map<number, Game>()
    this.players = new Map<number, ServerPlayer>()
    this.connections = new Map<ConnectionID, ExtWebSocket>()
  }

  AddPlayer(connectionId: ConnectionID, isAi = false): PlayerID {
    const id = this.GetNextPlayerID()
    this.players.set(id, { id, connectionId, name: '', isAi })
    return id
  }

  private GetNextPlayerID(): PlayerID {
    return this.nextPlayerId++
  }

  AddConnection(ws: ExtWebSocket): ConnectionID {
    const id = this.nextConnectionId++
    this.connections.set(id, ws)

    return id
  }

  CreateGame(owner: PlayerID): number {
    const gameId = this.GetNextGameID()
    this.games.set(gameId, new Game(owner))
    return gameId
  }

  private GetNextGameID(): number {
    return this.nextGameId++
  }

  // TODO: This sould likely be part of Game
  // Sanity check - returns null if player is not in the game, or if game doesn't exist
  extractClientGameData(gameId: GameID, playerId: PlayerID): GameData {
    const game = this.games.get(gameId)
    assertIsDefined(game)

    const otherPlayerCards: Record<PlayerID, number> = {}

    game.players.forEach((p) => {
      if (p == playerId) return
      otherPlayerCards[p] = game.playerCards[p].length
    })

    return {
      gameId,
      playerId,
      state: game.state,
      players: this.gatherPlayerDataFromGame(gameId),
      deal: game.deal,
      playerTurn: game.playerTurn,
      melds: game.melds,
      playerCards: game.playerCards[playerId],
      otherPlayerCards,
      discardPile: game.discardPile,
      playerOrder: game.players,
      dealConstraintCompliance: game.dealConstraintCompliance[playerId],
      dealConstraints: game.dealConstraints
    }
  }

  gatherPlayerDataFromGame(gameId: GameID): Record<PlayerID, Player> {
    const players: Record<PlayerID, Player> = {}
    const game = this.games.get(gameId)
    assertIsDefined(game)
    game.players.forEach((p) => {
      const player = storage.players.get(p)
      assertIsDefined(player)
      players[p] = player
    })

    return players
  }

  isValidGame(gameId: GameID) {
    return this.games.get(gameId) != undefined
  }
}

export const storage = new Storage()
