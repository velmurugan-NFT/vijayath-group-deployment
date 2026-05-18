import { prisma } from './prisma.js';
import { POStatus, PaymentRequestStatus } from './constants.js';

export async function recalcLineItem(lineItemId: string): Promise<void> {
  const approvedPOs = await prisma.pOLineItem.findMany({
    where: { lineItemId, po: { status: POStatus.APPROVED } },
    include: { po: true },
  });
  const committed = approvedPOs.reduce((s, l) => s + l.amount, 0n);

  const payments = await prisma.paymentRequest.findMany({
    where: { lineItemId, status: PaymentRequestStatus.PAID },
    include: { payment: true },
  });
  const paid = payments.reduce((s, p) => s + (p.payment?.amount ?? p.amount), 0n);

  await prisma.wBSLineItem.update({
    where: { id: lineItemId },
    data: { committed, paid },
  });
}

export async function recalcProjectLineItems(projectId: string): Promise<void> {
  const items = await prisma.wBSLineItem.findMany({ where: { projectId } });
  for (const item of items) await recalcLineItem(item.id);
}
