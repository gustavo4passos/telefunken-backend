import { GameData, Player } from '../game/clientGameState'
import { Card } from '../game/deck'
import { PlayerID } from '../game/gameState'
import {
  GameMessageType,
  MessageStatus,
  MessageStatusType,
  MGameCreated,
  MGameJoined,
  MGameStarted,
  MPlayerJoined,
  MDealChanged,
  MTurnChanged
} from './gameMessages'

const gameStarted = (gameData: GameData): MGameStarted => ({
  type: GameMessageType.GameStarted,
  gameData
})

const gameCreated = (gameData: GameData): MGameCreated => ({
  type: GameMessageType.GameCreated,
  gameData
})

const gameJoined = (
  gameData?: GameData,
  status?: MessageStatus
): MGameJoined => ({
  type: GameMessageType.GameJoined,
  gameData,
  status: status || { type: MessageStatusType.Success }
})

const playerJoined = (
  player: Player,
  playerOrder: Array<PlayerID>
): MPlayerJoined => ({
  type: GameMessageType.PlayerJoined,
  player,
  playerOrder
})

const turnChanged = (gameData: GameData): MTurnChanged => {
  return {
    type: GameMessageType.TurnChanged,
    gameData
  }
}

const dealChanged = (gameData: GameData): MDealChanged => ({
  type: GameMessageType.DealChanged,
  gameData
})

const cardBought = (
  playerId: PlayerID,
  success: boolean | null,
  card: Card | null,
  cardDrawn: Card | null,
  gameData: GameData
) => ({
  type: GameMessageType.CardBought,
  playerId,
  success,
  cardDrawn,
  card,
  gameData
})

const gameEnded = (gameData: GameData) => ({
  type: GameMessageType.GameEnded,
  gameData
})

export default {
  gameCreated,
  gameJoined,
  playerJoined,
  gameStarted,
  turnChanged,
  gameEnded,
  dealChanged,
  cardBought
}
