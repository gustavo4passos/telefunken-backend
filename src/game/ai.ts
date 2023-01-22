import { messageAllGamePlayers } from '../messageHandlers'
import { assertIsDefined } from '../utils/assert'
import { Card } from './deck'
import { Game } from './game'
import { GameID, PlayerMove } from './gameState'
import MessageBuilder from '../messages/serverMessageBuilder'
import { storage } from './storage'

export const calculateMove = (cards: Array<Card>): PlayerMove => {
  return { melds: [], discards: cards[0], meldExtensions: {} }
}

const AI_PLAY_DELAY = 1000
const aiPlay = (game: Game, gameId: GameID) => {
  const currentPlayerId = game.playerTurn
  const currentPlayer = storage.players.get(currentPlayerId)
  assertIsDefined(currentPlayer)

  if (!currentPlayer.isAi) return

  const aiMove = calculateMove(game.playerCards[currentPlayer.id])

  game.executePlayerMove(currentPlayerId, aiMove)
  game.advance()

  messageAllGamePlayers(game, (p) => {
    return MessageBuilder.turnChanged(storage.extractClientGameData(gameId, p))
  })

  setTimeout(() => aiPlay(game, gameId), AI_PLAY_DELAY)
}

export const simulateAi = (game: Game, gameId: GameID) => {
  setTimeout(() => aiPlay(game, gameId), AI_PLAY_DELAY)
}
