import { GameData, Player } from '../game/clientGameState'
import { PlayerMove } from '../game/game'
import { GameID, PlayerID } from '../game/gameState'

export enum GameMessageType {
  // Client messages
  Invalid,
  CreateGame,
  StartGame,
  JoinGame,
  Play,

  // Server messages
  GameCreated,
  GameJoined,
  GameStarted,
  PlayerJoined,
  TurnChanged
}

export enum MessageStatusType {
  Success,
  // Errors
  GameFull,
  GameNotExist,
  GameAlreadyStarted
}

export interface MessageStatus {
  type: MessageStatusType
  description?: string
}

export interface GameMessage {
  type: GameMessageType
}

export interface MStartGame extends GameMessage {
  playerId: PlayerID
  gameId: GameID
}

export interface MGameStarted extends GameMessage {
  gameData: GameData
}

export interface MJoinGame extends GameMessage {
  gameId: GameID
}

export interface MGameCreated extends GameMessage {
  gameData: GameData
}

export interface MGameJoined extends GameMessage {
  gameData?: GameData
  status: MessageStatus
}

export interface MPlayerJoined extends GameMessage {
  player: Player
  playerOrder: Array<PlayerID>
}

export interface MPlay extends GameMessage {
  gameId: GameID
  playerId: PlayerID
  playerMove: PlayerMove
}

export interface MTurnChanged extends GameMessage {
  gameData: GameData
}
