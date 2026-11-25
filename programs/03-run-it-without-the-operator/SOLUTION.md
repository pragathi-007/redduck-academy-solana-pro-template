# Solution: Run It Without the Operator

## Why the result of the claim does not depend on the caller
In `claim`, the `caller` is only a transaction signer who pays the Solana network fee and receives the caller fee in `caller_tokens`. The beneficiary is locked to `user.owner` via the PDA seed `["user", user.owner.as_ref()]`, and `user_tokens` is constrained by `token::authority = user.owner`. The payout amount comes strictly from `user.pending`, which is immediately set to `0` before transferring tokens so no caller can redirect funds or replay a claim.

## How the caller's reward is sized
The caller fee is calculated as 1% (`100` bps) of `user.pending` using checked `u128` arithmetic, then capped at `MAX_CALLER_FEE` (`1_000_000` base units) and bounded by the total pending payout. This gives third-party executors enough incentive to cover transaction gas fees while ensuring the beneficiary always receives the vast majority of their reward, even on large payouts.

## What still needs the admin and why
Only `initialize` and `accrue` (and any future configuration updates) still require `config.admin`:
- `initialize` sets up the protocol's initial configuration, vault, oracle public key, and maximum price age.
- `accrue` determines how many reward tokens a user has earned from off-chain protocol activity, which cannot be derived permissionlessly on-chain without an authoritative reward allocator.
Neither reward distribution (`claim`) nor price updates (`set_price`) nor purchases (`buy`) require the admin or any operator bot.