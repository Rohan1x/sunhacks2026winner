use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::errors::RuleError;
use crate::state::*;

// Out-of-policy payments. Funds never move inside these instructions. The client sends the transfer and the
// decision in the same transaction, so each step is atomic:
//
//   request:  [transfer payer -> escrow] + [request_exception]          (hook allows deposits into escrow)
//   approve:  [approve_exception]        + [transfer escrow -> merchant] (issuer signs; hook allows escrow out)
//   reject:   [reject_exception]         + [transfer escrow -> issuer]   (forfeit: the payer is charged)
//
// Why no CPI: a Token-2022 transfer that runs this program's own transfer hook cannot be started from inside
// this program (the runtime rejects the re-entrant call). Keeping transfers at the top level avoids that.
// Exception funds do not count toward the daily cap.

#[derive(Accounts)]
pub struct RequestException<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        has_one = mint,
        seeds = [GRANT_SEED, mint.key().as_ref()],
        bump = grant.bump
    )]
    pub grant: Account<'info, Grant>,
    /// The issuer's exception escrow. The payer's transfer into it must come earlier in the same transaction.
    #[account(address = grant.exception_escrow)]
    pub escrow_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = payer,
        space = 8 + Exception::INIT_SPACE,
        seeds = [
            EXCEPTION_SEED,
            mint.key().as_ref(),
            grant.exception_count.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub exception: Account<'info, Exception>,
    pub system_program: Program<'info, System>,
}

pub fn request_exception_handler(
    ctx: Context<RequestException>,
    merchant: Pubkey,
    amount: u64,
    reason: String,
) -> Result<()> {
    require!(ctx.accounts.grant.exception_escrow != Pubkey::default(), RuleError::EscrowNotSet);
    require!(amount > 0, RuleError::ZeroAmount);
    require!(!reason.trim().is_empty() && reason.len() <= MAX_REASON, RuleError::BadReason);
    require!(ctx.accounts.escrow_token.amount >= amount, RuleError::EscrowUnderfunded);

    let grant = &mut ctx.accounts.grant;
    let id = grant.exception_count;
    grant.exception_count = id.checked_add(1).ok_or(RuleError::ZeroAmount)?;

    let ex = &mut ctx.accounts.exception;
    ex.mint = ctx.accounts.mint.key();
    ex.id = id;
    ex.payer = ctx.accounts.payer.key();
    ex.merchant = merchant;
    ex.amount = amount;
    ex.status = EXC_PENDING;
    ex.reason_len = reason.len() as u16;
    ex.reason = [0u8; MAX_REASON];
    ex.reason[..reason.len()].copy_from_slice(reason.as_bytes());
    ex.created_at = Clock::get()?.unix_timestamp;
    ex.bump = ctx.bumps.exception;
    Ok(())
}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct ResolveException<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        has_one = issuer,
        has_one = mint,
        seeds = [GRANT_SEED, mint.key().as_ref()],
        bump = grant.bump
    )]
    pub grant: Account<'info, Grant>,
    #[account(
        mut,
        has_one = mint,
        seeds = [EXCEPTION_SEED, mint.key().as_ref(), id.to_le_bytes().as_ref()],
        bump = exception.bump
    )]
    pub exception: Account<'info, Exception>,
}

pub fn approve_exception_handler(ctx: Context<ResolveException>, id: u64) -> Result<()> {
    let ex = &mut ctx.accounts.exception;
    require!(ex.id == id, RuleError::NotPending);
    require!(ex.status == EXC_PENDING, RuleError::NotPending);
    ex.status = EXC_APPROVED;
    Ok(())
}

pub fn reject_exception_handler(ctx: Context<ResolveException>, id: u64) -> Result<()> {
    let ex = &mut ctx.accounts.exception;
    require!(ex.id == id, RuleError::NotPending);
    require!(ex.status == EXC_PENDING, RuleError::NotPending);
    ex.status = EXC_REJECTED;
    Ok(())
}
