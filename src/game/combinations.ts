import { CombinationConstraint, NO_SIZE_CONTRAINT } from './constraints'
import {
  Card,
  CardRank,
  CardSuit,
  getCardRank,
  getCardSuit,
  isJoker
} from './deck'
import { DealConstraint, Meld } from './gameState'

export const MIN_MELD_SIZE = 3
export const MAX_MELD_SIZE = 13

export interface RunGap {
  size: number
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
  const [cardsSameSuit] = areCardsSameSuit(rankSortedCards)
  if (!cardsSameSuit) return false

  for (let i = 1; i < rankSortedCards.length; i++) {
    // Cards must be consecutive
    const ra = getCardRank(rankSortedCards[i])
    const rb = getCardRank(rankSortedCards[i - 1])
    const distance = ra - rb
    if (distance != 1) return false
  }

  return true
}

export const areCardsSameSuit = (
  cards: Array<Card>
): [boolean, CardSuit | null] => {
  const s = getCardSuit(cards[0])
  for (const card of cards) if (s != getCardSuit(card)) return [false, null]
  return [true, s]
}

export interface CombinationEvaulation {
  valid: boolean
  gapPos: number
  wildCardPos: number
}

const placeWildCardInPureMeld = (
  validPureMeld: Meld,
  wildCards: Array<Card>
) => {
  // Fill at the end first, then beginning
  const lastCard = validPureMeld[validPureMeld.length - 1]
  const lastCardRank = getCardRank(lastCard)
  const spaceAtTheEnd: number = Number(CardRank.King) - Number(lastCardRank)
  const nonUsedWildCards = [...wildCards]
  console.log(nonUsedWildCards, 'before splice')
  const result = [
    ...validPureMeld,
    ...nonUsedWildCards.splice(
      0,
      Math.min(nonUsedWildCards.length, spaceAtTheEnd)
    )
  ]
  console.log(nonUsedWildCards, 'after splice')
  return [...nonUsedWildCards, ...result]
}

const placeWildCardsInGaps = (
  cards: Array<Card>,
  wildCards: Array<Card>,
  gaps: Array<RunGap>
) => {
  let beginningOffset = 0
  const nonUsedWcs = [...wildCards]
  const nonUsedCards = [...cards]
  let result: Array<Card> = []
  for (const gap of gaps) {
    const leftSide = nonUsedCards.splice(0, gap.pos - beginningOffset)
    beginningOffset = leftSide.length
    result = [...result, ...leftSide, ...nonUsedWcs.splice(0, gap.size)]
  }
  result = [...result, ...nonUsedCards]

  if (nonUsedWcs.length == 0) return result
  return placeWildCardInPureMeld(result, nonUsedWcs)
}

export const isValidCombination = (
  cards: Array<Card>,
  constraint: CombinationConstraint = {
    sizeConstraint: NO_SIZE_CONTRAINT,
    pure: false
  }
) => {
  const { sizeConstraint, pure } = constraint
  if (sizeConstraint != NO_SIZE_CONTRAINT && cards.length != sizeConstraint)
    return []
  // Without constraint, sets need can be between 3 and 6 cards long
  else if (cards.length < MIN_MELD_SIZE || cards.length > MAX_MELD_SIZE)
    return []

  // Separate the jokers from the combination
  const jokers = cards.filter((c) => isJoker(c))

  // Remove the jokers from the combination
  const combNoJokers = cards.filter((c) => !isJoker(c))

  // Wild card policy: Jokers can't be more than half of the cards
  if (jokers.length > combNoJokers.length) return []

  // Since most evaluations need the cards to be sort by rank, let's just sort them once here
  combNoJokers.sort(rankSortFn)

  if (pure) {
    // No jokers allowed in pure set
    if (jokers.length > 0) return []
  }

  // Check if combination is valid as a pure combination
  // (if it is valid as pure, it will still be by including the joker)
  if (isValidSet(combNoJokers)) {
    if (jokers.length == 0) return combNoJokers
    return [...combNoJokers, ...jokers]
  }
  if (isValidRun(combNoJokers)) {
    if (jokers.length == 0) return combNoJokers
    return placeWildCardInPureMeld(combNoJokers, jokers)
  }

  // If allowing jokers and wild cards, check if it combination is valid by considering them
  if (!pure) {
    // We only need to check valid sets where ALL the twos are wild cards, since if not, they would've been caught
    // in the set check before
    const combNoJokersNoTwos = combNoJokers.filter(
      (c) => getCardRank(c) != CardRank.Two
    )

    const twos = combNoJokers.filter((c) => getCardRank(c) == CardRank.Two)

    // If it is a valid set without the twos and wild cards, it will be a valid set with them, as long as
    // the number of wilds cards is valid
    if (
      isValidSet(combNoJokersNoTwos) &&
      twos.length + jokers.length <= combNoJokersNoTwos.length
    ) {
      return [...combNoJokersNoTwos, ...twos, ...jokers]
    }

    // Sets with jokers and twos also valid without them, so they would've been identified previously
    // Therefore only runs needs to be checked
    if (jokers.length > 0 || twos.length > 0) {
      // Runs needs to be of the same suit
      const [areSameSuit, suit] = areCardsSameSuit(combNoJokersNoTwos)
      if (!areSameSuit) return []

      // Since only runs are possible from here on out, discard it if it has a repeated card (gap == -1)
      // If there is a two of the same suit, check if it can be taking it's proper place
      // This is important because the number of wild cards is critical to determine if a combination is valid
      const twoSameSuitIndex = twos.findIndex((c) => getCardSuit(c) == suit)
      if (twoSameSuitIndex != -1) {
        const twosCopy = [...twos]
        const twoSameSuit = twosCopy.splice(twoSameSuitIndex, 1)[0]
        const jokersAndWildCards = [...twosCopy, ...jokers]
        const sortedWithSameSuitTwo = [...combNoJokersNoTwos, twoSameSuit]

        // Check if the number of wild cards is valid
        // There is a little optimization here: If the number of wild cards here is invalid
        // we don't even need to check using all twos as wild cards, since that number is even bigger (therefore the return)
        // But be aware: This is only valid if the wild card policy is of the type 'less than'
        if (jokersAndWildCards.length > sortedWithSameSuitTwo.length) return []
        sortedWithSameSuitTwo.sort(rankSortFn)

        const gapInfo = findGaps(sortedWithSameSuitTwo)

        // If it has a repeated card, it can't be a run
        if (gapInfo.negativeGap < 0) return []

        // Check if wild cards are enough to fit gaps
        if (gapInfo.totalGapSize <= jokersAndWildCards.length) {
          return placeWildCardsInGaps(
            sortedWithSameSuitTwo,
            jokersAndWildCards,
            gapInfo.gaps
          )
        }
      }

      // If no two is of the same suit, or it's not being used in its proper place, test all twos as wild cards
      const jokersAndWildCards = [...twos, ...jokers]
      // Check if the number of wild cards is vliad
      if (jokersAndWildCards.length > combNoJokersNoTwos.length) return []

      const gapInfo = findGaps(combNoJokersNoTwos)
      // If it has a repeated card, it can't be a run
      if (gapInfo.negativeGap < 0) return []

      if (gapInfo.totalGapSize > jokersAndWildCards.length) return []
      console.log(gapInfo)
      return placeWildCardsInGaps(
        combNoJokersNoTwos,
        jokersAndWildCards,
        gapInfo.gaps
      )
    }
  }
  return []
}

export enum CanMeldStatus {
  Invalid,
  Success,
  InvalidNumberOfMelds,
  InvalidCombination
}

export const doMeldsSatisfyDealConstraint = (
  melds: Array<Meld>,
  dealConstraint: DealConstraint
): CanMeldStatus => {
  if (dealConstraint.size != melds.length)
    return CanMeldStatus.InvalidNumberOfMelds

  for (const meld of melds)
    if (
      isValidCombination(meld, dealConstraint.combinationConstraint).length == 0
    )
      return CanMeldStatus.InvalidCombination

  return CanMeldStatus.Success
}

export const isValidExtension = (meld: Meld, extensionCards: Array<Card>) => {
  // Meld id can't be outside melds array bounds
  return isValidCombination([...meld, ...extensionCards])
}

interface GapsInfo {
  gaps: Array<RunGap>
  totalGapSize: number
  negativeGap: number
}

export const findGaps = (rankSortedCards: Array<Card>): GapsInfo => {
  const gapsInfo: GapsInfo = { gaps: [], totalGapSize: 0, negativeGap: 0 }

  for (let i = 1; i < rankSortedCards.length; i++) {
    const current = getCardRank(rankSortedCards[i])
    const previous = getCardRank(rankSortedCards[i - 1])
    const gap = Number(current) - Number(previous) - 1

    // Gap can be negative when there is a repeated card
    if (gap < 0) {
      gapsInfo.negativeGap = gap
    }
    if (gap == 0) continue

    if (gap > 0) gapsInfo.totalGapSize += gap
    gapsInfo.gaps.push({ size: gap, pos: i })
  }

  return gapsInfo
}
