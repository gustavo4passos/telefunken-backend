import { Card, CardRank, getCardRank, getCardSuit, isJoker } from './deck'

// -1 for no size constraint
export interface CombinationConstraint {
  size: number
  pure: boolean
}

export interface RunGap {
  valid: boolean
  pos: number
}

export const rankSortFn = (ca: Card, cb: Card) => {
  if (isJoker(ca)) return 1
  if (isJoker(cb)) return -1

  const rca = getCardRank(ca)
  const rcb = getCardRank(cb)

  if (rca < rcb) return -1
  if (rca > rcb) return 1
  return 0
}

// Obs: Set and runs checks do not consider the amount of cards,
// caller is responsible for that
const isValidSet = (cards: Array<Card>) => {
  const r = getCardRank(cards[0])

  for (const card of cards) {
    if (getCardRank(card) != r) return false
  }
  return true
}

export const isValidRun = (rankSortedCards: Array<Card>) => {
  for (let i = 1; i < rankSortedCards.length; i++) {
    // Cards must be consecutive
    const distance = rankSortedCards[i] - rankSortedCards[i - 1]
    if (distance != 1) return false
  }

  return true
}

// Expects them to be same suit
export const findGap = (rankSortedCards: Array<Card>): RunGap => {
  const rg: RunGap = { valid: true, pos: 0 }
  let gapFound = false

  for (let i = 1; i < rankSortedCards.length; i++) {
    const current = getCardRank(rankSortedCards[i])
    const previous = getCardRank(rankSortedCards[i - 1])
    const gap = current - previous

    if (gap <= 0 || gap > 2) {
      rg.valid = false
      break
    }
    if (gap == 2) {
      if (gapFound) {
        rg.valid = false
        break
      }
      gapFound = true
      rg.pos = i
    }
  }

  return rg
}

export const areCardsSameSuit = (cards: Array<Card>) => {
  const s = getCardSuit(cards[0])
  for (const card of cards) if (s != getCardSuit(card)) return false
  return true
}

export interface CombinationEvaulation {
  valid: boolean
  gapPos: number
  wildCardPos: number
}

export const isValidCombination = (cards: Array<Card>, pure = false) => {
  // Sets need to be between 3 and 6 cards long
  if (cards.length < 3 || cards.length > 5) return false

  // Separate the jokers from the combination
  const jokers = cards.filter((c) => isJoker(c))

  // No more than one joker can be in a combination
  if (jokers.length > 1) return false

  // Remove the jokers from the combination
  const combNoJokers = cards.filter((c) => !isJoker(c))

  // Since most evaluations need the cards to be sort by rank, let's just sort them once here
  combNoJokers.sort(rankSortFn)

  if (pure) {
    // No jokers allowed in pure set
    if (jokers.length > 0) return false
  }
  // Check if combination is valid as a pure combination
  // (if it is valid as pure, it will still be by including the joker)
  if (isValidSet(combNoJokers)) return true
  if (isValidRun(combNoJokers)) return true

  // If allowing jokers and wild cards, check if it combination is valid by considering them
  if (!pure) {
    console.log('kkk')
    // Is combination valid by considering the joker?
    if (jokers.length > 0) {
      // Sets with jokers are also valid without, so they would've been identified previously
      // Therefore only runs needs to be checked
      // Runs needs to be of the same suit
      const cardsSameSuit = areCardsSameSuit(combNoJokers)
      if (!cardsSameSuit) return false

      const gap = findGap(combNoJokers)
      if (gap.valid) return true
    } else {
      // No jokers, but maybe twos are being used as wild cards
      const twoIndices = new Array<number>()
      combNoJokers.forEach((c, i) => {
        if (getCardRank(c) == CardRank.Two) {
          twoIndices.push(i)
        }
      })

      // For each wild card, check if they can behave as a joker
      for (const twoi of twoIndices) {
        const cp = [...combNoJokers]
        cp.splice(twoi, 1)
        if (isValidSet(cp)) return true
        if (areCardsSameSuit(cp) && findGap(cp).valid) return true
      }
      return false
    }
  }
  return false
}
