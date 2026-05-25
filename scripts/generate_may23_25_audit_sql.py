#!/usr/bin/env python3
"""Generate idempotent SQL for May 23–25 2026 audit ingestion."""

from __future__ import annotations

import csv
from datetime import datetime, timedelta
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "exports" / "bookings-on-site-may23-25-2026.xlsx"
SQL_OUT = ROOT / "sql" / "may23-25_audit_ingestion.sql"
EXPORTS = ROOT / "exports"

LOCKED = {
    "WOOF-2026-00641",
    "WOOF-2026-00700",
    "WOOF-2026-00709",
    "WOOF-2026-00908",
    "WOOF-2026-00904",
    "WOOF-2026-00903",
    "WOOF-2026-00925",
    "WOOF-2026-00725",
    "WOOF-2026-00831",
    "WOOF-2026-00835",
    "WOOF-2026-00846",
    "WOOF-2026-00898",
}

DUBAI_TS = "08:00:00+04"


def esc(s: str | None) -> str:
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def parse_date(v) -> str | None:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, (int, float)):
        base = datetime(1899, 12, 30)
        return (base + timedelta(days=float(v))).date().isoformat()
    s = str(v).strip()
    if not s:
        return None
    if " " in s:
        s = s.split()[0]
    return s[:10]


def ts_expr(date_str: str) -> str:
    return f"('{date_str} {DUBAI_TS}')::timestamptz"


def set_booking_dates(ref: str, ci: str, co: str, *, actual: bool = True) -> str:
    actual_sql = ""
    if actual:
        actual_sql = f""",
  actual_check_in_at = {ts_expr(ci)},
  actual_check_out_at = {ts_expr(co)}"""
    return f"""
UPDATE bookings SET
  check_in_date = '{ci}'::date,
  check_out_date = '{co}'::date{actual_sql},
  updated_at = NOW()
WHERE booking_ref = {esc(ref)};
"""


def upsert_paid_invoice(
    ref: str,
    *,
    subtotal: float,
    total: float,
    discount_pct: float = 0,
    discount_amount: float = 0,
    notes: str | None = None,
    lines: list[tuple[str, str | None, int, float, float]],
) -> str:
    """lines: (description, pricing_key, qty, unit_price, line_total)"""
    note_sql = f", notes = {esc(notes)}" if notes else ""
    line_values = ",\n    ".join(
        f"({esc(d)}, {esc(pk) if pk else 'NULL'}, {q}, {up:.2f}, {lt:.2f}, {lt:.2f})"
        for d, pk, q, up, lt in lines
    )
    return f"""
-- Invoice: {ref}
INSERT INTO invoices (
  owner_id, booking_id, service_type, issue_date, status,
  subtotal, subtotal_aed, discount_amount, discount_aed, discount_pct,
  total, total_aed, amount_paid, paid_at
)
SELECT
  b.owner_id, b.id, 'boarding', '{lines[0][0][:10] if False else "2026-05-25"}'::date, 'paid',
  {subtotal:.2f}, {subtotal:.2f}, {discount_amount:.2f}, {discount_amount:.2f}, {discount_pct:.2f},
  {total:.2f}, {total:.2f}, {total:.2f}, NOW()
FROM bookings b
WHERE b.booking_ref = {esc(ref)}
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.booking_id = b.id);

UPDATE invoices i SET
  status = 'paid',
  subtotal = {subtotal:.2f},
  subtotal_aed = {subtotal:.2f},
  discount_amount = {discount_amount:.2f},
  discount_aed = {discount_amount:.2f},
  discount_pct = {discount_pct:.2f},
  total = {total:.2f},
  total_aed = {total:.2f},
  amount_paid = {total:.2f},
  paid_at = COALESCE(paid_at, NOW()){note_sql},
  updated_at = NOW()
FROM bookings b
WHERE i.booking_id = b.id AND b.booking_ref = {esc(ref)};

DELETE FROM invoice_line_items li
USING invoices i, bookings b
WHERE li.invoice_id = i.id AND i.booking_id = b.id AND b.booking_ref = {esc(ref)};

INSERT INTO invoice_line_items (
  invoice_id, description, pricing_key, quantity, unit_price, total_price, line_total, service_type, sort_order
)
SELECT i.id, v.description, v.pricing_key, v.quantity, v.unit_price, v.total_price, v.line_total, 'boarding', v.sort_order
FROM bookings b
JOIN invoices i ON i.booking_id = b.id
CROSS JOIN LATERAL (VALUES
    {line_values}
) AS v(description, pricing_key, quantity, unit_price, total_price, line_total)
JOIN LATERAL (SELECT row_number() OVER () - 1 AS sort_order) s ON TRUE
WHERE b.booking_ref = {esc(ref)};
"""


def main() -> None:
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    rows = list(wb["May 23-25 2026"].iter_rows(min_row=2, values_only=True))
    bulk: list[tuple[str, str, str]] = []
    for r in rows:
        if not r or not r[4]:
            continue
        ref = str(r[4]).strip()
        if ref in LOCKED:
            continue
        ci, co = parse_date(r[2]), parse_date(r[3])
        if ci and co:
            bulk.append((ref, ci, co))

    parts: list[str] = [
        "-- May 23–25 2026 audit ingestion (generated; idempotent)",
        "-- Project: wineliuwejkxwsdbrthb — Samer: run entire file in SQL Editor",
        "BEGIN;",
        "",
        "CREATE TEMP TABLE IF NOT EXISTS _may_audit_bulk (",
        "  booking_ref TEXT PRIMARY KEY,",
        "  check_in TEXT NOT NULL,",
        "  check_out TEXT NOT NULL",
        ") ON COMMIT DROP;",
        "TRUNCATE _may_audit_bulk;",
    ]

    if bulk:
        values = ",\n  ".join(f"({esc(ref)}, '{ci}', '{co}')" for ref, ci, co in bulk)
        parts.append(f"INSERT INTO _may_audit_bulk (booking_ref, check_in, check_out) VALUES\n  {values};")

    # STEP 1 locked
    parts.append("\n-- === STEP 1: Locked overrides ===\n")
    parts.append(set_booking_dates("WOOF-2026-00641", "2026-05-16", "2026-05-24"))
    parts.append(set_booking_dates("WOOF-2026-00700", "2026-05-23", "2026-05-24"))
    parts.append(set_booking_dates("WOOF-2026-00709", "2026-05-23", "2026-05-24"))
    parts.append(set_booking_dates("WOOF-2026-00908", "2026-05-23", "2026-05-24"))
    parts.append(set_booking_dates("WOOF-2026-00904", "2026-05-25", "2026-06-03"))
    parts.append(set_booking_dates("WOOF-2026-00835", "2026-05-20", "2026-06-01"))
    parts.append(set_booking_dates("WOOF-2026-00846", "2026-05-20", "2026-06-01"))

    parts.append(
        """
UPDATE bookings SET
  check_in_date = '2026-05-03'::date,
  check_out_date = '2026-06-03'::date,
  actual_check_in_at = ('2026-05-03 08:00:00+04')::timestamptz,
  actual_check_out_at = NULL,
  status = 'checked_in',
  notes = COALESCE(notes, '') || CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\\n' END
    || 'may23-25 audit: in-stay; apply double occupancy 15% at checkout via apply_double_occupancy_discount RPC.',
  updated_at = NOW()
WHERE booking_ref = 'WOOF-2026-00898';
"""
    )

    # Cancellations + duplicate
    for ref, reason in [
        ("WOOF-2026-00925", "Cancelled per May 23–25 audit"),
        ("WOOF-2026-00725", "Cancelled per May 23–25 audit"),
        ("WOOF-2026-00831", "Cancelled per May 23–25 audit"),
        (
            "WOOF-2026-00903",
            "Duplicate entry — superseded by WOOF-2026-00904 (may23-25 audit)",
        ),
    ]:
        parts.append(
            f"""
UPDATE bookings SET
  status = 'cancelled',
  cancelled_reason = {esc(reason)},
  updated_at = NOW()
WHERE booking_ref = {esc(ref)};

UPDATE invoices i SET
  status = 'voided',
  voided_at = COALESCE(voided_at, NOW()),
  voided_reason = COALESCE(voided_reason, {esc(reason)}),
  updated_at = NOW()
FROM bookings b
WHERE i.booking_id = b.id AND b.booking_ref = {esc(ref)};
"""
        )

    # Invoices — fix issue_date in helper
    def inv(
        ref: str,
        issue: str,
        subtotal: float,
        total: float,
        lines: list,
        notes: str | None = None,
        discount_pct: float = 0,
    ) -> str:
        note_sql = f", notes = {esc(notes)}" if notes else ""
        line_rows = []
        for idx, (d, pk, q, up, lt) in enumerate(lines):
            line_rows.append(
                f"  ({idx}, {esc(d)}, {esc(pk) if pk else 'NULL'}, {q}, {up:.2f}, {lt:.2f}, {lt:.2f})"
            )
        lv = ",\n".join(line_rows)
        return f"""
INSERT INTO invoices (
  owner_id, booking_id, service_type, issue_date, status,
  subtotal, subtotal_aed, discount_amount, discount_aed, discount_pct,
  total, total_aed, amount_paid, paid_at{', notes' if notes else ''}
)
SELECT
  b.owner_id, b.id, 'boarding', '{issue}'::date, 'paid',
  {subtotal:.2f}, {subtotal:.2f}, 0, 0, {discount_pct:.2f},
  {total:.2f}, {total:.2f}, {total:.2f}, NOW(){f', {esc(notes)}' if notes else ''}
FROM bookings b
WHERE b.booking_ref = {esc(ref)}
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.booking_id = b.id);

UPDATE invoices i SET
  status = 'paid', issue_date = '{issue}'::date,
  subtotal = {subtotal:.2f}, subtotal_aed = {subtotal:.2f},
  discount_pct = {discount_pct:.2f}, total = {total:.2f}, total_aed = {total:.2f},
  amount_paid = {total:.2f}, paid_at = COALESCE(paid_at, NOW()){note_sql},
  updated_at = NOW()
FROM bookings b WHERE i.booking_id = b.id AND b.booking_ref = {esc(ref)};

DELETE FROM invoice_line_items li
USING invoices i, bookings b
WHERE li.invoice_id = i.id AND i.booking_id = b.id AND b.booking_ref = {esc(ref)};

INSERT INTO invoice_line_items (invoice_id, description, pricing_key, quantity, unit_price, total_price, line_total, service_type, sort_order)
SELECT i.id, v.description, v.pricing_key, v.quantity, v.unit_price, v.total_price, v.line_total, 'boarding', v.ord
FROM bookings b
JOIN invoices i ON i.booking_id = b.id
CROSS JOIN (VALUES
{lv}
) AS v(ord, description, pricing_key, quantity, unit_price, total_price, line_total)
WHERE b.booking_ref = {esc(ref)};
"""

    parts.append(
        inv(
            "WOOF-2026-00641",
            "2026-05-24",
            935.50,
            935.50,
            [
                ("Off-peak boarding (7 nights @ 115.50)", "boarding_night", 7, 115.50, 808.50),
                ("Peak boarding (1 night @ 127.50)", "boarding_night", 1, 127.50, 127.50),
                ("Adjustment / write-off", None, 1, -0.50, -0.50),
            ],
            notes="TC 10% noted but waived",
        )
    )
    parts.append(
        inv(
            "WOOF-2026-00700",
            "2026-05-24",
            180.50,
            180.50,
            [
                ("Boarding (1 night @ 115.50)", "boarding_night", 1, 115.50, 115.50),
                (
                    "Retail purchase — item unspecified by staff",
                    None,
                    1,
                    65.00,
                    65.00,
                ),
            ],
        )
    )
    parts.append(
        inv(
            "WOOF-2026-00709",
            "2026-05-24",
            115.50,
            115.50,
            [("Boarding (1 night @ 115.50)", "boarding_night", 1, 115.50, 115.50)],
        )
    )
    parts.append(
        inv(
            "WOOF-2026-00908",
            "2026-05-24",
            115.50,
            115.50,
            [("Boarding (1 night @ 115.50)", "boarding_night", 1, 115.50, 115.50)],
        )
    )
    parts.append(
        inv(
            "WOOF-2026-00835",
            "2026-06-01",
            2772.00,
            2772.00,
            [
                (
                    "Boarding — 2 dogs × 115.50/night × 12 nights",
                    "boarding_night",
                    24,
                    115.50,
                    2772.00,
                ),
            ],
            notes="Shared room with WOOF-2026-00846 (Cody, Savannah / Sushi) — operational only, no discount",
        )
    )
    parts.append(
        inv(
            "WOOF-2026-00846",
            "2026-06-01",
            1386.00,
            1386.00,
            [
                (
                    "Boarding — 1 dog × 115.50/night × 12 nights",
                    "boarding_night",
                    12,
                    115.50,
                    1386.00,
                ),
            ],
            notes="Shared room with WOOF-2026-00835 — operational only, no discount",
        )
    )

    # 00904 — paid, grooming TBD, total = boarding component only until staff updates
    parts.append(
        inv(
            "WOOF-2026-00904",
            "2026-06-03",
            1530.00,
            1530.00,
            [
                (
                    "Boarding/Training package — 170/night × 9 nights",
                    "boarding_night",
                    9,
                    170.00,
                    1530.00,
                ),
            ],
            notes="Manual review — grooming charge missing on training package",
        )
    )

    # STEP 2 bulk
    parts.append(
        """
-- === STEP 2: Bulk date updates from export xlsx (119 rows) ===
UPDATE bookings b SET
  check_in_date = v.check_in::date,
  check_out_date = v.check_out::date,
  updated_at = NOW()
FROM _may_audit_bulk v
WHERE b.booking_ref = v.booking_ref;
"""
    )

    parts.append("COMMIT;")
    parts.append("")
    parts.append("-- === Verification ===")
    parts.append(
        """
SELECT b.booking_ref, i.status, i.total
FROM bookings b
LEFT JOIN invoices i ON i.booking_id = b.id
WHERE b.booking_ref IN (
  'WOOF-2026-00641','WOOF-2026-00700','WOOF-2026-00709','WOOF-2026-00908',
  'WOOF-2026-00835','WOOF-2026-00846'
)
ORDER BY 1;

SELECT booking_ref, status, cancelled_reason FROM bookings WHERE booking_ref = 'WOOF-2026-00903';

SELECT b.booking_ref, i.status, i.voided_reason
FROM bookings b
LEFT JOIN invoices i ON i.booking_id = b.id
WHERE b.booking_ref IN ('WOOF-2026-00925','WOOF-2026-00725','WOOF-2026-00831');
"""
    )

    SQL_OUT.parent.mkdir(parents=True, exist_ok=True)
    SQL_OUT.write_text("\n".join(parts), encoding="utf-8")
    print(f"Wrote {SQL_OUT} ({len(parts)} sections, {len(bulk)} bulk rows)")

    # missing refs report helper
    refs = [str(r[4]).strip() for r in rows if r and r[4]]
    with (EXPORTS / "may23-25_xlsx_refs.txt").open("w") as f:
        f.write("\n".join(sorted(set(refs))))


if __name__ == "__main__":
    main()
