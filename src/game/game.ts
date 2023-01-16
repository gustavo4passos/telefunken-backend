import { Card, createShuffledDeck } from './deck'
import {
  GameState,
  INVALID_PLAYER_ID,
  Meld,
  PlayerID,
  ServerGameData
} from './gameState'
import { isValidCombination } from './combinations'

export const MAX_NUM_PLAYERS = 4
const MIN_NUM_PLAYERS = 2
const NUM_CARDS = 54 * 2
const DEAL_SIZE = 13

export interface PlayerMove {
  melds: Array<Meld>
  discards: Card
}

export class Game implements ServerGameData {
  state: GameState
  deck: Array<number>
  players: Array<PlayerID>
  owner: PlayerID
  round: number
  dealer: PlayerID
  playerTurn: PlayerID
  melds: Record<PlayerID, Array<Meld>>
  playerCards: Record<PlayerID, Array<Card>>
  discardPile: Array<Card>

  constructor(owner: PlayerID) {
    this.owner = owner
    this.state = GameState.WaitingForPlayers
    this.players = [owner]
    this.deck = createShuffledDeck(NUM_CARDS)
    this.round = -1
    this.dealer = INVALID_PLAYER_ID
    this.playerTurn = INVALID_PLAYER_ID
    this.melds = { [owner]: [] }
    this.playerCards = { [owner]: [] }
    this.discardPile = []
  }

  addPlayer(playerId: PlayerID): boolean {
    if (this.players.length > MAX_NUM_PLAYERS) return false
    if (this.state != GameState.WaitingForPlayers) return false

    this.players.push(playerId)
    this.melds[playerId] = []
    this.playerCards[playerId] = []

    return true
  }

  startGame(): boolean {
    if (!this.canGameBeStarted()) return false
    this.state = GameState.InProgress
    this.round = 0
    // Select a random player to be the dealer
    const randomDealerIndex = Math.floor(Math.random() * this.players.length)
    this.dealer = this.players[randomDealerIndex]
    // The player to the right of the dealer starts
    const startingPlayerIndex = (randomDealerIndex + 1) % this.players.length

    this.dealPlayerCards()

    this.playerTurn = this.players[startingPlayerIndex]
    this.playerCards[this.playerTurn].push(this.deck.splice(-1)[0])
    return true
  }

  isFull() {
    return this.players.length >= MAX_NUM_PLAYERS
  }

  // TODO: If there is anything wrong with the move, what to do?
  // Cancel whole move? Play partially?
  executePlayerMove(playerId: PlayerID, playerMove: PlayerMove) {
    // If player is trying to meld, check if meld is valid
    for (const meld of playerMove.melds) {
      if (this.canPlayerMeld(playerId, meld)) {
        this.melds[playerId].push(meld)
        this.playerCards[playerId] = this.playerCards[playerId].filter(
          (c) => meld.find((mc) => c == mc) == undefined
        )
      }
    }

    // Add card to discard pile
    // TODO: At this point, what to do if discard is invalid?
    if (this.canPlayerDiscard(playerId, playerMove.discards)) {
      this.discardPile.push(playerMove.discards)
      // Remove card from player hand
      const cardIndex = this.playerCards[playerId].findIndex(
        (c) => c == playerMove.discards
      )
      this.playerCards[playerId].splice(cardIndex, 1)
    }
  }

  // Check if:
  // * Check if player has those cards
  // * Check if meld is valid
  // * Check if meld can be played at this point of the turn
  canPlayerMeld(playerId: PlayerID, meld: Meld) {
    const playerCards = this.playerCards[playerId]
    for (const card of meld) {
      if (!playerCards.find((c) => c == card)) return false
    }

    // TODO: Implementation of melding logic
    return isValidCombination(meld)
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

  advance() {
    const nextDraw = this.deck.splice(-1)[0]
    this.playerTurn = this.getNextTurnPlayer()
    this.playerCards[this.playerTurn].push(nextDraw)
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
}

export interface GameRoom {
  owner: PlayerID
  address: string
  game: Game
}
