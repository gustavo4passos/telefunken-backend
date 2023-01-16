import { ConnectionID } from '../connection/socket'
import { Card } from './deck'

export type PlayerID = number
export type GameID = number
export const INVALID_PLAYER_ID: PlayerID = -1
export type Meld = Array<Card>

export interface ServerPlayer {
  id: PlayerID
  name: string
  connectionId: ConnectionID
  isAi: boolean
}

export enum GameState {
  Invalid,
  WaitingForPlayers,
  InProgress,
  Finished
}

export interface ServerGameData {
  state: GameState
  deck: Array<number>
  players: Array<PlayerID>
  owner: PlayerID
  round: number
  playerTurn: PlayerID
  dealer: PlayerID
  melds: Record<PlayerID, Array<Meld>>
  playerCards: Record<PlayerID, Array<Card>>
  discardPile: Array<Card>
}
