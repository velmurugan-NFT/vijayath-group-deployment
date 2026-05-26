import { Router } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { projectFilter } from '../lib/scope.js';
import { N, sumAmounts } from '../lib/money.js';
const router = Router();
function parseDate(q, fallback) {
    if (!q)
        return fallback;
    const d = new Date(String(q));
    return isNaN(d.getTime()) ? fallback : d;
}
router.get('/pl', requireAuth, async (req, res, next) => {
    try {
        assertCan(req.user, 'reports:export');
        const from = parseDate(req.query.from, new Date('2025-01-01'));
        const to = parseDate(req.query.to, new Date());
        const pf = await projectFilter(req.user);
        const projects = await prisma.project.findMany({
            where: { ...pf, parentId: { not: null } },
            include: { wbsLineItems: true, customerReceipts: true },
        });
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Project P&L');
        ws.columns = [
            { header: 'Project', key: 'name', width: 30 },
            { header: 'Billable (₹)', key: 'billable', width: 18 },
            { header: 'Net Cost (₹)', key: 'netCost', width: 18 },
            { header: 'Paid (₹)', key: 'paid', width: 18 },
            { header: 'Profit (₹)', key: 'profit', width: 18 },
            { header: 'Received (₹)', key: 'received', width: 18 },
        ];
        ws.getRow(1).font = { bold: true };
        for (const p of projects) {
            const paid = sumAmounts(p.wbsLineItems.map((l) => l.paid));
            const received = sumAmounts(p.customerReceipts.filter((r) => r.receivedAt >= from && r.receivedAt <= to).map((r) => r.amount));
            ws.addRow({ name: p.name, billable: N(p.billable), netCost: N(p.netCost), paid, profit: N(p.profit), received });
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=project-pl.xlsx');
        await wb.xlsx.write(res);
    }
    catch (err) {
        next(err);
    }
});
router.get('/budget-variance', requireAuth, async (req, res, next) => {
    try {
        assertCan(req.user, 'reports:export');
        const pf = await projectFilter(req.user);
        const items = await prisma.wBSLineItem.findMany({
            where: { project: pf },
            include: { category: true, project: true },
        });
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Budget Variance');
        ws.columns = [
            { header: 'Project', key: 'project', width: 25 },
            { header: 'Category', key: 'category', width: 25 },
            { header: 'Line Item', key: 'desc', width: 35 },
            { header: 'Estimated', key: 'est', width: 15 },
            { header: 'Committed', key: 'com', width: 15 },
            { header: 'Paid', key: 'paid', width: 15 },
            { header: 'Variance', key: 'var', width: 15 },
        ];
        ws.getRow(1).font = { bold: true };
        for (const li of items) {
            ws.addRow({
                project: li.project.name, category: li.category.name, desc: li.description,
                est: N(li.estimated), com: N(li.committed), paid: N(li.paid), var: N(li.committed) - N(li.estimated),
            });
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=budget-variance.xlsx');
        await wb.xlsx.write(res);
    }
    catch (err) {
        next(err);
    }
});
router.get('/receivables-ageing', requireAuth, async (req, res, next) => {
    try {
        assertCan(req.user, 'reports:export');
        const pf = await projectFilter(req.user);
        const projects = await prisma.project.findMany({
            where: { ...pf, parentId: { not: null } },
            include: { customerReceipts: true, customerInvoices: true },
        });
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Receivables Ageing');
        ws.columns = [
            { header: 'Project', key: 'name', width: 30 },
            { header: 'Billable', key: 'billable', width: 15 },
            { header: 'Received', key: 'received', width: 15 },
            { header: 'Balance', key: 'balance', width: 15 },
            { header: '% Collected', key: 'pct', width: 12 },
        ];
        ws.getRow(1).font = { bold: true };
        for (const p of projects) {
            const received = sumAmounts(p.customerReceipts.map((r) => r.amount));
            const billable = N(p.billable);
            ws.addRow({
                name: p.name, billable, received, balance: billable - received,
                pct: billable > 0 ? Math.round((received / billable) * 100) : 0,
            });
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=receivables-ageing.xlsx');
        await wb.xlsx.write(res);
    }
    catch (err) {
        next(err);
    }
});
export default router;
