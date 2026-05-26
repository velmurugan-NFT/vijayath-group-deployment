# Vijayanth Prototype — Gap Analysis Report

**Branch:** `demo-dev`  
**Date:** 25-May-2026  
**Reference documents:** BRD_Vijayanth_v2.docx · Prototype_Build_Brief_v2.docx · Vijayanth_Prototype_Tracker_v1.xlsx

---

## 1. Executive Summary

The prototype covers all **13 demo storyline steps** defined in Build Brief §2.3 end-to-end. Core workflows — quotation → PO → approval → payment → invoice — are fully implemented with the correct role-scoped dashboards, budget breach warnings, and audit trail. Six secondary reports are stubs, one page is built but unrouted, and three Settings panels are placeholders.

| Category | Total Required | Built & Working | Gaps |
|---|---|---|---|
| Demo storyline steps | 13 | 13 | 0 |
| Pages / routes | ~22 | 21 | 1 unrouted |
| Reports (Excel export) | 9 | 3 | 6 stubs |
| Settings panels | 7 | 4 | 3 placeholder |
| PDF invoice download | 1 | 1 | 0 |
| Template management | Full CRUD | Read-only list | Edit/Create missing |

---

## 2. What Is Built and Working

### 2.1 Authentication & Shell
- Login page — Forest Green `#133E22` background, Gold `#D9B963` logo, demo credentials table below form
- Session-based auth (express-session + bcrypt)
- Demo role-switcher in top bar — switches between all 4 roles without logout
- Role-aware sidebar navigation (Project Head has no Settings; Super Admin sees everything)

### 2.2 Dashboards
All four role-scoped dashboard variants are implemented with Recharts bar charts:

| Role | Dashboard Content |
|---|---|
| Project Head | Budget summary KPIs, delayed tasks (red rows), today's planned tasks, recent activity |
| Sector Head | Project heat-map table, ageing receivables panel, pending approvals queue, sector P&L |
| Corporate Office | Portfolio P&L metric cards, top delayed projects, top receivables risks |
| Super Admin | Full portfolio view + system metrics |

### 2.3 Projects & WBS
- Projects list with parent/sub-project hierarchy and status badges
- Project detail with 8 tabs: Overview · Budget/WBS · Tasks · Purchase Orders · Payments · Invoices · Documents · Activity
- Budget/WBS tree: Category → Line Items with Estimated / Committed / Paid / Remaining columns
- Drill-down from WBS line item to contributing POs
- Budget bar visual indicator per category

### 2.4 Task Management
- Task list grouped by department with delay flag column (amber/red)
- Delay auto-detection (planned end in past, status not Completed)
- Status update modal with remarks field → toast notification + audit log entry
- Daily Status reporting page (per-project submission)

### 2.5 Vendor & Procurement Workflow
- Vendor master: CRUD with GSTIN, PAN, bank details, 10+ seeded vendors
- Full quotation flow:
  1. Create quotation request (linked to WBS line item)
  2. Capture vendor quotes (amount, delivery days, notes)
  3. Side-by-side comparison table
  4. Select winner; if non-lowest price, reason is mandatory
  5. Auto-draft PO from winning quote

### 2.6 PO Approval Workflow
- Multi-tier approval routing based on PO amount vs. role ceiling thresholds
- PO detail: header with status badge, approval timeline, line items table
- **Budget breach warning panel** — if PO pushes a WBS line item over estimate, a red warning shows current committed, new committed, and variance %; approver must tick "I acknowledge this exceeds the budget estimate" checkbox to proceed
- Approve / Reject / Return for Edit actions

### 2.7 Payment Workflow
- Payment request creation linked to approved PO
- Approval routing (same tier logic as POs)
- UTR entry form for payment execution
- WBS line item paid amount and remaining balance update on payment execution

### 2.8 Customer Billing & Receivables
- Generate Proforma or Tax invoice against a project
- **PDF download** via pdf-lib (backend route: `GET /invoices/:id/pdf`)
- Mock email toast: "Email would be sent to [client contact]"
- Receivables page: Billable / Received / Balance / % Collected with ageing table (0–30, 31–60, 61–90, 90+ days)

### 2.9 Supporting Modules
- **Document repository**: file upload (multer → local `/uploads`), list with category/version/uploader, download
- **GRN (Goods Received Notes)**: create and list GRNs against approved POs
- **Vendor Invoices**: record and track vendor invoices per PO
- **Audit log**: chronological table filtered by date, user, entity type; scoped to Super Admin + Corporate Office
- **Approvals queue**: dedicated page showing all pending PO and payment approvals for the current role

### 2.10 Reports (3 of 9 working)
- Project P&L → real `.xlsx` download via exceljs
- Budget Variance → real `.xlsx` download
- Receivables Ageing → real `.xlsx` download
- Date range filter (From / To) on all reports

### 2.11 Settings
- **Users**: CRUD — create user with name, email, role, password
- **Approval Thresholds**: editable ceiling per role tier with inline save on blur
- **Reset Demo Data**: wipes and re-seeds all data; Super Admin only

### 2.12 UI Quality Compliance
- Empty states on every list view (branded with Vijayanth logo watermark)
- Confirmation toasts on every meaningful action (green success / red error)
- Loading skeletons on tables while data loads
- Indian number formatting throughout (`₹1,85,64,000`)
- `DD-MMM-YYYY` date format throughout
- Brand theme applied consistently: Forest Green sidebar, Gold accents, alternating table rows `#F4F9F4`

---

## 3. Missing / Incomplete Features

### 3.1 Critical — Affects Demo or Navigation

#### `PendingQuotationsPage` — built but unrouted
**File:** `frontend/src/App.tsx`

The component `PendingQuotationsPage` is imported at the top of `App.tsx` but **no `<Route>` is registered for it**. The file `frontend/src/pages/PendingQuotationsPage.tsx` even contains the comment:

```
Route: /pending-quotations
Add to App.tsx:  <Route path="pending-quotations" element={<PendingQuotationsPage />} />
```

This page provides a unified view for managing all pending quotation requests — inline quote capture, winner selection, and PO creation — from a single screen. It is currently **completely inaccessible**.

**Fix required:** Add one route line to `App.tsx` and one nav item to the sidebar.

---

### 3.2 High — BRD-Required Features Partially Missing

#### 6 of 9 Reports are stubs — no download
**File:** `frontend/src/pages/ReportsPage.tsx` (line ~50)

Only the first three report types call the real API. The remaining six show a toast:
> *"Report template ready — export via Excel for demo types"*

| Report | Backend Route | Frontend Status |
|---|---|---|
| Project P&L | `GET /reports/pl` | ✅ Real .xlsx |
| Budget Variance | `GET /reports/budget-variance` | ✅ Real .xlsx |
| Receivables Ageing | `GET /reports/receivables-ageing` | ✅ Real .xlsx |
| Vendor Spend | Not implemented | ❌ Stub toast |
| Payment Ageing | Not implemented | ❌ Stub toast |
| Daily Work Status | Not implemented | ❌ Stub toast |
| Weekly Digest | Not implemented | ❌ Stub toast |
| GST Register | Not implemented | ❌ Stub toast |
| Asset Register | Not implemented | ❌ Stub toast |

---

#### "Run Weekly Digest Now" button — missing
**Build Brief §2.2:** *"Scheduled jobs, weekly digest automation — out of scope. A manual 'Run weekly digest now' button is sufficient."*

No such button exists anywhere in the UI. The Weekly Digest report card does not have this trigger.

---

### 3.3 Medium — Settings Panels Incomplete

#### Template management is read-only
**File:** `frontend/src/pages/SettingsPage.tsx` (line 91–95)

Settings section 2 (Templates) renders only a read-only list of template names as plain `<p>` tags:

```tsx
<CardBody>
  {templates.map((t) => <p key={String(t.id)}>{String(t.name)}</p>)}
</CardBody>
```

No create, edit, or delete capability. The `Template` Prisma model has `tasksJson` and `description` fields that are never surfaced.

**BRD requirement:** *"Template management: at least one Solar template viewable and editable by the Sector Head role; create-from-template flow demonstrable."*

Note: The `create-from-template` dropdown in the project creation form is wired up (template is passed to the backend), so the apply-template flow partially works — but templates cannot be edited to customise them.

---

#### Bank Accounts panel — placeholder
**File:** `frontend/src/pages/SettingsPage.tsx`

Settings section 4 (Bank Accounts) falls into the catch-all:
> *"Configuration section available in full BRD build."*

The `BankAccount` Prisma model exists with `bankName`, `accountNumber`, `ifsc`, `isDefault` fields but no UI renders or manages it.

---

#### System Config panel — placeholder
Settings section 5 (System Config) is similarly a placeholder. No functional content.

---

### 3.4 Low — Data Model Without UI

#### Attendance headcount tracking
The `Attendance` Prisma model exists (`projectId`, `userId`, `date`, `headcount`, `notes`) and is populated by the seed script, but the Daily Status page has no attendance entry form or headcount display. This was part of the daily reporting requirement in the BRD.

---

## 4. Feature Coverage by Demo Step

| Step | Action | Status |
|---|---|---|
| 1 | PH dashboard — delayed tasks, budget summary, today's tasks | ✅ |
| 2 | Open delayed task, update status, add remark, audit log entry | ✅ |
| 3 | Switch to SH — sector heat-map, ageing receivables, approvals queue | ✅ |
| 4 | Open 1 MW Budget/WBS with real ₹ figures, drill into PV Module | ✅ |
| 5 | Raise quotation, capture 2 quotes, compare, select winner, draft PO, submit | ✅ |
| 6 | SH approves PO with budget impact preview | ✅ |
| 7 | PH raises payment request ₹2L advance | ✅ |
| 8 | SH approves payment request | ✅ |
| 9 | PH executes payment with UTR; WBS updates | ✅ |
| 10 | Generate proforma invoice ₹15L; receivables updates | ✅ |
| 11 | CO portfolio dashboard, P&L | ✅ |
| 12 | SA audit log, filter by today, all actions visible | ✅ |
| 13 | Export Project P&L to Excel, open downloaded file | ✅ |

**All 13 demo steps pass on a fresh `npm run db:reset`.**

---

## 5. Recommended Fix Priority

| Priority | Item | Effort |
|---|---|---|
| P0 | Register `PendingQuotationsPage` route in `App.tsx` + sidebar nav item | 15 min |
| P1 | Implement 6 remaining Excel reports in `backend/src/routes/reports.ts` | 1–2 days |
| P1 | Add "Run Weekly Digest Now" button to Reports page | 2 hours |
| P2 | Template CRUD in Settings (edit name + tasksJson) | Half day |
| P2 | Bank Accounts CRUD in Settings | Half day |
| P3 | Attendance headcount UI in Daily Status page | Half day |
| P3 | System Config panel (app-level settings) | 1 day |
