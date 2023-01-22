import { ConnectionID } from '../connection/socket'
import { CombinationConstraint } from './combinations'
import { Card } from './deck'

export type PlayerID = number
export type GameID = number
export type MeldID = number
export type Meld = Array<Card>
export const INVALID_PLAYER_ID: PlayerID = -1

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

export interface PlayerDealEndState {
  remainingCards: Array<Card>
  melds: Array<Meld>
}

export type DealEndState = Record<PlayerID, PlayerDealEndState>

export interface DealConstraint {
  combinationConstraint: CombinationConstraint
  size: number
}

export interface PlayerMove {
  melds: Array<Meld>
  discards: Card | null
  meldExtensions: Record<MeldID, Array<Card>>
}

export interface ServerGameData {
  state: GameState
  deck: Array<number>
  players: Array<PlayerID>
  owner: PlayerID
  deal: number
  playerTurn: PlayerID
  dealer: PlayerID
  melds: Record<PlayerID, Array<Meld>>
  playerCards: Record<PlayerID, Array<Card>>
  discardPile: Array<Card>
  dealConstraints: Array<DealConstraint>
  dealConstraintCompliance: Record<PlayerID, Array<boolean>>
  dealsEndState: Array<DealEndState>
}
