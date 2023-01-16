import { Card } from './deck'
import { PlayerMove } from './game'

export const calculateMove = (cards: Array<Card>): PlayerMove => {
  return { melds: [], discards: cards[0] }
}
