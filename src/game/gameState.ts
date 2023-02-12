import { ConnectionID } from '../connection/socket'
import { CombinationConstraint } from './constraints'
import { Card } from './deck'

export type PlayerID = number
export type GameID = number
export type MeldID = number
export type Meld = Array<Card>
export const INVALID_PLAYER_ID: PlayerID = -1
export const INITIAL_N_CHIPS = 6

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

export interface MeldCardReplacement {
  kind: 'replacement'
  handToMeld: Card
  meldToHand: Card
}

export interface MeldCardExtension {
  kind: 'extension'
  card: Card
}

export interface MeldModification {
  meldPlayerId: PlayerID
  meldId: MeldID
  data: MeldCardReplacement | MeldCardExtension
}

export enum MeldChangeType {
  Extension,
  CardReplacement
}

// Extension requires typeof cards = Card and CardReplacement cards = [Card, Card]
export interface MeldChange {
  type: MeldChangeType
  meldId: MeldID
  cards: Card | [Card, Card]
}

export interface PlayerDealEndState {
  remainingCards: Array<Card>
  melds: Array<Meld>
  cardsBought: Array<Card>
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
  dealer: PlayerID
  currentDealTurn: number
  playerTurn: PlayerID
  melds: Record<PlayerID, Array<Meld>>
  playerCards: Record<PlayerID, Array<Card>>
  discardPile: Array<Card>
  dealConstraints: Array<DealConstraint>
  dealConstraintCompliance: Record<PlayerID, Array<boolean>>
  dealsEndState: Array<DealEndState>
  boughtThisRound: Record<PlayerID, boolean>
  playerChips: Record<PlayerID, number>
}
