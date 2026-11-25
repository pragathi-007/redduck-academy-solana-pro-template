use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use crate::{Config, RewardsError, User};

const FEE_BPS: u128 = 100; // 1% caller fee
const MAX_CALLER_FEE: u64 = 1_000_000; // Capped caller fee

#[derive(Accounts)]
pub struct Claim<'info> {
    pub caller: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"user", user.owner.as_ref()],
        bump = user.bump,
    )]
    pub user: Account<'info, User>,
    #[account(address = config.mint)]
    pub mint: Account<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = user.owner)]
    pub user_tokens: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = caller)]
    pub caller_tokens: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"vault"], bump)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn claim(ctx: Context<Claim>) -> Result<()> {
    let total = ctx.accounts.user.pending;
    require!(total > 0, RewardsError::NothingToPay);

    ctx.accounts.user.pending = 0;

    let raw_fee = ((total as u128)
        .checked_mul(FEE_BPS)
        .ok_or(RewardsError::MathOverflow)?
        / 10_000) as u64;
    let fee = raw_fee.min(MAX_CALLER_FEE).min(total);
    let user_payout = total.checked_sub(fee).ok_or(RewardsError::MathOverflow)?;

    let seeds: &[&[u8]] = &[b"config", &[ctx.accounts.config.bump]];

    if user_payout > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.user_tokens.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                &[seeds],
            ),
            user_payout,
            ctx.accounts.mint.decimals,
        )?;
    }

    if fee > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.caller_tokens.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                &[seeds],
            ),
            fee,
            ctx.accounts.mint.decimals,
        )?;
    }

    Ok(())
}
