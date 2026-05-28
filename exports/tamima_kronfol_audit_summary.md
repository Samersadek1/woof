# Tamima Kronfol — authority vs live DB (2026-05-28)

**Source:** [`exports/Tamima_Kronfol_Invoice_Usage_Analysis.xlsx`](Tamima_Kronfol_Invoice_Usage_Analysis.xlsx)  
**Owner:** Tamima Kronfol (`9d625d7c-d7f2-42f7-8198-03fa42b381ae`, CL000284)  
**Pets:** Lotus, Mei Mei, Rocky  
**Detail CSV:** [`tamima_kronfol_authority_vs_db.csv`](tamima_kronfol_authority_vs_db.csv)

## Verdict summary (24 credits)

| Verdict | Count | Meaning |
|---------|------:|---------|
| **match** | 6 | Balance and session count align with authority (PKG-90398, PKG-92359 — fully used) |
| **sessions_mismatch** | 18 | `units_*` match authority; `daycare_sessions` count does not equal `units_consumed` |
| **balance_wrong** | 0 | No credit balance corrections needed on live DB |
| **no_credit** | 0 | All authority rows resolved |

## Per package

| Tracker | Auth used (Σ pets) | DB consumed (Σ) | Session issue |
|---------|-------------------:|----------------:|---------------|
| PKG-84539 | 39 | 39 ✓ | 30 sessions/credit vs 13 consumed |
| PKG-86058 | 39 | 39 ✓ | same |
| PKG-87705 | 36 | 36 ✓ | same |
| PKG-89021 | 42 | 42 ✓ | same |
| PKG-90398 | 90 | 90 ✓ | **match** (30/30 each) |
| PKG-91175 | 36 | 36 ✓ | 30 sessions vs 12 consumed |
| PKG-92359 | 90 | 90 ✓ | **match** |
| May-23 filename | 0 | 0 ✓ | **3 orphan sessions** on 2026-05-26 (0 consumed in authority) |

## Actions

1. **Credits (Phase 2):** Run [`sql/fix-tamima-kronfol-credits-from-authority.sql`](../sql/fix-tamima-kronfol-credits-from-authority.sql) — expected **no unit changes** on current live DB; stamps invoice guard notes.
2. **Sessions (Phase 3):** See [`tamima_kronfol_sessions_plan.md`](tamima_kronfol_sessions_plan.md) — separate approval before re-linking or trimming `daycare_sessions`.
