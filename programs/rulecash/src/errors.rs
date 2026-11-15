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
}
