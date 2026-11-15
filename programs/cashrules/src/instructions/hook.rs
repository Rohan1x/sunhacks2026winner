use anchor_lang::prelude::*;
use anchor_lang::AccountDeserialize;
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_token_2022::{
    extension::{
        transfer_hook::TransferHook, transfer_hook::TransferHookAccount,
        BaseStateWithExtensions, PodStateWithExtensions,
    },
    pod::{PodAccount, PodMint},
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::errors::RuleError;
use crate::state::*;

pub const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";
/// Grant, Merchant, Spend.
pub const EXTRA_ACCOUNT_METAS_COUNT: usize = 3;

/// Reject mints whose TransferHook extension does not point at this program.
/// Called from init_grant so a grant can never be registered on a mint that bypasses the rules.
pub fn verify_mint_hook_points_here(mint: &AccountInfo) -> Result<()> {
    let data = mint.try_borrow_data()?;
    let state = PodStateWithExtensions::<PodMint>::unpack(&data)?;
    let hook = state
        .get_extension::<TransferHook>()
        .map_err(|_| error!(RuleError::WrongTransferHookProgram))?;
    let program_id: Option<Pubkey> = hook.program_id.into();
    require!(
        program_id == Some(crate::ID),
        RuleError::WrongTransferHookProgram
    );
    Ok(())
}

/// Load a merchant PDA and require it to be the approved, active merchant for `wallet`.
/// Used by the transfer hook (destination) and by redeem (signing merchant).
pub fn load_active_merchant(
    merchant_info: &AccountInfo,
    mint: &Pubkey,
    wallet: &Pubkey,
) -> Result<Merchant> {
    let (expected, _) = Pubkey::find_program_address(
        &[MERCHANT_SEED, mint.as_ref(), wallet.as_ref()],
        &crate::ID,
    );
    require_keys_eq!(merchant_info.key(), expected, RuleError::NotApprovedMerchant);
    require!(
        *merchant_info.owner == crate::ID && !merchant_info.data_is_empty(),
        RuleError::NotApprovedMerchant
    );
    let merchant = {
        let data = merchant_info.try_borrow_data()?;
        Merchant::try_deserialize(&mut &data[..])
            .map_err(|_| error!(RuleError::NotApprovedMerchant))?
    };
    require!(merchant.active, RuleError::NotApprovedMerchant);
    require_keys_eq!(merchant.wallet, *wallet, RuleError::NotApprovedMerchant);
    Ok(merchant)
}

// ------------------------------------------------ init_extra_account_metas

#[derive(Accounts)]
pub struct InitExtraAccountMetas<'info> {
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
    /// CHECK: created here, then initialised by spl-tlv-account-resolution.
    #[account(
        init,
        payer = issuer,
        space = ExtraAccountMetaList::size_of(EXTRA_ACCOUNT_METAS_COUNT).unwrap(),
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn init_extra_account_metas_handler(ctx: Context<InitExtraAccountMetas>) -> Result<()> {
    // Extra accounts appended after the 5 fixed Execute accounts (indices 0..=4).
    // Execute account indices: 0 source, 1 mint, 2 destination, 3 owner, 4 meta list.
    let metas = vec![
        // [5] Grant: seeds ["grant", mint]
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: GRANT_SEED.to_vec() },
                Seed::AccountKey { index: 1 },
            ],
            false,
            false,
        )?,
        // [6] Merchant: seeds ["merchant", mint, destination token owner]
        // destination token account layout: mint (0..32), owner (32..64)
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: MERCHANT_SEED.to_vec() },
                Seed::AccountKey { index: 1 },
                Seed::AccountData { account_index: 2, data_index: 32, length: 32 },
            ],
            false,
            false,
        )?,
        // [7] Spend (writable): seeds ["spend", mint, source token owner]
        // Uses the token account's owner field, not the delegate, so delegated transfers
        // still count against the grantee.
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: SPEND_SEED.to_vec() },
                Seed::AccountKey { index: 1 },
                Seed::AccountData { account_index: 0, data_index: 32, length: 32 },
            ],
            false,
            true,
        )?,
    ];

    let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &metas)?;
    Ok(())
}

// ------------------------------------------------------------ transfer_hook

#[derive(Accounts)]
pub struct ExecuteTransferHook<'info> {
    #[account(token::mint = mint)]
    pub source_token: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(token::mint = mint)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: owner or delegate of the source token account, supplied by Token-2022.
    pub owner: UncheckedAccount<'info>,
    /// CHECK: ExtraAccountMetaList PDA, validated by seeds.
    #[account(
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    // ---- extra accounts (indices 5, 6, 7) ----
    #[account(
        seeds = [GRANT_SEED, mint.key().as_ref()],
        bump = grant.bump,
        has_one = mint
    )]
    pub grant: Account<'info, Grant>,
    /// CHECK: existence and identity verified manually in the handler, so an unapproved
    /// destination gets NotApprovedMerchant instead of a generic Anchor error.
    pub merchant: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [SPEND_SEED, mint.key().as_ref(), source_token.owner.as_ref()],
        bump = spend.bump
    )]
    pub spend: Account<'info, Spend>,
}

pub fn transfer_hook_handler(ctx: Context<ExecuteTransferHook>, amount: u64) -> Result<()> {
    // 1. Only valid inside a real Token-2022 transfer. Blocks direct calls that would
    //    otherwise corrupt the spend counter.
    {
        let info = ctx.accounts.source_token.to_account_info();
        let data = info.try_borrow_data()?;
        let state = PodStateWithExtensions::<PodAccount>::unpack(&data)?;
        let ext = state
            .get_extension::<TransferHookAccount>()
            .map_err(|_| error!(RuleError::NotTransferring))?;
        require!(bool::from(ext.transferring), RuleError::NotTransferring);
    }

    // Exception escrow: deposits into the issuer's escrow account (a payer request) and transfers out of it
    // (issuer decisions) follow the exception flow, not the spend rules. Only the issuer can move funds out.
    let mint_key = ctx.accounts.mint.key();
    let dest_owner = ctx.accounts.destination_token.owner;
    let esc = ctx.accounts.grant.exception_escrow;
    if esc != Pubkey::default()
        && (ctx.accounts.destination_token.key() == esc || ctx.accounts.source_token.key() == esc)
    {
        return Ok(());
    }

    // 2. Destination must be an approved, active merchant.
    let merchant = load_active_merchant(
        &ctx.accounts.merchant.to_account_info(),
        &mint_key,
        &dest_owner,
    )?;

    // 3. Category must be allowed by the grant.
    let grant = &ctx.accounts.grant;
    require!(
        (grant.allowed_categories >> merchant.category) & 1 == 1,
        RuleError::CategoryBlocked
    );

    // 4. Per-transaction cap.
    require!(amount <= merchant.per_tx_cap, RuleError::OverTxCap);

    // 5. Daily cap per grantee (UTC day).
    let today = Clock::get()?.unix_timestamp / SECONDS_PER_DAY;
    let spend = &mut ctx.accounts.spend;
    if spend.day_index != today {
        spend.day_index = today;
        spend.spent_today = 0;
    }
    let new_total = spend
        .spent_today
        .checked_add(amount)
        .ok_or(RuleError::OverDailyCap)?;
    require!(new_total <= grant.daily_cap, RuleError::OverDailyCap);
    spend.spent_today = new_total;

    Ok(())
}
