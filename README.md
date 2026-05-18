# Vijayanth PM & Finance Prototype

Local demo prototype for Vijayanth Renewable Energy Projects — project management and finance tracking for solar EPC.

## Setup

```bash
git clone <repo-url> && cd vijayanth-group
cp .env.example .env
npm install
npm run db:reset
npm run dev
```

Open **http://localhost:5173** (API on port **3001**). Run `npm run dev` from the **repo root** so both API and Vite start together.

## Demo credentials

| Email | Password | Role | Scope |
|-------|----------|------|-------|
| admin@vijayanth.in | demo123 | Super Admin | All |
| corporate@vijayanth.in | demo123 | Corporate Office | All |
| solar.head@vijayanth.in | demo123 | Sector Head | Solar |
| suresh@vijayanth.in | demo123 | Project Head | Usilampatti 1 MW |
| kavi@vijayanth.in | demo123 | Project Head | Usilampatti 4 MW |

Use **Demo: switch role** in the top bar to change users without logging out.

## Routes & features

| Route | Description |
|-------|-------------|
| `/` | Role-specific dashboard (KPIs, charts, delayed tasks, approvals) |
| `/approvals` | Unified PO + payment approval queue with budget breach warnings |
| `/projects`, `/projects/:id` | Portfolio; project hub with live tabs (WBS, tasks, POs, payments, invoices, docs, audit) |
| `/tasks?projectId=` | Task list; create/edit tasks |
| `/daily-status` | Daily site status submissions |
| `/vendors` | Vendor master — create/edit; detail shows linked POs |
| `/quotations`, `/pos/:id` | Quotation wizard and PO detail/approval |
| `/grn`, `/vendor-invoices` | GRN and vendor invoice capture |
| `/payments`, `/invoices`, `/receivables` | Payments (UTR execute), customer invoices, receipt recording |
| `/documents`, `/reports`, `/audit`, `/settings` | Documents, Excel exports, audit log, users/thresholds/templates |

**Project context:** Use the project switcher in the top bar or `?projectId=` on list pages. A context banner links back to the project hub.

## 15-minute demo script

1. **Suresh** — Login; dashboard shows delayed tasks (red), budget burn chart, today's tasks.
2. **Suresh** — Update a delayed task; add remark; check toast.
3. **Sector Head** — Switch role; sector dashboard, heat-map, `/approvals` queue.
4. **Sector Head** — Open 1 MW project → Budget/WBS; drill PV Module line → linked POs.
5. **Suresh** — New quotation (PV Modules); Solex vs Saatvik quotes; select Solex; submit PO (~₹18.56L).
6. **Sector Head** — Approve PO from `/approvals` (budget impact + breach ack if needed).
7. **Suresh** — Confirm PO approved; payment request ₹2L.
8. **Sector Head** — Approve payment from `/approvals`.
9. **Suresh** — Execute payment with UTR; verify WBS paid amount on project hub.
10. **Suresh/Sector Head** — Customer proforma ₹15L; record receipt on `/receivables`.
11. **Corporate** — Portfolio P&L dashboard.
12. **Super Admin** — Audit log (filter today); Settings → users.
13. **Any role** — Export Project P&L to Excel.

## CRUD (POC)

- **Vendors:** Add / edit from `/vendors`
- **Tasks:** Add / edit from `/tasks` or project Tasks tab
- **Projects:** Sector Head+ — Create from template on `/projects`
- **Users:** Super Admin — Add user on `/settings`
- **Thresholds:** Inline edit on Settings
- **Receipts:** Record on `/receivables`
- **GRN / vendor invoices:** Forms on respective pages

## Reset demo data

```bash
npm run db:reset
```

Or **Settings → Reset demo data** (Super Admin).

## Known limitations

- Email, payment gateway, cloud storage, SSO, and Tally export are mocked (toasts only).
- SQLite file database; not production-hardened (no MFA, rate limits).
- Single-company; no automated scheduled jobs.
- Runs on localhost only; no CI/CD in this prototype.
