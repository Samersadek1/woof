#!/usr/bin/env python3
"""Emit invoice upsert SQL blocks (CROSS JOIN fix). Paste output or use with MCP."""

INVOICES = [
    {
        "ref": "WOOF-2026-00700",
        "issue": "2026-05-24",
        "total": 180.50,
        "notes": None,
        "lines": [
            (0, "Boarding (1 night @ 115.50)", "boarding_night", 1, 115.50, 115.50),
            (1, "Retail purchase — item unspecified by staff", None, 1, 65.00, 65.00),
        ],
    },
    {
        "ref": "WOOF-2026-00709",
        "issue": "2026-05-24",
        "total": 115.50,
        "notes": None,
        "lines": [(0, "Boarding (1 night @ 115.50)", "boarding_night", 1, 115.50, 115.50)],
    },
    {
        "ref": "WOOF-2026-00908",
        "issue": "2026-05-24",
        "total": 115.50,
        "notes": None,
        "lines": [(0, "Boarding (1 night @ 115.50)", "boarding_night", 1, 115.50, 115.50)],
    },
    {
        "ref": "WOOF-2026-00835",
        "issue": "2026-06-01",
        "total": 2772.00,
        "notes": "Shared room with WOOF-2026-00846 (Cody, Savannah / Sushi) — operational only, no discount",
        "lines": [
            (0, "Boarding — 2 dogs × 115.50/night × 12 nights", "boarding_night", 24, 115.50, 2772.00),
        ],
    },
    {
        "ref": "WOOF-2026-00846",
        "issue": "2026-06-01",
        "total": 1386.00,
        "notes": "Shared room with WOOF-2026-00835 — operational only, no discount",
        "lines": [
            (0, "Boarding — 1 dog × 115.50/night × 12 nights", "boarding_night", 12, 115.50, 1386.00),
        ],
    },
    {
        "ref": "WOOF-2026-00904",
        "issue": "2026-06-03",
        "total": 1530.00,
        "notes": "Manual review — grooming charge missing on training package",
        "lines": [
            (0, "Boarding/Training package — 170/night × 9 nights", "boarding_night", 9, 170.00, 1530.00),
        ],
    },
]


def esc(s):  # type: (str | None) -> str
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def block(inv: dict) -> str:
    ref = inv["ref"]
    total = inv["total"]
    issue = inv["issue"]
    notes = inv["notes"]
    line_vals = ", ".join(
        f"({o}, {esc(d)}, {esc(pk) if pk else 'NULL'}, {q}, {up:.2f}, {lt:.2f}, {lt:.2f})"
        for o, d, pk, q, up, lt in inv["lines"]
    )
    notes_col = ", notes" if notes else ""
    notes_sel = f", {esc(notes)}" if notes else ""
    notes_upd = f", notes = {esc(notes)}" if notes else ""
    return f"""
INSERT INTO invoices (owner_id, booking_id, service_type, issue_date, status, subtotal, subtotal_aed, discount_amount, discount_aed, discount_pct, total, total_aed, amount_paid, paid_at{notes_col})
SELECT b.owner_id, b.id, 'boarding', '{issue}'::date, 'paid', {total:.2f}, {total:.2f}, 0, 0, 0, {total:.2f}, {total:.2f}, {total:.2f}, NOW(){notes_sel}
FROM bookings b WHERE b.booking_ref = {esc(ref)} AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.booking_id = b.id);
UPDATE invoices i SET status='paid', issue_date='{issue}'::date, subtotal={total:.2f}, subtotal_aed={total:.2f}, total={total:.2f}, total_aed={total:.2f}, amount_paid={total:.2f}, paid_at=COALESCE(paid_at,NOW()){notes_upd}
FROM bookings b WHERE i.booking_id=b.id AND b.booking_ref={esc(ref)};
DELETE FROM invoice_line_items li USING invoices i, bookings b WHERE li.invoice_id=i.id AND i.booking_id=b.id AND b.booking_ref={esc(ref)};
INSERT INTO invoice_line_items (invoice_id, description, pricing_key, quantity, unit_price, total_price, line_total, service_type, sort_order)
SELECT i.id, v.description, v.pricing_key, v.quantity, v.unit_price, v.total_price, v.line_total, 'boarding', v.ord
FROM bookings b JOIN invoices i ON i.booking_id = b.id
CROSS JOIN (VALUES {line_vals}) AS v(ord, description, pricing_key, quantity, unit_price, total_price, line_total)
WHERE b.booking_ref = {esc(ref)};
"""


if __name__ == "__main__":
    print("\n".join(block(i) for i in INVOICES))
