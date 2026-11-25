use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use crate::{Pool, PoolError, REWARD_PRECISION};

#[derive(Accounts)]
pub struct AddRewards<'info> {
    #[account(mut)]
    pub funder: Signer<'info>,
    #[account(
        mut,
        seeds = [b"pool"],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,
    #[account(address = pool.mint)]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = funder
    )]
    pub funder_tokens: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn add_rewards(ctx: Context<AddRewards>, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }

    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.funder_tokens.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.funder.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    let pool = &mut ctx.accounts.pool;
    if pool.total_staked > 0 {
        let delta = (amount as u128)
            .checked_mul(REWARD_PRECISION)
            .ok_or(PoolError::MathOverflow)?
            .checked_div(pool.total_staked as u128)
            .ok_or(PoolError::MathOverflow)?;
        pool.reward_per_token = pool
            .reward_per_token
            .checked_add(delta)
            .ok_or(PoolError::MathOverflow)?;
    }

    Ok(())
}
