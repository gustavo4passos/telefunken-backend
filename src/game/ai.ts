import { communicateGameAdvanceState } from '../messageHandlers'
import { assertIsDefined } from '../utils/assert'
import { MAX_MELD_SIZE, MIN_MELD_SIZE, rankSortFn } from './combinations'
import { Card, CardRank, CardSuit, getCardRank, getCardSuit } from './deck'
import { Game } from './game'
import { DealConstraint, GameID, Meld, PlayerMove } from './gameState'
import { storage } from './storage'

export const calculateMove = (cards: Array<Card>): PlayerMove => {
  return {
    melds: [],
    discards: cards[0],
    meldModifications: []
  }
}

const AI_PLAY_DELAY = 2000

// TODO: AI Should buy when it makes sense
// TODO: AI Should also build suit combinations
export const calculateMoveSmart = (
  cards: Array<Card>,
  canMeld: boolean,
  dealConstraint?: DealConstraint
): PlayerMove => {
  let finalMelds: Array<Meld> = []

  if (canMeld) {
    const rankSortedCards: Record<CardRank, Array<Card>> = {
      [CardRank.Ace]: [],
      [CardRank.Two]: [],
      [CardRank.Three]: [],
      [CardRank.Four]: [],
      [CardRank.Five]: [],
      [CardRank.Six]: [],
      [CardRank.Seven]: [],
      [CardRank.Eight]: [],
      [CardRank.Nine]: [],
      [CardRank.Ten]: [],
      [CardRank.Jack]: [],
      [CardRank.Queen]: [],
      [CardRank.King]: []
    }
    const jokers = []

    for (const card of cards) {
      const s = getCardSuit(card)
      if (s == CardSuit.Joker) {
        jokers.push(card)
        continue
      }

      const r = getCardRank(card)
      if (rankSortedCards[r] == undefined) rankSortedCards[r] = []

      rankSortedCards[r].push(card)
    }

    const validCombinationsRank: Array<CardRank> = []

    for (const rankStr in rankSortedCards) {
      const rank = Number(rankStr) as CardRank
      if (rankSortedCards[rank].length >= MIN_MELD_SIZE) {
        validCombinationsRank.push(rank)
        // If combination is too big, remove extra cards
        if (rankSortedCards[rank].length > MAX_MELD_SIZE) {
          rankSortedCards[rank] = rankSortedCards[rank].splice(0, MAX_MELD_SIZE)
        }
      }
      // If the combination is missing one card to be valid, test if we can add a joker
      else if (rankSortedCards[rank].length == 2 && jokers.length > 0) {
        rankSortedCards[rank].push(jokers.splice(0, 1)[0])
        validCombinationsRank.push(rank)
      }
    }

    const validMelds = []

    // Filter all valid melds according to combination constraint, if present
    for (const rank of validCombinationsRank) {
      if (dealConstraint != undefined) {
        // If meld is shorted than constraint requires, skip it
        if (
          rankSortedCards[rank].length <
          dealConstraint.combinationConstraint.sizeConstraint
        )
          continue

        // If meld is longer than constraint requires, trim it
        if (
          rankSortedCards[rank].length >
          dealConstraint.combinationConstraint.sizeConstraint
        ) {
          rankSortedCards[rank].splice(
            0,
            dealConstraint.combinationConstraint.sizeConstraint
          )
        }
      }

      validMelds.push(rankSortedCards[rank])
    }

    if (dealConstraint != undefined) {
      if (validMelds.length >= dealConstraint.size) {
        // If there are more melds than the constraint accepts, trim it
        finalMelds = [...validMelds.splice(0, dealConstraint.size)]
      }
    } else finalMelds = validMelds
  }

  // Remove melds from player hand before discarding
  cards = cards.filter((c) => {
    for (const meld of finalMelds)
      if (meld.findIndex((cm) => cm == c) != -1) return false
    return true
  })

  return {
    melds: finalMelds,
    discards: cards[0],
    meldModifications: []
  }
}

const aiPlay = (game: Game, gameId: GameID) => {
  const currentPlayerId = game.playerTurn
  const currentPlayer = storage.players.get(currentPlayerId)
  assertIsDefined(currentPlayer)

  if (!currentPlayer.isAi) return

  const aiHasSatisfiedDealConstraint =
    game.dealConstraintCompliance[currentPlayer.id][game.deal]

  const dealConstraint = aiHasSatisfiedDealConstraint
    ? undefined
    : game.dealConstraints[game.deal]
  const aiMove = calculateMoveSmart(
    game.playerCards[currentPlayer.id],
    !game.isFirstDealTurn(game.currentDealTurn),
    dealConstraint
  )

  game.executePlayerMove(currentPlayerId, aiMove)
  const gameAdvanceState = game.advance()

  communicateGameAdvanceState(gameAdvanceState, game, gameId)

  setTimeout(() => aiPlay(game, gameId), AI_PLAY_DELAY)
}

export const simulateAi = (game: Game, gameId: GameID) => {
  setTimeout(() => aiPlay(game, gameId), AI_PLAY_DELAY)
}
