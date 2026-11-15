use anchor_lang::prelude::*;

pub const GRANT_SEED: &[u8] = b"grant";
pub const MERCHANT_SEED: &[u8] = b"merchant";
pub const SPEND_SEED: &[u8] = b"spend";
pub const SECONDS_PER_DAY: i64 = 86_400;
pub const MAX_CATEGORY: u8 = 31;

/// One per CashRules mint. Holds the issuer's policy.
#[account]
#[derive(InitSpace)]
pub struct Grant {
    pub issuer: Pubkey,
    /// CashRules (Token-2022) mint. Its mint authority is this grant PDA.
    pub mint: Pubkey,
    /// Backing asset (USDC). Reserve lives in the grant PDA's ATA for this mint.
    pub usdc_mint: Pubkey,
    /// Bitmask: bit N set => merchants in category N are allowed.
    pub allowed_categories: u32,
    /// Max total spend per grantee per UTC day, in base units.
    pub daily_cap: u64,
    /// Next exception id. Also the number of exception requests so far.
    pub exception_count: u64,
    /// Issuer-owned RuleCash token account holding escrowed exception funds. Default key = not set.
    pub exception_escrow: Pubkey,
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

pub const EXCEPTION_SEED: &[u8] = b"exception";
pub const MAX_REASON: usize = 200;
pub const EXC_PENDING: u8 = 0;
pub const EXC_APPROVED: u8 = 1;
pub const EXC_REJECTED: u8 = 2;

/// One per out-of-policy payment request. The payer's RuleCash waits in escrow until the issuer decides.
#[account]
#[derive(InitSpace)]
pub struct Exception {
    pub mint: Pubkey,
    pub id: u64,
    pub payer: Pubkey,
    /// Intended recipient wallet. Approval pays this wallet.
    pub merchant: Pubkey,
    pub amount: u64,
    pub status: u8,
    pub reason_len: u16,
    /// Payer's explanation, UTF-8, first `reason_len` bytes.
    pub reason: [u8; MAX_REASON],
    pub created_at: i64,
    pub bump: u8,
}
