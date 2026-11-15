/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/cashrules.json`.
 */
export type Cashrules = {
  "address": "8uuvaV8HNBKFsDp2Dn7CnzaQDV59AebPJfAkzJUUFusC",
  "metadata": {
    "name": "cashrules",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "CashRules: USDC-style grant tokens enforced by a Token-2022 transfer hook"
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
      "name": "approveException",
      "docs": [
        "Issuer: approve an exception. Send the escrow -> merchant transfer in the same transaction."
      ],
      "discriminator": [
        142,
        185,
        32,
        56,
        99,
        246,
        213,
        123
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
            "grant",
            "exception"
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
          "name": "exception",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  99,
                  101,
                  112,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "arg",
                "path": "id"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "id",
          "type": "u64"
        }
      ]
    },
    {
      "name": "depositAndMint",
      "docs": [
        "Issuer: lock USDC in the vault and mint the same amount of CashRules to a grantee (1:1 backing)."
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
            "CashRules mint. Must have TransferHook -> this program and mint authority = grant PDA."
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
        "Approved merchant: burn CashRules and receive USDC 1:1 from the vault."
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
          "name": "merchantCashrules",
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
      "name": "rejectException",
      "docs": [
        "Issuer: reject an exception. Send the escrow -> issuer transfer in the same transaction (the payer is charged)."
      ],
      "discriminator": [
        61,
        172,
        216,
        178,
        186,
        94,
        120,
        240
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
            "grant",
            "exception"
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
          "name": "exception",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  99,
                  101,
                  112,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "arg",
                "path": "id"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "id",
          "type": "u64"
        }
      ]
    },
    {
      "name": "requestException",
      "docs": [
        "Payer: record an out-of-policy payment request with a reason. Send the payer's transfer into the",
        "exception escrow earlier in the same transaction."
      ],
      "discriminator": [
        45,
        48,
        150,
        235,
        83,
        220,
        11,
        199
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
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
        },
        {
          "name": "escrowToken",
          "docs": [
            "The issuer's exception escrow. The payer's transfer into it must come earlier in the same transaction."
          ]
        },
        {
          "name": "exception",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  99,
                  101,
                  112,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "grant.exception_count",
                "account": "grant"
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
          "name": "merchant",
          "type": "pubkey"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "reason",
          "type": "string"
        }
      ]
    },
    {
      "name": "setExceptionEscrow",
      "docs": [
        "Issuer: set the token account that holds escrowed exception funds (issuer-owned RuleCash account)."
      ],
      "discriminator": [
        228,
        170,
        29,
        190,
        20,
        176,
        93,
        146
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
        },
        {
          "name": "escrowToken",
          "docs": [
            "Issuer-owned RuleCash token account that will hold escrowed exception funds."
          ]
        }
      ],
      "args": []
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
        "Token-2022 calls this on every transfer of a CashRules mint. Reverts the transfer if any rule fails."
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
      "name": "exception",
      "discriminator": [
        183,
        39,
        111,
        193,
        66,
        60,
        78,
        112
      ]
    },
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
      "msg": "CashRules mint authority must be the grant PDA"
    },
    {
      "code": 6008,
      "name": "decimalsMismatch",
      "msg": "CashRules and USDC must have the same decimals"
    },
    {
      "code": 6009,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6010,
      "name": "badReason",
      "msg": "Reason must be 1 to 200 bytes"
    },
    {
      "code": 6011,
      "name": "notPending",
      "msg": "Exception request is no longer pending"
    },
    {
      "code": 6012,
      "name": "wrongDestination",
      "msg": "Destination does not match the exception request"
    },
    {
      "code": 6013,
      "name": "escrowNotSet",
      "msg": "Exception escrow is not set for this grant"
    },
    {
      "code": 6014,
      "name": "escrowUnderfunded",
      "msg": "Escrow does not hold the requested amount yet"
    }
  ],
  "types": [
    {
      "name": "exception",
      "docs": [
        "One per out-of-policy payment request. The payer's RuleCash waits in escrow until the issuer decides."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "merchant",
            "docs": [
              "Intended recipient wallet. Approval pays this wallet."
            ],
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "reasonLen",
            "type": "u16"
          },
          {
            "name": "reason",
            "docs": [
              "Payer's explanation, UTF-8, first `reason_len` bytes."
            ],
            "type": {
              "array": [
                "u8",
                200
              ]
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "grant",
      "docs": [
        "One per CashRules mint. Holds the issuer's policy."
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
              "CashRules (Token-2022) mint. Its mint authority is this grant PDA."
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
            "name": "exceptionCount",
            "docs": [
              "Next exception id. Also the number of exception requests so far."
            ],
            "type": "u64"
          },
          {
            "name": "exceptionEscrow",
            "docs": [
              "Issuer-owned RuleCash token account holding escrowed exception funds. Default key = not set."
            ],
            "type": "pubkey"
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
