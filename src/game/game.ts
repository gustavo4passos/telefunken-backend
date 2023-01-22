import { Card, createShuffledDeck, shuffleDeck } from './deck'
import {
  DealConstraint,
  DealEndState,
  GameState,
  INVALID_PLAYER_ID,
  Meld,
  MeldID,
  PlayerID,
  PlayerMove,
  ServerGameData
} from './gameState'
import { buildCombinationConstraint, isValidCombination } from './combinations'

export const MAX_NUM_PLAYERS = 4
const MIN_NUM_PLAYERS = 2
const NUM_CARDS = 54 * 2
const DEAL_SIZE = 13
const NUM_DEALS = 6

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
  playerTurn: PlayerID
  melds: Record<PlayerID, Array<Meld>>
  playerCards: Record<PlayerID, Array<Card>>
  discardPile: Array<Card>
  dealConstraints: Array<DealConstraint>
  dealConstraintCompliance: Record<PlayerID, Array<boolean>>
  dealsEndState: Array<DealEndState>

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
    return true
  }

  isFull() {
    return this.players.length >= MAX_NUM_PLAYERS
  }

  // If any part of the move is invalid, whole move is ignored
  executePlayerMove(playerId: PlayerID, playerMove: PlayerMove) {
    // If player is trying to meld, check if meld is valid
    if (!this.canPlayerMeld(playerId, playerMove.melds)) return false

    // If player is trying to extend, check if meld is valid
    if (!this.canPlayerExtend(playerId, playerMove.meldExtensions)) return false

    const totalCardsmelded = playerMove.melds.reduce((p, m) => p + m.length, 0)
    const totalCardsInExtensions = Object.keys(
      playerMove.meldExtensions
    ).reduce((p, e) => p + playerMove.meldExtensions[Number(e)].length, 0)

    // Player can only skip discarding if melds + extensions leave them with an empty hand
    if (
      totalCardsmelded + totalCardsInExtensions <
        this.playerCards[playerId].length &&
      playerMove.discards == null
    ) {
      return false
    }

    // Player is legally trying to discard
    if (playerMove.discards != null) {
      // TODO: This do not consider if the player discard is in one of their current melds!
      if (!this.canPlayerDiscard(playerId, playerMove.discards)) return false

      // Add discard to discard pile and remove it from player's hand
      this.discardPile.push(playerMove.discards)
      const cardIndex = this.playerCards[playerId].findIndex(
        (c) => c == playerMove.discards
      )
      this.playerCards[playerId].splice(cardIndex, 1)
    }

    // At this point, play is valid
    // Add melds from moves to the player melds and remove it from their hand
    for (const meld of playerMove.melds) {
      this.melds[playerId].push(meld)
      this.playerCards[playerId] = this.playerCards[playerId].filter(
        (c) => meld.find((mc) => c == mc) == undefined
      )
    }

    // And add extensions to melds
    for (const mis of Object.keys(playerMove.meldExtensions)) {
      const meldId = Number(mis)
      const meld = this.melds[playerId][meldId]
      this.melds[playerId][meldId] = [
        ...meld,
        ...playerMove.meldExtensions[meldId]
      ]

      // Remove clards from player hand
      this.playerCards[playerId] = this.playerCards[playerId].filter(
        (c) => playerMove.meldExtensions[meldId].indexOf(c) == -1
      )
    }

    // At this point, if melds are not empty, it also means the player have satisfied the deal constraint
    if (playerMove.melds.length > 0)
      this.dealConstraintCompliance[playerId][this.deal] = true

    return true
  }

  // Check if:
  // * Check if player has those cards
  // * Check if meld is valid
  // * Check if meld can be played at this point of the turn
  canPlayerMeld(playerId: PlayerID, melds: Array<Meld>) {
    // No melds are always ok
    if (melds.length == 0) return true

    const playerCards = this.playerCards[playerId]
    for (const meld of melds) {
      for (const card of meld) {
        if (!playerCards.find((c) => c == card)) return false
      }
    }

    if (!this.dealConstraintCompliance[playerId][this.deal]) {
      const dealConstraint = this.dealConstraints[this.deal]
      if (melds.length != dealConstraint.size) return false

      for (const meld of melds)
        if (!isValidCombination(meld, dealConstraint.combinationConstraint)) {
          return false
        }
    } else {
      for (const meld of melds) if (!isValidCombination(meld)) return false
    }

    return true
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
      if (
        !this.isExtensionValid(this.melds[playerId][meldId], meldExtensionCards)
      )
        return false
    }

    return true
  }

  isExtensionValid(meld: Meld, extensionCards: Array<Card>) {
    // Meld id can't be outside melds array bounds
    return isValidCombination([...meld, ...extensionCards])
  }

  canPlayerDiscard(playerId: PlayerID, card: Card) {
    return this.playerCards[playerId].find((c) => c == card) != undefined
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
    // Can't advance game that is not on progress
    if (this.state != GameState.InProgress) return GameAdvanceState.Invalid

    // Deal ended
    if (this.playerCards[this.playerTurn].length == 0) {
      this.handleDealEnd()

      // Game has finished
      if (this.deal == NUM_DEALS) {
        this.state = GameState.Finished
        return GameAdvanceState.GameEnded
      }
      return GameAdvanceState.DealChanged
    } else {
      // If deck has been exhausted, shuffle discard pile
      if (this.deck.length == 0) {
        this.shuffleDiscardPileOntoDeck()
        this.discardPile = [this.deck.splice(-1)[0]]
      }
      const nextDraw = this.deck.splice(-1)[0]
      this.playerTurn = this.getNextTurnPlayer()
      this.playerCards[this.playerTurn].push(nextDraw)
      return GameAdvanceState.TurnChanged
    }
  }

  handleDealEnd() {
    this.storeDealEndState()
    this.prepareNextDeal()
  }

  storeDealEndState() {
    const dealEndState: DealEndState = {}
    for (const playerId of this.players) {
      dealEndState[playerId] = {
        remainingCards: this.playerCards[playerId],
        melds: this.melds[playerId]
      }
    }
    this.dealsEndState.push(dealEndState)
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
      if (!isValidCombination(meld, dealConstraint.combinationConstraint))
        return false
    }
    return true
  }

  getDealsConstraints(): Array<DealConstraint> {
    return [
      { size: 2, combinationConstraint: buildCombinationConstraint(3) },
      { size: 1, combinationConstraint: buildCombinationConstraint(4) },
      { size: 2, combinationConstraint: buildCombinationConstraint(4) },
      { size: 1, combinationConstraint: buildCombinationConstraint(5) },
      { size: 2, combinationConstraint: buildCombinationConstraint(5) },
      { size: 1, combinationConstraint: buildCombinationConstraint(6) }
    ]
  }

  buildNegativeDealConstraintComplianceArray(nDeals: number): Array<boolean> {
    return [...Array(nDeals)].map(() => false)
  }

  shuffleDiscardPileOntoDeck() {
    this.deck = shuffleDeck(this.discardPile)
    this.discardPile = []
  }
}

export interface GameRoom {
  owner: PlayerID
  address: string
  game: Game
}
export { PlayerMove }
