export type Card = number

export enum CardSuit {
  Clubs,
  Hearts,
  Diamond,
  Spade,
  Joker
}

export enum CardRank {
  Ace = 1,
  Two = 2,
  Three = 3,
  Four = 4,
  Five = 5,
  Six = 6,
  Seven = 7,
  Eight = 8,
  Nine = 9,
  Ten = 10,
  Jack = 11,
  Queen = 12,
  King = 13
}

export const isJoker = (card: Card): boolean => {
  return getCardNumberInDeck(card) > 51
}

const getCardNumberInDeck = (card: Card) => card % 54

export const getCardValue = (card: Card): number => {
  const s = getCardSuit(card)
  if (s == CardSuit.Joker) return 20

  const r = getCardRank(card)
  if (r == CardRank.Ace) return 15
  if (r == CardRank.Two) return 20
  if (r >= CardRank.Three && r <= CardRank.Nine) return r // Between 3 and 9
  return 10 // Between 10 and K
}

export const getCardSuit = (card: Card): CardSuit => {
  // Handle multiple decks
  const singleDeckNumber = getCardNumberInDeck(card)
  if (isJoker(singleDeckNumber)) return CardSuit.Joker

  const suitId = Math.floor(singleDeckNumber / 13)

  switch (suitId) {
    case 0:
      return CardSuit.Clubs
    case 1:
      return CardSuit.Hearts
    case 2:
      return CardSuit.Diamond
    case 3:
      return CardSuit.Spade
  }

  throw new Error(`Card number is invalid: ${card}`)
}
export const getCardRank = (card: Card): CardRank => {
  // Handle multiple decks
  const singleDeckNumber = getCardNumberInDeck(card)

  if (isJoker(singleDeckNumber))
    throw new Error(`Card number is invalid for retrieving rank: ${card}`)

  const rankNumber = (singleDeckNumber % 13) + 1

  return rankNumber as CardRank
}

export const shuffleDeck = (deck: Array<Card>): Array<Card> => {
  let m = deck.length

  // Fisher–Yates Shuffle
  while (m != 0) {
    const r = Math.floor(Math.random() * m--)
    const c = deck[m]
    deck[m] = deck[r]
    deck[r] = c
  }

  return deck
}

export const createDeck = (deckSize: number): Array<Card> => {
  return Array.from({ length: deckSize }, (e, i) => i)
}

export const createShuffledDeck = (deckSize: number): Array<Card> => {
  const orderedDeck = createDeck(deckSize)
  return shuffleDeck(orderedDeck)
}
