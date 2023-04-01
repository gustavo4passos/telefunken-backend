import { Card, createShuffledDeck, shuffleDeck } from './deck'
import {
  DealConstraint,
  DealEndState,
  GameState,
  INITIAL_N_CHIPS,
  INVALID_PLAYER_ID,
  Meld,
  MeldID,
  PlayerID,
  PlayerMove,
  ServerGameData
} from './gameState'
import { isValidCombination, isValidExtension } from './combinations'
import { Logger } from '../utils/logger'
import { getNiceStringSetOfCards } from '../utils/print'
import { DEAL_CONSTRAINTS, NUM_DEALS } from './constraints'

export const INVALID_TURN = -1
export const MAX_NUM_PLAYERS = 4
export const MIN_NUM_PLAYERS = 2
const NUM_CARDS = 54 * 2
const DEAL_SIZE = 13
export const TURN_CHANGE_DELAY = 1000

export enum GameAdvanceState {
  Invalid,
  TurnChanged,
  DealChanged,
  GameEnded
}

export class Game implements ServerGameData {
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
  extraRoundStartedFromTurn: number

  constructor(owner: PlayerID) {
    this.owner = owner
    this.state = GameState.WaitingForPlayers
    this.players = [owner]
    this.deck = createShuffledDeck(NUM_CARDS)
    this.deal = -1
    this.dealer = INVALID_PLAYER_ID
    this.playerTurn = INVALID_PLAYER_ID
    this.melds = { [owner]: [] }
    this.playerCards = { [owner]: [] }
    this.discardPile = []
    this.dealConstraints = this.getDealsConstraints()
    this.dealConstraintCompliance = {
      [owner]: this.buildNegativeDealConstraintComplianceArray(NUM_DEALS)
    }
    this.dealsEndState = []
    this.boughtThisRound = {}
    this.boughtThisRound[owner] = false
    this.currentDealTurn = 0
    this.playerChips = { [owner]: INITIAL_N_CHIPS }
    this.extraRoundStartedFromTurn = INVALID_TURN
  }

  addPlayer(playerId: PlayerID): boolean {
    if (this.players.length > MAX_NUM_PLAYERS) return false // Game is full
    if (this.state != GameState.WaitingForPlayers) return false
    if (this.players.indexOf(playerId) != -1) return false // Player is already in the game

    this.players.push(playerId)
    this.melds[playerId] = []
    this.playerCards[playerId] = []
    this.dealConstraintCompliance[playerId] =
      this.buildNegativeDealConstraintComplianceArray(NUM_DEALS)

    this.boughtThisRound[playerId] = false
    this.playerChips[playerId] = INITIAL_N_CHIPS

    return true
  }

  startGame(): boolean {
    if (!this.canGameBeStarted()) return false
    this.state = GameState.InProgress
    this.deal = 0
    // Select a random player to be the dealer
    const randomDealerIndex = Math.floor(Math.random() * this.players.length)
    this.dealer = this.players[randomDealerIndex]
    // The player to the right of the dealer starts
    const startingPlayerIndex = (randomDealerIndex + 1) % this.players.length

    this.dealPlayerCards()

    this.playerTurn = this.players[startingPlayerIndex]
    this.discardPile.push(this.deck.splice(-1)[0])
    this.playerCards[this.playerTurn].push(this.deck.splice(-1)[0])
    this.dealsEndState.push(this.createEmptyDealEndState())
    return true
  }

  isFull() {
    return this.players.length >= MAX_NUM_PLAYERS
  }

  // If any part of the move is invalid, whole move is ignored
  executePlayerMove(playerId: PlayerID, playerMove: PlayerMove) {
    const [areModificationsValid, updatedPlayerCards, updatedMelds] =
      this.areModificationsValid(playerMove, playerId)

    if (
      !areModificationsValid ||
      updatedPlayerCards == undefined ||
      updatedMelds == undefined
    )
      return false

    // If player is trying to meld, check if meld is valid
    if (!this.canPlayerMeld(playerId, playerMove.melds, updatedPlayerCards))
      return false

    const totalCardsmelded = playerMove.melds.reduce((p, m) => p + m.length, 0)
    const totalCardsInExtensions = playerMove.meldModifications.reduce(
      (p, m) => p + (m.data.kind == 'extension' ? 1 : 0),
      0
    )

    // Player can only skip discarding if melds + extensions leave them with an empty hand
    if (
      totalCardsmelded + totalCardsInExtensions < updatedPlayerCards.length &&
      playerMove.discards == null
    ) {
      Logger.logError(
        "Player can't play because they're trying not to discard even though play does not empty their hand"
      )
      return false
    }

    // Player is legally trying to discard
    // TODO: This do not consider if the player discard is in one of their current melds!
    if (
      playerMove.discards != null &&
      !this.canPlayerDiscard(updatedPlayerCards, playerMove.discards)
    ) {
      Logger.logError("Player can't play because discard is invalid")
      return false
    }

    // Play is valid, update player cards and melds
    this.melds = updatedMelds
    this.playerCards[playerId] = updatedPlayerCards
    if (playerMove.discards != null) {
      // Add discard to discard pile and remove it from player's hand
      this.discardPile.push(playerMove.discards)
      const cardIndex = this.playerCards[playerId].findIndex(
        (c) => c == playerMove.discards
      )
      this.playerCards[playerId].splice(cardIndex, 1)
    }

    // Add melds from moves to the player melds and remove it from their hand
    for (const meld of playerMove.melds) {
      this.melds[playerId].push(meld)
      this.playerCards[playerId] = this.playerCards[playerId].filter(
        (c) => meld.find((mc) => c == mc) == undefined
      )
    }

    // At this point, if melds are not empty, it also means the player have satisfied the deal constraint
    if (playerMove.melds.length > 0)
      this.dealConstraintCompliance[playerId][this.deal] = true

    if (playerMove.discards == null)
      this.extraRoundStartedFromTurn = this.currentDealTurn

    return true
  }

  // Check if:
  // * Check if player has those cards
  // * Check if meld is valid
  // * Check if meld can be played at this point of the turn
  canPlayerMeld(
    playerId: PlayerID,
    melds: Array<Meld>,
    playerCards: Array<Card>
  ) {
    // No melds are always ok
    if (melds.length == 0) return true

    // Can't meld on first player turn
    if (this.isFirstDealTurn(this.currentDealTurn)) return false

    for (const meld of melds) {
      for (const card of meld) {
        if (playerCards.find((c) => c == card) == undefined) {
          Logger.logError(
            `Player can't meld because they do not have the card: ${card}`
          )
          console.log('Player cards: ', playerCards)
          return false
        }
      }
    }

    if (!this.dealConstraintCompliance[playerId][this.deal]) {
      const dealConstraint = this.dealConstraints[this.deal]
      if (melds.length != dealConstraint.size) {
        Logger.logError(
          `Player can't meld because they it does not satisfy the deal constraint size`
        )
        return false
      }

      for (const meld of melds)
        if (
          isValidCombination(meld, dealConstraint.combinationConstraint)
            .length == 0
        ) {
          Logger.logError(
            `Player can't meld because they it is an invalid combination for the deal constraint - ${getNiceStringSetOfCards(
              meld
            )}`
          )
          return false
        }
    } else {
      for (const meld of melds)
        if (isValidCombination(meld).length == 0) {
          Logger.logError(
            `Player can't meld because they it is an invalid combination`
          )
          return false
        }
    }

    return true
  }

  areModificationsValid(
    playerMove: PlayerMove,
    playerId: PlayerID
  ): [
    boolean,
    Array<Card> | undefined,
    Record<PlayerID, Array<Meld>> | undefined
  ] {
    // For modifications to be valid:
    // 1. All hand-to-meld must be in player hands
    // 2. All extensions must come for player hands
    // 3. After changes, all melds must remain valid
    // 4. All meld-to-hand must be in current move melds

    const { meldModifications } = playerMove
    let playerCards = [...this.playerCards[playerId]]
    const melds: Record<PlayerID, Array<Meld>> = {}
    for (const pid in this.melds) {
      melds[pid] = []
      for (const m of this.melds[pid]) melds[pid].push([...m])
    }

    const meldToHandCards: Array<Card> = []
    const handToMeldCards: Array<Card> = []
    const meldsModified = new Set<[PlayerID, MeldID]>()

    // 1. All hand-to-meld must be in player hands
    // 2. All extensions must come for player hands
    for (const m of meldModifications) {
      const { meldId, meldPlayerId } = m
      switch (m.data.kind) {
        case 'replacement': {
          const { meldToHand, handToMeld } = m.data

          if (melds[playerId][meldId].findIndex((c) => c == meldToHand) == -1) {
            Logger.logError(
              `Can't replace card ${getNiceStringSetOfCards([
                meldToHand
              ])} in meld ${meldId} of player ${playerId} because card is not in meld`
            )
            return [false, undefined, undefined]
          }

          if (playerCards.findIndex((c) => c == handToMeld) == -1) {
            Logger.logError(
              `Can't replace card ${getNiceStringSetOfCards([
                handToMeld
              ])} in meld ${meldId} of player ${playerId} because player is not holding that card`
            )
            return [false, undefined, undefined]
          }

          // Note that meldToHand cards are not added to player hand, because they can only be used for melding
          // so they'll only be checked against melds
          playerCards = playerCards.filter((c) => c != handToMeld)
          melds[playerId][meldId] = [
            ...melds[playerId][meldId],
            handToMeld
          ].filter((c) => c != meldToHand)

          meldsModified.add([playerId, meldId])
          meldToHandCards.push(meldToHand)
          handToMeldCards.push(handToMeld)
          break
        }
        case 'extension': {
          const { card } = m.data
          const playerCardsLengthBeforeRemoval = playerCards.length
          playerCards = playerCards.filter((c) => c != card)
          // Card isn't in player hand
          if (playerCards.length != playerCardsLengthBeforeRemoval - 1) {
            Logger.logError(
              `Extension card ${getNiceStringSetOfCards([
                card
              ])} is invalid in extension of player ${playerId}`
            )
            return [false, undefined, undefined]
          }

          melds[meldPlayerId][meldId].push(card)
          meldsModified.add([meldPlayerId, meldId])
          break
        }
      }
    }

    // 3. After changes, all melds must remain valid
    for (const meldModified of meldsModified) {
      const [playerId, meldId] = meldModified
      melds[playerId][meldId] = isValidCombination(melds[playerId][meldId])
      if (melds[playerId][meldId].length == 0) {
        Logger.logError(
          `Modifications of ${playerId} are invalid because they make meld ${meldId} invalid`
        )

        return [false, undefined, undefined]
      }
    }

    // 4. All meld-to-hand must be in current move melds
    for (const card of meldToHandCards) {
      if (
        playerMove.melds.findIndex((m) => m.findIndex((c) => c == card)) == 1
      ) {
        Logger.logError(`Modifications of ${playerId} are invalid, because card ${getNiceStringSetOfCards(
          [card]
        )} was replaced
          but was not added to a meld`)

        return [false, undefined, undefined]
      }
    }

    playerCards = [...playerCards, ...meldToHandCards]
    // Return new game state
    // Note that game state is not changed yet, since other parts of the player move still need to be verified
    return [true, playerCards, melds]
  }

  canPlayerExtend(
    playerId: PlayerID,
    meldExtensions: Record<MeldID, Array<Card>>
  ) {
    // No extensions are always ok
    if (Object.keys(meldExtensions).length == 0) return true

    // No extensions can be made before deal constraint has been satisfied
    if (!this.dealConstraintCompliance[playerId][this.deal]) return false

    // Player can extend, but are extensions valid?
    let playerCards = this.playerCards[playerId]
    const previousHandSize = playerCards.length

    for (const mids of Object.keys(meldExtensions)) {
      const meldId = Number(mids)
      const meldExtensionCards = meldExtensions[meldId]
      playerCards = playerCards.filter(
        (c) => meldExtensionCards.indexOf(c) == -1
      )

      // If no cards have been removed, player doesn't have at least one of the cards
      // in the extension, therefore extension is invalid
      if (previousHandSize == playerCards.length) return false

      // If card is already in the meld, play is illegal

      if (meldId >= this.melds[playerId].length) return false
      if (!isValidExtension(this.melds[playerId][meldId], meldExtensionCards))
        return false
    }

    return true
  }

  buyCard(playerId: PlayerID, card: Card) {
    // Player can only buy once per round
    if (this.boughtThisRound[playerId]) {
      Logger.logError("Player can't buy this round because they already bought")
      return false
    }

    if (this.playerChips[playerId] < 1) {
      Logger.logError(
        `Player ${playerId} can't buy because it has no more chips`
      )
      return false
    }
    // Check if discard pile is empty
    if (this.discardPile.length == 0) return false

    // Check if card is on top of the discard pile
    if (card != this.discardPile[this.discardPile.length - 1]) return false

    // Add card to player hand
    this.playerCards[playerId].push(this.discardPile.splice(-1)[0])

    // Also buy an extra card
    const cardBought = this.deck.splice(-1)[0]
    this.playerCards[playerId].push(cardBought)

    // If deck has been exhausted, shuffle discard pile
    if (this.deck.length == 0) {
      this.shuffleDiscardPileOntoDeck()
      this.discardPile = [this.deck.splice(-1)[0]]
    }

    this.dealsEndState[this.deal][playerId].cardsBought.push(cardBought)
    this.boughtThisRound[playerId] = true
    this.playerChips[playerId]--
    return true
  }

  canPlayerDiscard(playerCards: Array<Card>, card: Card) {
    return playerCards.find((c) => c == card) != undefined
  }

  dealPlayerCards() {
    for (const player of this.players) {
      this.playerCards[player] = this.deck.splice(-DEAL_SIZE)
    }
  }

  canGameBeStarted() {
    return this.players.length >= MIN_NUM_PLAYERS
  }

  getNextDraw(): Card {
    return this.deck[this.deck.length - 1]
  }

  advance(): GameAdvanceState {
    // Can't advance game that is not in progress
    if (this.state != GameState.InProgress) return GameAdvanceState.Invalid

    this.advanceTurn()

    // Check if deal ended
    if (
      (this.isExtraRound() && this.isLastTurnOfExtraRound()) ||
      (!this.isExtraRound() && this.playerCards[this.playerTurn].length == 0)
    ) {
      this.handleDealEnd()

      // Game has finished
      if (this.deal == NUM_DEALS) {
        this.state = GameState.Finished
        return GameAdvanceState.GameEnded
      }
      return GameAdvanceState.DealChanged
    } else {
      this.prepareNextTurn()
      return GameAdvanceState.TurnChanged
    }
  }

  prepareNextTurn() {
    // If deck has been exhausted, shuffle discard pile
    if (this.deck.length == 0) {
      this.shuffleDiscardPileOntoDeck()
      this.discardPile = [this.deck.splice(-1)[0]]
    }

    const nextDraw = this.deck.splice(-1)[0]
    this.playerTurn = this.getNextTurnPlayer()
    this.playerCards[this.playerTurn].push(nextDraw)

    if (this.currentDealTurn % this.players.length == 0) this.resetBuyStatus()
  }

  advanceTurn() {
    this.currentDealTurn++
  }

  handleDealEnd() {
    this.storeDealEndState()
    this.prepareNextDeal()
  }

  resetBuyStatus() {
    this.players.forEach((p) => (this.boughtThisRound[p] = false))
  }

  isExtraRound() {
    return this.extraRoundStartedFromTurn != INVALID_TURN
  }

  isLastTurnOfExtraRound() {
    return (
      this.currentDealTurn ==
      this.extraRoundStartedFromTurn + this.players.length
    )
  }

  storeDealEndState() {
    // Store players remaining cards and melds
    // Cards bought are already stored everytime the player buy a card
    for (const playerId of this.players) {
      this.dealsEndState[this.deal][playerId].remainingCards =
        this.playerCards[playerId]
      this.dealsEndState[this.deal][playerId].melds = this.melds[playerId]
    }
  }

  prepareNextDeal() {
    this.deal++

    this.deck = createShuffledDeck(NUM_CARDS)
    this.discardPile = [this.deck.splice(-1)[0]]
    // The player to the right of the dealer starts
    const dealerIndex = this.players.indexOf(this.dealer)
    const startingPlayerIndex = (dealerIndex + 1) % this.players.length

    this.dealPlayerCards()

    this.playerTurn = this.players[startingPlayerIndex]
    this.playerCards[this.playerTurn].push(this.deck.splice(-1)[0])

    // Reset melds
    this.players.forEach((p) => (this.melds[p] = []))

    // Reset buy status
    this.players.forEach((p) => (this.boughtThisRound[p] = false))

    // Create empty deal state
    this.dealsEndState.push(this.createEmptyDealEndState())

    this.currentDealTurn = 0
    this.extraRoundStartedFromTurn = INVALID_TURN
  }

  getNextTurnPlayer() {
    const nextPlayerIndex =
      (this.getPlayerIndex(this.playerTurn) + 1) % this.players.length

    return this.players[nextPlayerIndex]
  }

  // Searching for the player index every turn seems like unecessary work
  // But since there's only 2-4 players, this will be considered ok
  getPlayerIndex(playerId: PlayerID): number {
    return this.players.findIndex((p) => p == playerId)
  }

  isPlayerInGame(playerId: PlayerID): boolean {
    return this.players.find((p) => p == playerId) != undefined
  }

  doMeldsSatisfyDealConstraints(
    dealConstraint: DealConstraint,
    melds: Array<Meld>
  ): boolean {
    if (melds.length != dealConstraint.size) return false
    for (const meld of melds) {
      if (
        isValidCombination(meld, dealConstraint.combinationConstraint).length ==
        0
      )
        return false
    }
    return true
  }

  getDealsConstraints(): Array<DealConstraint> {
    return DEAL_CONSTRAINTS
  }

  buildNegativeDealConstraintComplianceArray(nDeals: number): Array<boolean> {
    return [...Array(nDeals)].map(() => false)
  }

  shuffleDiscardPileOntoDeck() {
    this.deck = shuffleDeck(this.discardPile)
    this.discardPile = []
  }

  createEmptyDealEndState() {
    const emptyDealEndState: DealEndState = {}

    this.players.forEach(
      (p) =>
        (emptyDealEndState[p] = {
          remainingCards: [],
          melds: [],
          cardsBought: []
        })
    )

    return emptyDealEndState
  }

  isFirstDealTurn(turn: number) {
    return Math.floor(turn / this.players.length) < 1
  }
}

export interface GameRoom {
  owner: PlayerID
  address: string
  game: Game
}
export { PlayerMove }
