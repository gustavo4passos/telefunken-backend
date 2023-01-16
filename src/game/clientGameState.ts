import { GameState, PlayerID } from './gameState'

type GameID = number
type Card = number
type Meld = Array<Card>

export interface GameData {
  gameId: GameID
  playerId: PlayerID
  state: GameState
  players: Record<PlayerID, Player>
  round: number
  playerTurn: PlayerID
  melds: Record<PlayerID, Array<Meld>>
  playerCards: Array<Card>
  otherPlayerCards: Record<PlayerID, number>
  discardPile: Array<Card>
  playerOrder: Array<PlayerID> //TODO: This does not need to be sent everytime, just once. Maybe GameStarted or GameJoined
}

export interface Player {
  id: PlayerID
  name: string
}
