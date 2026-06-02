-- AlterTable
ALTER TABLE "CustomerReceipt" ADD COLUMN "mode" TEXT;

-- CreateTable
CREATE TABLE "CustomerReceiptInvoice" (
    "receiptId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,

    CONSTRAINT "CustomerReceiptInvoice_pkey" PRIMARY KEY ("receiptId","invoiceId"),
    CONSTRAINT "CustomerReceiptInvoice_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "CustomerReceipt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerReceiptInvoice_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "CustomerInvoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
