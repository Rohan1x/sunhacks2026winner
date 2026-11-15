use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::errors::RuleError;
use crate::instructions::hook::verify_mint_hook_points_here;
use crate::state::*;

// ---------------------------------------------------------------- init_grant

#[derive(Accounts)]
pub struct InitGrant<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = issuer,
        space = 8 + Grant::INIT_SPACE,
        seeds = [GRANT_SEED, mint.key().as_ref()],
        bump
    )]
    pub grant: Account<'info, Grant>,
    pub system_program: Program<'info, System>,
}

pub fn init_grant_handler(ctx: Context<InitGrant>, allowed_categories: u32, daily_cap: u64) -> Result<()> {
    verify_mint_hook_points_here(&ctx.accounts.mint.to_account_info())?;

    let grant = &mut ctx.accounts.grant;
    grant.issuer = ctx.accounts.issuer.key();
    grant.mint = ctx.accounts.mint.key();
    grant.allowed_categories = allowed_categories;
    grant.daily_cap = daily_cap;
    grant.bump = ctx.bumps.grant;
    Ok(())
}

// ---------------------------------------------------------------- set_policy

#[derive(Accounts)]
pub struct SetPolicy<'info> {
    pub issuer: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        has_one = issuer,
        has_one = mint,
        seeds = [GRANT_SEED, mint.key().as_ref()],
        bump = grant.bump
    )]
    pub grant: Account<'info, Grant>,
}

pub fn set_policy_handler(ctx: Context<SetPolicy>, allowed_categories: u32, daily_cap: u64) -> Result<()> {
    let grant = &mut ctx.accounts.grant;
    grant.allowed_categories = allowed_categories;
    grant.daily_cap = daily_cap;
    Ok(())
}

// ---------------------------------------------------------------- add_merchant

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct AddMerchant<'info> {
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
        init,
        payer = issuer,
        space = 8 + Merchant::INIT_SPACE,
        seeds = [MERCHANT_SEED, mint.key().as_ref(), wallet.as_ref()],
        bump
    )]
    pub merchant: Account<'info, Merchant>,
    pub system_program: Program<'info, System>,
}

pub fn add_merchant_handler(
    ctx: Context<AddMerchant>,
    wallet: Pubkey,
    category: u8,
    per_tx_cap: u64,
) -> Result<()> {
    require!(category <= MAX_CATEGORY, RuleError::InvalidCategory);

    let merchant = &mut ctx.accounts.merchant;
    merchant.mint = ctx.accounts.mint.key();
    merchant.wallet = wallet;
    merchant.category = category;
    merchant.per_tx_cap = per_tx_cap;
    merchant.active = true;
    merchant.bump = ctx.bumps.merchant;
    Ok(())
}

// ---------------------------------------------------------------- set_merchant

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct SetMerchant<'info> {
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
        seeds = [MERCHANT_SEED, mint.key().as_ref(), wallet.as_ref()],
        bump = merchant.bump
    )]
    pub merchant: Account<'info, Merchant>,
}

pub fn set_merchant_handler(
    ctx: Context<SetMerchant>,
    _wallet: Pubkey,
    category: u8,
    per_tx_cap: u64,
    active: bool,
) -> Result<()> {
    require!(category <= MAX_CATEGORY, RuleError::InvalidCategory);

    let merchant = &mut ctx.accounts.merchant;
    merchant.category = category;
    merchant.per_tx_cap = per_tx_cap;
    merchant.active = active;
    Ok(())
}

// ---------------------------------------------------------------- init_spend

#[derive(Accounts)]
#[instruction(grantee: Pubkey)]
pub struct InitSpend<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = payer,
        space = 8 + Spend::INIT_SPACE,
        seeds = [SPEND_SEED, mint.key().as_ref(), grantee.as_ref()],
        bump
    )]
    pub spend: Account<'info, Spend>,
    pub system_program: Program<'info, System>,
}

pub fn init_spend_handler(ctx: Context<InitSpend>, grantee: Pubkey) -> Result<()> {
    let spend = &mut ctx.accounts.spend;
    spend.mint = ctx.accounts.mint.key();
    spend.grantee = grantee;
    spend.day_index = 0;
    spend.spent_today = 0;
    spend.bump = ctx.bumps.spend;
    Ok(())
}
