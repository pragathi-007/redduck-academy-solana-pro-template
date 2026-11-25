use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use crate::{instructions::stake::settle_staker, Pool, Staker};

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"pool"],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        seeds = [b"staker", owner.key().as_ref()],
        bump = staker.bump,
        has_one = owner
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
}

pub fn claim(ctx: Context<Claim>) -> Result<()> {
    let pool_rpt = ctx.accounts.pool.reward_per_token;
    let staker = &mut ctx.accounts.staker;

    // 1. Settle and determine payout using the prior marker before advancing it.
    settle_staker(staker, pool_rpt)?;
    let amount = staker.pending;

    // 2. Clear pending and advance marker to current pool reward_per_token.
    staker.pending = 0;
    staker.reward_per_token_paid = pool_rpt;

    if amount == 0 {
        return Ok(());
    }

    let seeds: &[&[u8]] = &[b"pool", &[ctx.accounts.pool.bump]];
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.owner_tokens.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    Ok(())
}
