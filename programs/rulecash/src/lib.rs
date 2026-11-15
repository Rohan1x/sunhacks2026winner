use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

pub use errors::RuleError;
pub use instructions::*;
pub use state::*;

declare_id!("3jea1uUS3qbgGYXLrUDirRUPN97qhPEF3A9c8vue3H9t");

#[program]
pub mod rulecash {
    use super::*;

    /// Issuer: register a grant for a Token-2022 mint whose TransferHook points at this program.
    pub fn init_grant(
        ctx: Context<InitGrant>,
        allowed_categories: u32,
        daily_cap: u64,
    ) -> Result<()> {
        instructions::admin::init_grant_handler(ctx, allowed_categories, daily_cap)
    }

    /// Issuer: change category bitmask and daily cap.
    pub fn set_policy(
        ctx: Context<SetPolicy>,
        allowed_categories: u32,
        daily_cap: u64,
    ) -> Result<()> {
        instructions::admin::set_policy_handler(ctx, allowed_categories, daily_cap)
    }

    /// Issuer: approve a merchant wallet.
    pub fn add_merchant(
        ctx: Context<AddMerchant>,
        wallet: Pubkey,
        category: u8,
        per_tx_cap: u64,
    ) -> Result<()> {
        instructions::admin::add_merchant_handler(ctx, wallet, category, per_tx_cap)
    }

    /// Issuer: update an existing merchant (cap, category, active flag).
    pub fn set_merchant(
        ctx: Context<SetMerchant>,
        wallet: Pubkey,
        category: u8,
        per_tx_cap: u64,
        active: bool,
    ) -> Result<()> {
        instructions::admin::set_merchant_handler(ctx, wallet, category, per_tx_cap, active)
    }

    /// Anyone (pays rent): create the per-grantee spend counter. Needed before a grantee can receive funds.
    pub fn init_spend(ctx: Context<InitSpend>, grantee: Pubkey) -> Result<()> {
        instructions::admin::init_spend_handler(ctx, grantee)
    }

    /// Issuer: create the ExtraAccountMetaList so Token-2022 knows which extra accounts to pass to the hook.
    pub fn init_extra_account_metas(ctx: Context<InitExtraAccountMetas>) -> Result<()> {
        instructions::hook::init_extra_account_metas_handler(ctx)
    }

    /// Token-2022 calls this on every transfer of a RuleCash mint. Reverts the transfer if any rule fails.
    #[interface(spl_transfer_hook_interface::execute)]
    pub fn transfer_hook(ctx: Context<ExecuteTransferHook>, amount: u64) -> Result<()> {
        instructions::hook::transfer_hook_handler(ctx, amount)
    }
}
