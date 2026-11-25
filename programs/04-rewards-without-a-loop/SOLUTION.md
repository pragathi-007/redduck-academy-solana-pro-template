# Solution

## The two numbers

- **Pool (`Pool.reward_per_token`, `u128`)**: Accumulates `reward * REWARD_PRECISION / total_staked` (with `REWARD_PRECISION = 10^12`) whenever rewards are added while `total_staked > 0`.
- **Staker (`Staker.reward_per_token_paid`, `u128`)**: Records the pool's `reward_per_token` marker at the staker's most recent settlement (`stake`, `unstake`, or `claim`), alongside `Staker.pending` (`u64`) for accrued unclaimed tokens.
- **Owed reward formula**:
  `earned = (stake * (pool.reward_per_token - staker.reward_per_token_paid)) / REWARD_PRECISION`
  `total_owed = staker.pending + earned`

## Settle first

`stake` and `unstake` settle accrued rewards at the staker's **existing** `stake` before updating `staker.stake` and `pool.total_staked`.

For example, suppose a staker has `100` staked, `pool.reward_per_token` increases by `0.1 * REWARD_PRECISION` (so `10` tokens are owed), and the staker deposits `300` more tokens to reach `400`:
- **Settle first (correct)**: `100 * 0.1 = 10` tokens are locked into `staker.pending`, `reward_per_token_paid` advances, and only then does `stake` become `400`.
- **Change stake first (wrong)**: If `stake` became `400` before settling, `400 * 0.1 = 40` tokens would be credited—overpaying `30` tokens from rewards earned on `100` tokens. Similarly, unstaking before settling would underpay or lose rewards earned prior to withdrawal.

## The staker nobody touches

A staker who never claims while multiple rewards arrive and other stakers stake, unstake, or claim is untouched by `add_rewards` (which only updates `pool.reward_per_token`) and by other stakers' instructions (which only modify their own `Staker` PDAs and `pool.total_staked`). Because `pool.reward_per_token` only increases and `staker.reward_per_token_paid` stays frozen at the staker's last settlement, `pool.reward_per_token - staker.reward_per_token_paid` captures every reward round in between. When that staker finally calls `claim`, `stake` is multiplied by the full cumulative delta to pay the exact share owed.

## What lazy loading does not cover

Updating `pool.reward_per_token` is still triggered by `add_rewards` (or external reward funding/harvesting), and if rewards must be swept, rolled over, or distributed on a schedule without waiting for an admin/funder action, an automated or paid executor/keeper transaction is still needed to invoke the reward instruction.
