use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_SYSVAR_ID,
};

use crate::{Config, RewardsError};

pub struct Ed25519Signed {
    pub pubkey: Pubkey,
    pub message: Vec<u8>,
}

pub fn parse_ed25519(ix: &Instruction) -> Result<Ed25519Signed> {
    require_keys_eq!(ix.program_id, ed25519_program::ID, RewardsError::NotEd25519);
    let d = &ix.data;
    require!(d.len() >= 16 && d[0] == 1, RewardsError::MalformedEd25519);
    let u16_at = |i: usize| u16::from_le_bytes([d[i], d[i + 1]]) as usize;
    let (sig_ix, pk_off, pk_ix) = (u16_at(4), u16_at(6), u16_at(8));
    let (msg_off, msg_size, msg_ix) = (u16_at(10), u16_at(12), u16_at(14));
    require!(
        sig_ix == 0xffff && pk_ix == 0xffff && msg_ix == 0xffff,
        RewardsError::MalformedEd25519
    );
    require!(
        d.len() >= pk_off + 32 && d.len() >= msg_off + msg_size,
        RewardsError::MalformedEd25519
    );
    let mut pubkey = [0u8; 32];
    pubkey.copy_from_slice(&d[pk_off..pk_off + 32]);
    Ok(Ed25519Signed {
        pubkey: Pubkey::from(pubkey),
        message: d[msg_off..msg_off + msg_size].to_vec(),
    })
}

#[derive(Accounts)]
pub struct SetPrice<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: Verified via address constraint against the instructions sysvar
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions: UncheckedAccount<'info>,
}

pub fn set_price(ctx: Context<SetPrice>) -> Result<()> {
    let ixs = &ctx.accounts.instructions.to_account_info();
    let current_ix_idx = load_current_index_checked(ixs)? as usize;
    require!(current_ix_idx > 0, RewardsError::NotEd25519);

    let ed25519_ix = load_instruction_at_checked(current_ix_idx - 1, ixs)?;
    let parsed = parse_ed25519(&ed25519_ix)?;

    let config = &mut ctx.accounts.config;
    require_keys_eq!(parsed.pubkey, config.oracle, RewardsError::InvalidOracle);

    require!(parsed.message.len() == 16, RewardsError::MalformedEd25519);
    let price = u64::from_le_bytes(parsed.message[0..8].try_into().unwrap());
    let publish_time = i64::from_le_bytes(parsed.message[8..16].try_into().unwrap());

    let now = Clock::get()?.unix_timestamp;
    require!(publish_time <= now, RewardsError::InvalidPriceTimestamp);
    require!(
        now - publish_time <= config.max_price_age,
        RewardsError::StalePrice
    );
    require!(
        publish_time > config.price_time,
        RewardsError::InvalidPriceTimestamp
    );

    config.price = price;
    config.price_time = publish_time;
    Ok(())
}