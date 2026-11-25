use anchor_lang::prelude::*;

pub const REWARD_PRECISION: u128 = 1_000_000_000_000;

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub total_staked: u64,
    pub reward_per_token: u128,
    pub bump: u8,
}
