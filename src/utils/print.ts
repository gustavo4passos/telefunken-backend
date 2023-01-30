import {
  Card,
  CardRank,
  CardSuit,
  getCardRank,
  getCardSuit
} from '../game/deck'

export const getNiceStringSetOfCards = (cards: Array<Card>): string => {
  const cardsString: string = cards.reduce((p, c) => {
    const s = getCardSuit(c)
    if (s == CardSuit.Joker) return p + ' Joker,'

    const r = getCardRank(c)
    return p + ` ${CardSuit[s]}-${CardRank[r]},`
  }, '')

  return `[${cardsString}]`
}
