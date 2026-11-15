/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/rulecash.json`.
 */
export type Rulecash = {
  "address": "3jea1uUS3qbgGYXLrUDirRUPN97qhPEF3A9c8vue3H9t",
  "metadata": {
    "name": "rulecash",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "RuleCash: USDC-style grant tokens enforced by a Token-2022 transfer hook"
  },
  "instructions": [
    {
      "name": "addMerchant",
      "docs": [
        "Issuer: approve a merchant wallet."
      ],
      "discriminator": [
        198,
        82,
        166,
        156,
        165,
        93,
        203,
        72
      ],
      "accounts": [
        {
          "name": "issuer",
          "writable": true,
          "signer": true,
          "relations": [
            "grant"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "grant"
          ]
        },
        {
          "name": "grant",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "merchant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  114,
                  99,
                  104,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "arg",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "wallet",
          "type": "pubkey"
        },
        {
          "name": "category",
          "type": "u8"
        },
        {
          "name": "perTxCap",
          "type": "u64"
        }
      ]
    },
    {
      "name": "depositAndMint",
      "docs": [
        "Issuer: lock USDC in the vault and mint the same amount of RuleCash to a grantee (1:1 backing)."
      ],
      "discriminator": [
        97,
        126,
        119,
        210,
        67,
        186,
        64,
        23
      ],
      "accounts": [
        {
          "name": "issuer",
          "writable": true,
          "signer": true,
          "relations": [
            "grant"
          ]
        },
        {
          "name": "mint",
          "writable": true,
          "relations": [
            "grant"
          ]
        },
        {
          "name": "usdcMint",
          "relations": [
            "grant"
          ]
        },
        {
          "name": "grant",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "issuerUsdc",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "grant"
              },
              {
                "kind": "account",
                "path": "usdcTokenProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "grantee"
        },
        {
          "name": "granteeToken",
          "writable": true
        },
        {
          "name": "usdcTokenProgram"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initExtraAccountMetas",
      "docs": [
        "Issuer: create the ExtraAccountMetaList so Token-2022 knows which extra accounts to pass to the hook."
      ],
      "discriminator": [
        9,
        67,
        237,
        214,
        19,
        39,
        118,
        118
      ],
      "accounts": [
        {
          "name": "issuer",
          "writable": true,
          "signer": true,
          "relations": [
            "grant"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "grant"
          ]
        },
        {
          "name": "grant",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "extraAccountMetaList",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initGrant",
      "docs": [
        "Issuer: register a grant for a Token-2022 mint whose TransferHook points at this program."
      ],
      "discriminator": [
        141,
        28,
        193,
        26,
        49,
        149,
        221,
        134
      ],
      "accounts": [
        {
          "name": "issuer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint",
          "docs": [
            "RuleCash mint. Must have TransferHook -> this program and mint authority = grant PDA."
          ]
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "grant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "USDC reserve owned by the grant PDA."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "grant"
              },
              {
                "kind": "account",
                "path": "usdcTokenProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "allowedCategories",
          "type": "u32"
        },
        {
          "name": "dailyCap",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initSpend",
      "docs": [
        "Anyone (pays rent): create the per-grantee spend counter. Needed before a grantee can receive funds."
      ],
      "discriminator": [
        199,
        99,
        148,
        37,
        217,
        19,
        12,
        94
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "spend",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  112,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "arg",
                "path": "grantee"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "grantee",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "redeem",
      "docs": [
        "Approved merchant: burn RuleCash and receive USDC 1:1 from the vault."
      ],
      "discriminator": [
        184,
        12,
        86,
        149,
        70,
        196,
        97,
        225
      ],
      "accounts": [
        {
          "name": "merchant",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint",
          "writable": true,
          "relations": [
            "grant"
          ]
        },
        {
          "name": "usdcMint",
          "relations": [
            "grant"
          ]
        },
        {
          "name": "grant",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "merchantAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  114,
                  99,
                  104,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "merchant"
              }
            ]
          }
        },
        {
          "name": "merchantRulecash",
          "writable": true
        },
        {
          "name": "merchantUsdc",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "grant"
              },
              {
                "kind": "account",
                "path": "usdcTokenProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "usdcTokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setMerchant",
      "docs": [
        "Issuer: update an existing merchant (cap, category, active flag)."
      ],
      "discriminator": [
        82,
        229,
        223,
        235,
        235,
        212,
        253,
        163
      ],
      "accounts": [
        {
          "name": "issuer",
          "signer": true,
          "relations": [
            "grant"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "grant"
          ]
        },
        {
          "name": "grant",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "merchant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  114,
                  99,
                  104,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "arg",
                "path": "wallet"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "wallet",
          "type": "pubkey"
        },
        {
          "name": "category",
          "type": "u8"
        },
        {
          "name": "perTxCap",
          "type": "u64"
        },
        {
          "name": "active",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setPolicy",
      "docs": [
        "Issuer: change category bitmask and daily cap."
      ],
      "discriminator": [
        40,
        133,
        12,
        157,
        235,
        202,
        2,
        132
      ],
      "accounts": [
        {
          "name": "issuer",
          "signer": true,
          "relations": [
            "grant"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "grant"
          ]
        },
        {
          "name": "grant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "allowedCategories",
          "type": "u32"
        },
        {
          "name": "dailyCap",
          "type": "u64"
        }
      ]
    },
    {
      "name": "transferHook",
      "docs": [
        "Token-2022 calls this on every transfer of a RuleCash mint. Reverts the transfer if any rule fails."
      ],
      "discriminator": [
        105,
        37,
        101,
        197,
        75,
        251,
        102,
        26
      ],
      "accounts": [
        {
          "name": "sourceToken"
        },
        {
          "name": "mint",
          "relations": [
            "grant"
          ]
        },
        {
          "name": "destinationToken"
        },
        {
          "name": "owner"
        },
        {
          "name": "extraAccountMetaList",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "grant",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "merchant",
          "docs": [
            "destination gets NotApprovedMerchant instead of a generic Anchor error."
          ]
        },
        {
          "name": "spend",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  112,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "source_token.owner"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "grant",
      "discriminator": [
        161,
        166,
        11,
        205,
        204,
        135,
        205,
        54
      ]
    },
    {
      "name": "merchant",
      "discriminator": [
        71,
        235,
        30,
        40,
        231,
        21,
        32,
        64
      ]
    },
    {
      "name": "spend",
      "discriminator": [
        239,
        231,
        148,
        138,
        205,
        129,
        218,
        161
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "notApprovedMerchant",
      "msg": "Destination is not an approved merchant"
    },
    {
      "code": 6001,
      "name": "categoryBlocked",
      "msg": "Merchant category is not allowed by this grant"
    },
    {
      "code": 6002,
      "name": "overTxCap",
      "msg": "Amount exceeds the merchant per-transaction cap"
    },
    {
      "code": 6003,
      "name": "overDailyCap",
      "msg": "Amount exceeds the grant daily cap"
    },
    {
      "code": 6004,
      "name": "notTransferring",
      "msg": "Transfer hook was invoked outside a Token-2022 transfer"
    },
    {
      "code": 6005,
      "name": "wrongTransferHookProgram",
      "msg": "Mint transfer hook does not point to this program"
    },
    {
      "code": 6006,
      "name": "invalidCategory",
      "msg": "Category must be between 0 and 31"
    },
    {
      "code": 6007,
      "name": "mintAuthorityMismatch",
      "msg": "RuleCash mint authority must be the grant PDA"
    },
    {
      "code": 6008,
      "name": "decimalsMismatch",
      "msg": "RuleCash and USDC must have the same decimals"
    },
    {
      "code": 6009,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    }
  ],
  "types": [
    {
      "name": "grant",
      "docs": [
        "One per RuleCash mint. Holds the issuer's policy."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "issuer",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "docs": [
              "RuleCash (Token-2022) mint. Its mint authority is this grant PDA."
            ],
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "docs": [
              "Backing asset (USDC). Reserve lives in the grant PDA's ATA for this mint."
            ],
            "type": "pubkey"
          },
          {
            "name": "allowedCategories",
            "docs": [
              "Bitmask: bit N set => merchants in category N are allowed."
            ],
            "type": "u32"
          },
          {
            "name": "dailyCap",
            "docs": [
              "Max total spend per grantee per UTC day, in base units."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "merchant",
      "docs": [
        "One per approved merchant wallet per mint."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "category",
            "type": "u8"
          },
          {
            "name": "perTxCap",
            "docs": [
              "Max single payment to this merchant, in base units."
            ],
            "type": "u64"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "spend",
      "docs": [
        "One per grantee per mint. Tracks spend within the current UTC day."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "grantee",
            "type": "pubkey"
          },
          {
            "name": "dayIndex",
            "type": "i64"
          },
          {
            "name": "spentToday",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
