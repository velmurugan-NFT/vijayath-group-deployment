import { PrismaClient } from '@prisma/client';

const Role = { SUPER_ADMIN: 'SUPER_ADMIN', CORPORATE_OFFICE: 'CORPORATE_OFFICE', SECTOR_HEAD: 'SECTOR_HEAD', PROJECT_HEAD: 'PROJECT_HEAD' };
const ProjectStatus = { IN_EXECUTION: 'IN_EXECUTION' };
const TaskStatus = { NOT_STARTED: 'NOT_STARTED', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED' };
const POStatus = { APPROVED: 'APPROVED' };
const PaymentRequestStatus = { PAID: 'PAID', PENDING_APPROVAL: 'PENDING_APPROVAL' };
const InvoiceType = { PROFORMA: 'PROFORMA' };
const InvoiceStatus = { ISSUED: 'ISSUED' };
const QuotationRequestStatus = { COMPARISON: 'COMPARISON' };
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
  const tables = [
    'Payment', 'PaymentRequest', 'VendorInvoice', 'GRN', 'POLineItem', 'PurchaseOrder',
    'Quotation', 'QuotationRequest', 'CustomerReceipt', 'CustomerInvoice', 'Document',
    'AuditLog', 'DailyStatus', 'Attendance', 'Task', 'WBSLineItem', 'WBSCategory',
    'ProjectAssignment', 'Project', 'Template', 'Vendor', 'User', 'Sector',
    'ApprovalThreshold', 'BankAccount',
  ];
  for (const t of tables) {
    try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}"`); } catch { /* */ }
  }
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');

  const hash = await bcrypt.hash('demo123', 10);

  const solar = await prisma.sector.create({ data: { name: 'Solar', active: true } });
  await prisma.sector.createMany({ data: [
    { name: 'Wind', active: false },
    { name: 'Land Promotion', active: false },
  ]});

  await prisma.approvalThreshold.createMany({ data: [
    { role: Role.PROJECT_HEAD, ceiling: BigInt(50000) },
    { role: Role.SECTOR_HEAD, ceiling: BigInt(500000) },
    { role: Role.CORPORATE_OFFICE, ceiling: BigInt(99999999999) },
    { role: Role.SUPER_ADMIN, ceiling: BigInt(99999999999) },
  ]});

  await prisma.bankAccount.create({ data: {
    bankName: 'HDFC Bank', accountNumber: '50200012345678', ifsc: 'HDFC0001234', isDefault: true,
  }});

  const limit10L = BigInt(1_000_000);
  const admin = await prisma.user.create({ data: { email: 'admin@vijayanth.in', password: hash, name: 'Arun', role: Role.SUPER_ADMIN, approvalLimit: limit10L } });
  const corporate = await prisma.user.create({ data: { email: 'corporate@vijayanth.in', password: hash, name: 'Seetharam', role: Role.CORPORATE_OFFICE, approvalLimit: limit10L } });
  const sectorHead = await prisma.user.create({ data: { email: 'solar.head@vijayanth.in', password: hash, name: 'Naveen Kumar', role: Role.SECTOR_HEAD, sectorId: solar.id, approvalLimit: limit10L } });
  const suresh = await prisma.user.create({ data: { email: 'suresh@vijayanth.in', password: hash, name: 'Suresh K.', role: Role.PROJECT_HEAD, approvalLimit: limit10L } });
  const kavi = await prisma.user.create({ data: { email: 'kavi@vijayanth.in', password: hash, name: 'Kavi S.', role: Role.PROJECT_HEAD, approvalLimit: limit10L } });

  const parent = await prisma.project.create({ data: {
    name: 'VCPPL Usilampatti 7 MW', code: 'VCPPL-USIL-7', client: 'VCPPL', sectorId: solar.id,
    capacityMw: 7, billable: 2700000000, status: ProjectStatus.IN_EXECUTION,
  }});

  const proj1mw = await prisma.project.create({ data: {
    name: 'Usilampatti 1 MW', code: 'VCPPL-USIL-1', client: 'VCPPL', sectorId: solar.id, parentId: parent.id,
    capacityMw: 1, billable: 600000000, netCost: 54178638, profit: 5821362, status: ProjectStatus.IN_EXECUTION,
  }});

  const proj4mw = await prisma.project.create({ data: {
    name: 'Usilampatti 4 MW', code: 'VCPPL-USIL-4', client: 'VCPPL', sectorId: solar.id, parentId: parent.id,
    capacityMw: 4, billable: 2100000000, netCost: 175202585, status: ProjectStatus.IN_EXECUTION,
  }});

  await prisma.projectAssignment.createMany({ data: [
    { userId: suresh.id, projectId: proj1mw.id },
    { userId: kavi.id, projectId: proj4mw.id },
  ]});

  await prisma.template.create({ data: {
    name: 'Solar EPC Standard Playbook', sectorId: solar.id,
    description: '60-step solar project execution template',
    tasksJson: JSON.stringify(['Land acquisition', 'Survey', 'CEIG clearance']),
  }});

  const wbsData: { cat: string; desc: string; est: number; paid: number; committed?: number }[] = [
    { cat: 'Land', desc: 'Land', est: 6040000, paid: 5020000 },
    { cat: '33KV Transmission Line', desc: '33KV Transmission', est: 1702230, paid: 1702230, committed: 1702230 },
    { cat: 'Substation Work', desc: 'Substation Work', est: 231770, paid: 231770, committed: 231770 },
    { cat: 'Yard & Civil', desc: 'Yard & Civil', est: 3000000, paid: 0 },
    { cat: 'Yard Products', desc: 'Yard Products (Transformer, HT Breaker, LT Panel, etc.)', est: 10304830, paid: 844000, committed: 844000 },
    { cat: 'Panel', desc: 'Panel — PV Module (Solex/Saatvik)', est: 18564000, paid: 1000000, committed: 1000000 },
    { cat: 'MMS & Module Erection', desc: 'MMS & Module Erection', est: 11838316, paid: 320000, committed: 320000 },
    { cat: 'Infrastructure', desc: 'Infrastructure (Street Light, CCTV, Fencing, etc.)', est: 1702500, paid: 0 },
    { cat: 'Liaisoning', desc: 'Liaisoning (CEIG, LTOA, P&C, NCES, etc.)', est: 4451022, paid: 3799522 },
    { cat: 'Others', desc: 'Others (Overheads, Freight, Miscellaneous)', est: 1150000, paid: 0 },
  ];

  const lineItemMap: Record<string, string> = {};
  for (let i = 0; i < wbsData.length; i++) {
    const w = wbsData[i];
    const cat = await prisma.wBSCategory.create({ data: { projectId: proj1mw.id, name: w.cat, sortOrder: i } });
    const li = await prisma.wBSLineItem.create({ data: {
      projectId: proj1mw.id, categoryId: cat.id, description: w.desc, estimated: w.est,
      paid: w.paid, committed: w.committed ?? 0, sortOrder: 0,
    }});
    lineItemMap[w.cat] = li.id;
  }

  const vendors = await Promise.all([
    prisma.vendor.create({ data: { name: 'Solex Energy Pvt Ltd', category: 'PV Module', gstin: '24AABCS1234F1Z5', pan: 'AABCS1234F', bankName: 'ICICI', accountNo: '1234567890', ifsc: 'ICIC0001234' } }),
    prisma.vendor.create({ data: { name: 'Saatvik Green Energy Pvt Ltd', category: 'PV Module', gstin: '06AABCS5678G1Z2', pan: 'AABCS5678G' } }),
    prisma.vendor.create({ data: { name: 'Sungrow India Pvt Ltd', category: 'Inverter' } }),
    prisma.vendor.create({ data: { name: 'Schneider Electric India', category: 'HT Breaker, LT Panel' } }),
    prisma.vendor.create({ data: { name: 'Voltamp Transformers Ltd', category: 'Transformer' } }),
    prisma.vendor.create({ data: { name: 'Polycab India Ltd', category: 'Cable (DC + AC)' } }),
    prisma.vendor.create({ data: { name: 'Karthikeyan MMS Works', category: 'MMS, Fasteners' } }),
    prisma.vendor.create({ data: { name: 'Senthil Civil Contractors', category: 'Civil, Labour Contractor' } }),
    prisma.vendor.create({ data: { name: 'Murugan Electrical Works', category: 'DC Labour, Erection' } }),
    prisma.vendor.create({ data: { name: 'Arunachalam Surveyors', category: 'Land Survey' } }),
  ]);
  const [solex, , sungrow, , voltamp] = vendors;

  const today = new Date('2026-05-16');
  const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };
  const daysAhead = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };

  const taskDefs: { title: string; dept: string; status: TaskStatus; start: number; end: number; delayed?: boolean }[] = [
    { title: 'Land registration & lease', dept: 'Land', status: TaskStatus.COMPLETED, start: 120, end: 90 },
    { title: 'Land survey & demarcation', dept: 'Land', status: TaskStatus.COMPLETED, start: 90, end: 75 },
    { title: 'CEIG application submission', dept: 'Liaisoning', status: TaskStatus.COMPLETED, start: 80, end: 60 },
    { title: 'LTOA application', dept: 'Liaisoning', status: TaskStatus.IN_PROGRESS, start: 50, end: 20, delayed: true },
    { title: 'NCES clearance follow-up', dept: 'Liaisoning', status: TaskStatus.IN_PROGRESS, start: 45, end: 15, delayed: true },
    { title: 'Site grading & levelling', dept: 'Civil', status: TaskStatus.IN_PROGRESS, start: 30, end: 5 },
    { title: 'Foundation & piling work', dept: 'Civil', status: TaskStatus.IN_PROGRESS, start: 25, end: 10, delayed: true },
    { title: 'HT yard civil works', dept: 'Civil', status: TaskStatus.NOT_STARTED, start: -5, end: 20 },
    { title: '33KV line erection', dept: 'Electrical', status: TaskStatus.COMPLETED, start: 70, end: 50 },
    { title: 'Substation equipment installation', dept: 'Electrical', status: TaskStatus.COMPLETED, start: 55, end: 40 },
    { title: 'DC cable laying', dept: 'Electrical', status: TaskStatus.IN_PROGRESS, start: 20, end: 7 },
    { title: 'AC cable laying', dept: 'Electrical', status: TaskStatus.NOT_STARTED, start: 5, end: 25 },
    { title: 'PV module procurement RFQ', dept: 'Procurement', status: TaskStatus.COMPLETED, start: 60, end: 45 },
    { title: 'Transformer procurement', dept: 'Procurement', status: TaskStatus.COMPLETED, start: 55, end: 42 },
    { title: 'Inverter procurement', dept: 'Procurement', status: TaskStatus.IN_PROGRESS, start: 35, end: 12 },
    { title: 'MMS structure erection', dept: 'Procurement', status: TaskStatus.NOT_STARTED, start: 10, end: 35 },
    { title: 'Module mounting', dept: 'Procurement', status: TaskStatus.NOT_STARTED, start: 25, end: 50 },
    { title: 'Inverter installation', dept: 'Electrical', status: TaskStatus.NOT_STARTED, start: 15, end: 40 },
    { title: 'SCADA integration', dept: 'Electrical', status: TaskStatus.NOT_STARTED, start: 30, end: 55 },
    { title: 'Pre-commissioning checks', dept: 'Charging & Commissioning', status: TaskStatus.NOT_STARTED, start: 50, end: 70 },
    { title: 'Grid synchronization test', dept: 'Charging & Commissioning', status: TaskStatus.NOT_STARTED, start: 60, end: 80 },
    { title: 'CEIG inspection scheduling', dept: 'Charging & Commissioning', status: TaskStatus.NOT_STARTED, start: 55, end: 75 },
    { title: 'Performance ratio test', dept: 'Charging & Commissioning', status: TaskStatus.IN_PROGRESS, start: 15, end: 3 },
    { title: 'O&M handover documentation', dept: 'O&M', status: TaskStatus.NOT_STARTED, start: 70, end: 90 },
    { title: 'Warranty registration', dept: 'O&M', status: TaskStatus.NOT_STARTED, start: 65, end: 85 },
    { title: 'Security arrangement setup', dept: 'Civil', status: TaskStatus.COMPLETED, start: 40, end: 28 },
    { title: 'Fencing installation', dept: 'Civil', status: TaskStatus.IN_PROGRESS, start: 18, end: 8 },
    { title: 'CCTV installation', dept: 'Civil', status: TaskStatus.NOT_STARTED, start: 8, end: 22 },
  ];

  for (const t of taskDefs) {
    await prisma.task.create({ data: {
      projectId: proj1mw.id, title: t.title, department: t.dept, status: t.status,
      plannedStart: daysAgo(t.start), plannedEnd: daysAgo(t.end),
      isDelayed: t.delayed ?? false,
      actualStart: t.status !== TaskStatus.NOT_STARTED ? daysAgo(t.start - 2) : null,
      actualEnd: t.status === TaskStatus.COMPLETED ? daysAgo(t.end) : null,
    }});
  }

  const panelLineId = lineItemMap['Panel'];
  const yardLineId = lineItemMap['Yard Products'];
  const mmsLineId = lineItemMap['MMS & Module Erection'];

  const po1 = await prisma.purchaseOrder.create({ data: {
    poNumber: 'PO-2025-001', projectId: proj1mw.id, vendorId: solex.id, title: 'PV Module advance',
    totalAmount: 1000000, status: POStatus.APPROVED, requesterId: suresh.id, approverId: sectorHead.id, approvedAt: daysAgo(60),
  }});
  await prisma.pOLineItem.create({ data: { poId: po1.id, lineItemId: panelLineId, description: 'PV Module advance', amount: 1000000 } });

  const po2 = await prisma.purchaseOrder.create({ data: {
    poNumber: 'PO-2025-002', projectId: proj1mw.id, vendorId: voltamp.id, title: 'Transformer advance',
    totalAmount: 724000, status: POStatus.APPROVED, requesterId: suresh.id, approverId: sectorHead.id, approvedAt: daysAgo(55),
  }});
  await prisma.pOLineItem.create({ data: { poId: po2.id, lineItemId: yardLineId, description: 'Transformer advance', amount: 724000 } });

  const po3 = await prisma.purchaseOrder.create({ data: {
    poNumber: 'PO-2025-003', projectId: proj1mw.id, vendorId: sungrow.id, title: 'Inverter advance',
    totalAmount: 200000, status: POStatus.APPROVED, requesterId: suresh.id, approverId: sectorHead.id, approvedAt: daysAgo(50),
  }});
  await prisma.pOLineItem.create({ data: { poId: po3.id, lineItemId: mmsLineId, description: 'Inverter advance', amount: 200000 } });

  for (const [po, amt, utr, lineId] of [
    [po1, 1000000, 'UTR202509290001', panelLineId],
    [po2, 724000, 'UTR202510050002', yardLineId],
    [po3, 200000, 'UTR202510120003', mmsLineId],
  ] as const) {
    const pr = await prisma.paymentRequest.create({ data: {
      projectId: proj1mw.id, poId: po.id, amount: amt, purpose: 'Advance payment',
      status: PaymentRequestStatus.PAID, requesterId: suresh.id, approverId: sectorHead.id,
      approvedAt: daysAgo(45), lineItemId: lineId,
    }});
    await prisma.payment.create({ data: { paymentRequestId: pr.id, utr, paidAt: daysAgo(44), amount: amt } });
  }

  await prisma.customerReceipt.createMany({ data: [
    { projectId: proj1mw.id, amount: 100000000, receivedAt: new Date('2025-09-29') },
    { projectId: proj1mw.id, amount: 1904650, receivedAt: new Date('2025-10-24') },
    { projectId: proj1mw.id, amount: 50000000, receivedAt: new Date('2025-11-19') },
  ]});

  await prisma.customerInvoice.create({ data: {
    projectId: proj1mw.id, invoiceNumber: 'INV-PF-2025-001', type: InvoiceType.PROFORMA,
    status: InvoiceStatus.ISSUED, amount: 50000000, milestone: 'Advance', issuedAt: new Date('2025-11-01'),
  }});

  await prisma.auditLog.createMany({ data: [
    { userId: suresh.id, action: 'PO_APPROVED', entityType: 'PurchaseOrder', entityId: po1.id, metadata: JSON.stringify({ poNumber: 'PO-2025-001' }), createdAt: daysAgo(60) },
    { userId: sectorHead.id, action: 'PAYMENT_EXECUTED', entityType: 'Payment', metadata: JSON.stringify({ utr: 'UTR202509290001' }), createdAt: daysAgo(44) },
  ]});

  console.log('Seed complete:', { admin: admin.email, projects: [parent.name, proj1mw.name, proj4mw.name] });
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
