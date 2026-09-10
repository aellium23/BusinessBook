# CWM pricing update — for review before anything runs

Generated 10 September 2026 from **BUSINESS BOOK — PRICING UPDATE**.
Nothing has been executed. This is step 2 of the sequence in section 0.2.

---

## Summary

| | |
|---|---|
| Tables touched | `products`, `product_price_tiers` |
| Statements | 11 `UPDATE`, 1 `INSERT` |
| Rows affected | **12** — 3 on `products`, 9 on `product_price_tiers` |
| Schema changes | **none** — no `DROP`, `ALTER` or `TRUNCATE` |
| Products left untouched | CWM VR, CWM AI Reporting, CWM ES, CWM RIS/BI, CWM Command Center |

Every `UPDATE` also matches on the current value, so a row already changed by
someone else will not match and the row count will fall short — which is the
signal to roll back rather than commit.

---

## 1. What was found to be correct, and needs no change

Two ladders already match section 9 exactly. This is worth stating, because it
means the error is confined to CWM-Dose rather than general.

**CWM VR** — 950 / 850 / 775 / 700 / 625 / 560 / 495, minimum $4,000. Exact.

**CWM AI Reporting** — 1.50 / 1.20 / 0.95 / 0.75 / 0.62 / 0.50 / 0.39, minimum
$28,000. Exact, including the $28,000 correction in section 6d.

**Pricing regions** — R1 −8, R2 −20, R3 −36, R4 −48. Exact.

---

## 2. `products` — 3 rows

| SKU | Column | Current | New | Authorised by |
|---|---|---|---|---|
| CWM-DOSE | `min_annual_commitment` | 8000.00 | **9500.00** | §9 |
| CWM-DOSE | `site_cap_annual` | 28000.00 | **null** | §1 — withdrawn entirely |
| CWM-DOSE | `price_unit` | `study` | **`exam`** | §1, §8.20 |

**Risk to check before running:** if `products.price_unit` carries a `CHECK`
constraint that does not list `exam`, the third statement fails and the whole
transaction rolls back. That is the safe failure. Confirm with:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.products'::regclass and contype = 'c';
```

---

## 3. `product_price_tiers` — CWM-Dose, 9 rows

The entire curve is replaced. §2.2.

| # | Current band | Current $ | New band | New $ |
|---|---|---|---|---|
| 1 | Up to 15,000 studies | 0.80 | Up to 15,000 exams | **1.30** |
| 2 | 15,001 – 30,000 | 0.60 | 15,001 – 30,000 | **1.19** |
| 3 | 30,001 – 60,000 | 0.40 | 30,001 – 60,000 | **1.06** |
| 4 | 60,001 – **125,000** | 0.28 | 60,001 – **100,000** | **0.92** |
| 5 | **125,001** – 250,000 | 0.20 | **100,001** – 250,000 | **0.77** |
| 6 | 250,001 – 500,000 | 0.15 | 250,001 – 500,000 | **0.70** |
| 7 | 500,001 – 1,000,000 | 0.12 | 500,001 – 1,000,000 | **0.62** |
| 8 | **Over 1,000,000** | 0.09 | **1,000,001 – 5,000,000** | **0.55** |
| 9 | — | — | **Over 5,000,000** *(new row)* | **0.46** |

Rows 4 and 5 move their shared boundary from 125,000 to 100,000, per the band
boundary note in §2.2. Row 8 stops being open-ended and row 9 is inserted.

Per §7.4, everything above 500,000 exams a year is extrapolated from a single
negotiation and should be labelled provisional wherever it is presented.

---

## 4. Revenue-model impact — FLAGGED, NOT RECALCULATED

§2.5 and §0.3 both require this to stop here. **No forecast or budget figure has
been touched.**

The site cap is the dominant defect, and it is worse than the brief describes.
At $28,000 it flattens every deal above roughly 140,000 exams to the same
number, so the database currently returns the same price for a 200,000-exam
hospital and an 8,000,000-exam network.

| Annual exams | Database today | After this change | §2.5 expects | Factor |
|---|---|---|---|---|
| 200,000 | €19,285 | €106,070 | €106,070 | **5.5×** |
| 1,500,000 | €19,285 | €568,231 | €568,231 | **29.5×** |
| 8,000,000 | €19,285 | €2,534,653 | €2,534,653 | **131.4×** |

The three "after" figures reproduce §2.5 exactly from the curve, the R2 factor
and EUR/USD 1.1615 — which is the check that the curve has been read correctly.

**Elio decides whether any model is re-run.**

---

## 5. Code changes that go with this — not part of the SQL

These are text and test edits, reversible through git. Listed here so the whole
change is reviewed at once, but **not yet made**.

| File | Line | Change | Why |
|---|---|---|---|
| `src/lib/__tests__/pricing.test.js` | 15, 20-21 | Fixture carries $0.20, `Over 1,000,000`, site cap 28000, minimum 8000 | §1 |
| `src/lib/__tests__/pricing.test.js` | 79-91 | Three tests **assert** the site cap works | Asserting something withdrawn |
| `src/pages/Products.jsx` | 432 | "e.g. 0.53 = €0.53 per study" | Level right, unit wrong — §8.20 |
| `src/components/HelpGuide.jsx` | 983/1023/1061 | "€0.53 per study" (en/es/pt) | idem |
| `src/components/HelpGuide.jsx` | 984/1024/1062 | "CWM Dose is volume-licensed" | Should say exam per year — §8.1 |

`src/lib/pricing.js` needs **no change**: the site-cap mechanism stays for any
product that legitimately has one, and CWM-Dose simply stops carrying a value.

---

## 6. Out of scope — needs schema change, which §0.2 forbids here

Listed and stopped, as instructed.

| | What | Section |
|---|---|---|
| 1 | `pricing_model` on VR, AI Reporting, RIS/BI and ES is `license_plus_annual`, so their tier price is booked as a **one-off licence** rather than a recurring annual fee | §8.15 |
| 2 | VR banding must follow the **total covered estate**, VR seats plus AI Reporting radiologists — banding across two quote lines | §4.4 |
| 3 | Concurrent access at 2.2× the named rate, labelled a commercial judgement | §3.2 |
| 4 | Approval ladder 0–10 none / 10–20 Country Manager / 20–30 P&L owner / >30 named programme | §9 |
| 5 | Protected partner margin 35 / 20 / 15 and the `CWM revenue given up to fund the discount` line | §6b |
| 6 | Evidence gate per discount line, with a `NO EVIDENCE — not valid` state and a STOP verdict | §6c |
| 7 | Discount expiry and lighthouse clawback; renewal starts from regional list | §6c |

**Item 1 is not cosmetic.** A CWM VR quote at $500 per radiologist is currently
recorded as one-off revenue when it is recurring. That reaches the forecast and
the ARR, not just a screen. It is a one-column change but it alters behaviour,
so it is flagged rather than done.

The quote screen also feeds one volume figure to every product, ignoring the
`price_unit` each already carries — so a quote combining VR and Dose looks up
the VR band for *200,000 radiologists*. That one is a UI fix, needs no schema
change, and is the most urgent thing on this page.

---

## 7. Insufficient evidence

`INSUFFICIENT EVIDENCE — CONFIRM WITH ELIO` for all of these. The brief gives no
figures and none have been invented.

- **CWM RIS/BI** — 5 bands, $8,000 to $46,000 by study volume. §6d mentions only
  that the $2,240 mandatory annual fee is a derived inference, not a supplied
  figure, and that obtaining the real published fee is an open action.
- **CWM ES** — 5 bands, $6,500 to $3,500 per procedure room.
- **CWM Command Center** — 7 categorical bands, $37,500 to $595,000.
- **CWM ES Diamond, ES Silver, IVD Connectivity, Teleradiology** — inactive, no
  pricing. Left alone.

---

## 8. If you approve

1. Back up `products` and `product_price_tiers`.
2. Run the constraint check in section 2 above.
3. Run `pricing_update.sql`. It opens a transaction and does **not** commit.
4. Read the verification `SELECT`. Nine bands, 1.30 down to 0.46, `site_cap_annual`
   null, minimum 9500, unit `exam`.
5. If it matches: `commit;`. If anything differs: `rollback;` and tell me.

`pricing_rollback.sql` reverses everything, and restores values the brief calls
wrong — it exists for reversibility, not because the old numbers are right.
