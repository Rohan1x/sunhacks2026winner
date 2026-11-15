use anchor_lang::prelude::*;

#[error_code]
pub enum RuleError {
    #[msg("Destination is not an approved merchant")]
    NotApprovedMerchant,
    #[msg("Merchant category is not allowed by this grant")]
    CategoryBlocked,
    #[msg("Amount exceeds the merchant per-transaction cap")]
    OverTxCap,
    #[msg("Amount exceeds the grant daily cap")]
    OverDailyCap,
    #[msg("Transfer hook was invoked outside a Token-2022 transfer")]
    NotTransferring,
    #[msg("Mint transfer hook does not point to this program")]
    WrongTransferHookProgram,
    #[msg("Category must be between 0 and 31")]
    InvalidCategory,
    #[msg("RuleCash mint authority must be the grant PDA")]
    MintAuthorityMismatch,
    #[msg("RuleCash and USDC must have the same decimals")]
    DecimalsMismatch,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
}
