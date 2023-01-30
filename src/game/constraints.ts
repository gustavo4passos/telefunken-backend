// -1 for no size constraint
export const NO_SIZE_CONTRAINT = -1
export interface CombinationConstraint {
  sizeConstraint: number
  pure: boolean
}

export const buildCombinationConstraint = (size: number, pure = false) => {
  return { sizeConstraint: size, pure }
}
export const DEAL_CONSTRAINTS = [
  { size: 2, combinationConstraint: buildCombinationConstraint(3) },
  { size: 1, combinationConstraint: buildCombinationConstraint(4) }
  // { size: 2, combinationConstraint: buildCombinationConstraint(4) }
  // { size: 1, combinationConstraint: buildCombinationConstraint(5) },
  // { size: 2, combinationConstraint: buildCombinationConstraint(5) },
  // { size: 1, combinationConstraint: buildCombinationConstraint(6) }
]

export const NUM_DEALS = DEAL_CONSTRAINTS.length
