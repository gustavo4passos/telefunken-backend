import { DealConstraint, DealEndState, GameState, PlayerID } from './gameState'

type GameID = number
type Card = number
type Meld = Array<Card>

export interface GameData {
  gameId: GameID
  playerId: PlayerID
  state: GameState
  players: Record<PlayerID, Player>
  deal: number
  playerTurn: PlayerID
  melds: Record<PlayerID, Array<Meld>>
  playerCards: Array<Card>
  otherPlayerCards: Record<PlayerID, number>
  discardPile: Array<Card>
  dealConstraintCompliance: Array<boolean>
  // TODO: Only needs to be sent on dealEnded
  dealsEndState: Array<DealEndState>
  //TODO: These does not need to be sent everytime, just once. Maybe GameStarted or GameJoined
  dealConstraints: Array<DealConstraint>
  playerOrder: Array<PlayerID>
  boughtThisRound: boolean
  isOwner: boolean
}

export interface Player {
  id: PlayerID
  name: string
}
