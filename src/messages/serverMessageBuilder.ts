import { GameData, Player } from '../game/clientGameState'
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

const turnChanged = (gameData: GameData): MTurnChanged => ({
  type: GameMessageType.TurnChanged,
  gameData
})

const dealChanged = (gameData: GameData): MDealChanged => ({
  type: GameMessageType.DealChanged,
  gameData
})
export default {
  gameCreated,
  gameJoined,
  playerJoined,
  gameStarted,
  turnChanged,
  dealChanged
}
