use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use crate::{Pool, PoolError, Staker, REWARD_PRECISION};

pub fn settle_staker(staker: &mut Staker, pool_reward_per_token: u128) -> Result<()> {
    let diff = pool_reward_per_token
        .checked_sub(staker.reward_per_token_paid)
        .ok_or(PoolError::MathOverflow)?;

    if diff > 0 && staker.stake > 0 {
        let earned = (staker.stake as u128)
            .checked_mul(diff)
            .ok_or(PoolError::MathOverflow)?
            .checked_div(REWARD_PRECISION)
            .ok_or(PoolError::MathOverflow)?;
        let earned_u64 = u64::try_from(earned).map_err(|_| PoolError::MathOverflow)?;
        staker.pending = staker
            .pending
            .checked_add(earned_u64)
            .ok_or(PoolError::MathOverflow)?;
    }

    staker.reward_per_token_paid = pool_reward_per_token;
    Ok(())
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"pool"],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Staker::INIT_SPACE,
        seeds = [b"staker", owner.key().as_ref()],
        bump
    )]
    pub staker: Account<'info, Staker>,
    #[account(address = pool.mint)]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = owner
    )]
    pub owner_tokens: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.owner_tokens.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    let pool_rpt = ctx.accounts.pool.reward_per_token;
    let staker = &mut ctx.accounts.staker;
    if staker.owner == Pubkey::default() {
        staker.owner = ctx.accounts.owner.key();
        staker.bump = ctx.bumps.staker;
    }

    // Settle pending rewards before changing stake.
    settle_staker(staker, pool_rpt)?;

    staker.stake = staker
        .stake
        .checked_add(amount)
        .ok_or(PoolError::MathOverflow)?;

    let pool = &mut ctx.accounts.pool;
    pool.total_staked = pool
        .total_staked
        .checked_add(amount)
        .ok_or(PoolError::MathOverflow)?;

    Ok(())
}
