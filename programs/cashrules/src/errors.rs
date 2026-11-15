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
    #[msg("CashRules mint authority must be the grant PDA")]
    MintAuthorityMismatch,
    #[msg("CashRules and USDC must have the same decimals")]
    DecimalsMismatch,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Reason must be 1 to 200 bytes")]
    BadReason,
    #[msg("Exception request is no longer pending")]
    NotPending,
    #[msg("Destination does not match the exception request")]
    WrongDestination,
    #[msg("Exception escrow is not set for this grant")]
    EscrowNotSet,
    #[msg("Escrow does not hold the requested amount yet")]
    EscrowUnderfunded,
}
