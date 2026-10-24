export function canAfford(state, amount) {
  return state.gold >= amount;
}

export function spendGold(state, amount) {
  if (!canAfford(state, amount)) return false;
  state.gold -= amount;
  return true;
}

export function rewardKill(state, amount) {
  state.gold += amount;
}
