use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Staker {
    pub owner: Pubkey,
    pub stake: u64,
    /// Rewards settled for this staker and not yet claimed.
    pub pending: u64,
    /// Pool `reward_per_token` value at the staker's last settlement.
    pub reward_per_token_paid: u128,
    pub bump: u8,
}
