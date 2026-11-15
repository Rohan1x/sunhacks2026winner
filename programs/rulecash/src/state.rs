use anchor_lang::prelude::*;

pub const GRANT_SEED: &[u8] = b"grant";
pub const MERCHANT_SEED: &[u8] = b"merchant";
pub const SPEND_SEED: &[u8] = b"spend";
pub const SECONDS_PER_DAY: i64 = 86_400;
pub const MAX_CATEGORY: u8 = 31;

/// One per RuleCash mint. Holds the issuer's policy.
#[account]
#[derive(InitSpace)]
pub struct Grant {
    pub issuer: Pubkey,
    /// RuleCash (Token-2022) mint. Its mint authority is this grant PDA.
    pub mint: Pubkey,
    /// Backing asset (USDC). Reserve lives in the grant PDA's ATA for this mint.
    pub usdc_mint: Pubkey,
    /// Bitmask: bit N set => merchants in category N are allowed.
    pub allowed_categories: u32,
    /// Max total spend per grantee per UTC day, in base units.
    pub daily_cap: u64,
    pub bump: u8,
}

/// One per approved merchant wallet per mint.
#[account]
#[derive(InitSpace)]
pub struct Merchant {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub category: u8,
    /// Max single payment to this merchant, in base units.
    pub per_tx_cap: u64,
    pub active: bool,
    pub bump: u8,
}

/// One per grantee per mint. Tracks spend within the current UTC day.
#[account]
#[derive(InitSpace)]
pub struct Spend {
    pub mint: Pubkey,
    pub grantee: Pubkey,
    pub day_index: i64,
    pub spent_today: u64,
    pub bump: u8,
}
