import { GameRequest, GameRequestType } from './gameMessages'

export const mRequestId = () => {
  return new GameRequest(GameRequestType.RequestID)
}
