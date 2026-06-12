# Forecast Page — Implementation Plan
# Created: 2026-06-12 (end of session)
# Status: READY TO BUILD in next session

## Overview
New page `/forecast` with 2 tabs:
1. **Forecast Calendar** — drag & drop deals to months
2. **EST1 Builder** — aggregate deals into Japanese HQ Excel format

## Tab 1: Forecast Calendar

### Features
- Timeline view: 12 months of FY26 (Apr→Mar), focus on remaining (Jul→Mar)
- "Unallocated" column for deals without rec_month
- Native HTML5 drag & drop (same pattern as KanbanBoard.jsx)
- On drop → UPDATE deals SET rec_month, rec_year + distribute value into month column
- Monthly totals (weighted by stage: Lead 0.10, Pipeline 0.30, Offer 0.60, BackLog 1.00)
- Filters: BU (VGT/ECT), stage, sales_type, product
- Deal cards show: client name, value (K€), stage badge, product tag

### Technical
- New route in App.jsx: `/forecast` with Guard page="forecast"
- New file: src/pages/Forecast.jsx
- Reuse: useDeals hook, KanbanBoard drag pattern, CollapsibleSection, formatK, stage weights from constants.js
- Update rec_month/rec_year via supabase.from('deals').update()
- Add 'forecast' to admin/manager/member page lists in ROLE_PERMISSIONS

## Tab 2: EST1 Builder

### Japanese HQ Excel Structure (5 files, identical VGT/ECT)

#### Sales by Product (quarterly, K€)
Products: PACS, VNA, RIS, Synapse 3D, Pathology/DP, Others
Each product has sub-lines: (1) SW, (2) SE/PS, (3) 3rd Party SW/HW
Plus: B. Maintenance total, C. Rental/MES/OPEX total
Plus: New Business vs Existing Base Revenue split
Quarters: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
EST1 columns to fill: Q1, Q2, Q3, Q4 (+ FY25 Q3/Q4 actuals)

#### Internal Sales (VGT only, semi-annual, K€)
Regions: Spain, UK, Other Europe, Mexico, Other Latin America, Middle East, Other regions
Each region: sales amount + margin % (MP)
Periods: 1H (Apr-Sep), 2H (Oct-Mar) for EST1

#### FTE (manual, no CRM automation)
Functions: BU head, Account sales, Sales admin, Product spec, PM, Engineer, QA/RA, R&D
Point-in-time: March 2027 forecast

### Mapping Rules (confirmed by user)

#### Product mapping
- deal.product field → if empty, infer from deal client name
- PACS: product contains 'PACS' or 'Synapse' (but not '3D') or 'CWM'
- VNA: product contains 'VNA'
- RIS: product contains 'RIS'
- Synapse 3D: product contains '3D'
- Pathology/DP: product contains 'Patholog' or 'DP' or 'Digital Path'
- Others: everything else (including CV, EIS, Medportal, etc.)

#### Category mapping
- SW vs SE/PS vs 3rd Party: NOT YET DISTINGUISHED in CRM. Aggregate all for now; separate later if needed.
- Maintenance: SLAs (is_sla=true or converted_to_sla=true) + deals with deal_type containing 'Recurring'
- Rental/MES/OPEX: business_model IN ('opex','saas','pay_per_study')
- Product sales: everything else (capex, one-shot, hybrid, null)

#### New Business vs Existing Base
- New Business = customer buying a Core Product (PACS, VNA, CV, EIS, DP) for the FIRST TIME
  OR existing customer adding a NEW Core System they didn't have before
- Core Products: PACS, VNA, CV (CardioVascular), EIS, DP (Digital Pathology)
- Existing Base = maintenance renewals, service upgrades, recurring revenue, non-core products
- Detection: check if customer has any prior Invoiced deal with same core product category
  - If no prior invoiced core product → New Business
  - If prior exists but different core product → New Business
  - Otherwise → Existing Base

#### Internal Sales regions (VGT only)
- Map from deal trading partner / client name:
  - Spain/ECT: deals with client containing 'ECT' or sales_type='Internal' destined to Spain
  - UK: client contains 'FUJIFILM UK' or 'Healthcare UK'
  - Middle East: client contains 'FUJIFILM MIDDLE EAST' or 'FZE'
  - Latin America: client contains Americas/Mexico/Colombia/Chile/Peru/Costa Rica/Guatemala/Honduras/Brazil
  - Other Europe: other internal deals not matching above
  - Other regions: remainder

### EST1 Builder UI
- Read-only grid mimicking Excel structure
- Auto-populated from CRM deals (using Forecast Calendar allocations)
- Side-by-side: BUD values (from budget table) vs EST1 computed values
- "Copy to clipboard" per section (paste into Japanese Excel)
- Optionally: "Save as EST1" → write to budget table cycle='EST1'

## Files to create/modify
- NEW: src/pages/Forecast.jsx (main page with tabs)
- NEW: src/components/forecast/ForecastCalendar.jsx
- NEW: src/components/forecast/EST1Builder.jsx
- MODIFY: src/App.jsx (add route)
- MODIFY: src/hooks/useAuth.jsx (add 'forecast' to ROLE_PERMISSIONS pages)
- MODIFY: src/components/Layout.jsx (add menu item)
- MODIFY: src/components/HelpGuide.jsx (add /forecast entry in 3 languages)

## HQ Excel files location (for reference)
- VGT Sales by Product: uploads/.../979c1244-MI_FFPT_Sales_by_product_FY26EST1.xlsx
- VGT Internal Sales: uploads/.../93402825-MI_PT_Internal_sales_FY26EST1.xlsx
- VGT FTE: uploads/.../7e490f1e-MI_FY26EST1_FTE_FFPT.xlsx
- ECT Sales by Product: uploads/.../91d6f176-MI_HCES_Sales_by_product_FY26EST1.xlsx
- ECT FTE: uploads/.../68aceea1-MI_FY26EST1_FTE_HCES.xlsx
