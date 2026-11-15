use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    burn_checked, mint_to, transfer_checked, BurnChecked, Mint, MintTo, TokenAccount,
    TokenInterface, TransferChecked,
};

use crate::errors::RuleError;
use crate::instructions::hook::load_active_merchant;
use crate::state::*;

// ------------------------------------------------------------ deposit_and_mint

/// Issuer locks USDC in the vault and mints the same amount of CashRules to a grantee.
/// Invariant: CashRules supply == vault USDC balance (1:1 backing).
#[derive(Accounts)]
pub struct DepositAndMint<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(
        has_one = issuer,
        has_one = mint,
        has_one = usdc_mint,
        seeds = [GRANT_SEED, mint.key().as_ref()],
        bump = grant.bump
    )]
    pub grant: Account<'info, Grant>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = issuer
    )]
    pub issuer_usdc: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = grant,
        associated_token::token_program = usdc_token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: wallet receiving CashRules. Does not sign.
    pub grantee: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = grantee
    )]
    pub grantee_token: InterfaceAccount<'info, TokenAccount>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn deposit_and_mint_handler(ctx: Context<DepositAndMint>, amount: u64) -> Result<()> {
    require!(amount > 0, RuleError::ZeroAmount);

    transfer_checked(
        CpiContext::new(
            ctx.accounts.usdc_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.issuer_usdc.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.issuer.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.usdc_mint.decimals,
    )?;

    let mint_key = ctx.accounts.mint.key();
    let bump = [ctx.accounts.grant.bump];
    let signer_seeds: &[&[&[u8]]] = &[&[GRANT_SEED, mint_key.as_ref(), &bump]];
    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.grantee_token.to_account_info(),
                authority: ctx.accounts.grant.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    Ok(())
}

// ------------------------------------------------------------------- redeem

/// Approved merchant burns CashRules and receives USDC 1:1 from the vault.
/// Burns do not invoke the transfer hook, so the spend rules do not apply here.
/// Only approved merchants can redeem; a grantee cannot exit the grant by cashing out.
#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(mut)]
    pub merchant: Signer<'info>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(
        has_one = mint,
        has_one = usdc_mint,
        seeds = [GRANT_SEED, mint.key().as_ref()],
        bump = grant.bump
    )]
    pub grant: Account<'info, Grant>,
    /// CHECK: merchant PDA for (mint, merchant). Existence and active flag are checked in the handler.
    #[account(
        seeds = [MERCHANT_SEED, mint.key().as_ref(), merchant.key().as_ref()],
        bump
    )]
    pub merchant_account: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = merchant
    )]
    pub merchant_cashrules: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = merchant
    )]
    pub merchant_usdc: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = grant,
        associated_token::token_program = usdc_token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
}

pub fn redeem_handler(ctx: Context<Redeem>, amount: u64) -> Result<()> {
    require!(amount > 0, RuleError::ZeroAmount);

    let mint_key = ctx.accounts.mint.key();
    let merchant_key = ctx.accounts.merchant.key();
    load_active_merchant(
        &ctx.accounts.merchant_account.to_account_info(),
        &mint_key,
        &merchant_key,
    )?;

    burn_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            BurnChecked {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.merchant_cashrules.to_account_info(),
                authority: ctx.accounts.merchant.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    let bump = [ctx.accounts.grant.bump];
    let signer_seeds: &[&[&[u8]]] = &[&[GRANT_SEED, mint_key.as_ref(), &bump]];
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.usdc_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.merchant_usdc.to_account_info(),
                authority: ctx.accounts.grant.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        ctx.accounts.usdc_mint.decimals,
    )?;

    Ok(())
}
