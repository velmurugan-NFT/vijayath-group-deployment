/*
  Warnings:

  - You are about to alter the column `ceiling` on the `ApprovalThreshold` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `amount` on the `CustomerInvoice` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `taxAmount` on the `CustomerInvoice` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `amount` on the `CustomerReceipt` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `amount` on the `POLineItem` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `amount` on the `Payment` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `amount` on the `PaymentRequest` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `billable` on the `Project` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `netCost` on the `Project` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `profit` on the `Project` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `totalAmount` on the `PurchaseOrder` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `amount` on the `Quotation` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `amount` on the `VendorInvoice` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `committed` on the `WBSLineItem` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `estimated` on the `WBSLineItem` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `paid` on the `WBSLineItem` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApprovalThreshold" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "ceiling" BIGINT NOT NULL
);
INSERT INTO "new_ApprovalThreshold" ("ceiling", "id", "role") SELECT "ceiling", "id", "role" FROM "ApprovalThreshold";
DROP TABLE "ApprovalThreshold";
ALTER TABLE "new_ApprovalThreshold" RENAME TO "ApprovalThreshold";
CREATE UNIQUE INDEX "ApprovalThreshold_role_key" ON "ApprovalThreshold"("role");
CREATE TABLE "new_CustomerInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "amount" BIGINT NOT NULL,
    "taxAmount" BIGINT NOT NULL DEFAULT 0,
    "milestone" TEXT,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CustomerInvoice" ("amount", "createdAt", "id", "invoiceNumber", "issuedAt", "milestone", "projectId", "status", "taxAmount", "type") SELECT "amount", "createdAt", "id", "invoiceNumber", "issuedAt", "milestone", "projectId", "status", "taxAmount", "type" FROM "CustomerInvoice";
DROP TABLE "CustomerInvoice";
ALTER TABLE "new_CustomerInvoice" RENAME TO "CustomerInvoice";
CREATE UNIQUE INDEX "CustomerInvoice_invoiceNumber_key" ON "CustomerInvoice"("invoiceNumber");
CREATE TABLE "new_CustomerReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "reference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerReceipt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CustomerReceipt" ("amount", "createdAt", "id", "projectId", "receivedAt", "reference") SELECT "amount", "createdAt", "id", "projectId", "receivedAt", "reference" FROM "CustomerReceipt";
DROP TABLE "CustomerReceipt";
ALTER TABLE "new_CustomerReceipt" RENAME TO "CustomerReceipt";
CREATE TABLE "new_POLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    CONSTRAINT "POLineItem_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "POLineItem_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "WBSLineItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_POLineItem" ("amount", "description", "id", "lineItemId", "poId") SELECT "amount", "description", "id", "lineItemId", "poId" FROM "POLineItem";
DROP TABLE "POLineItem";
ALTER TABLE "new_POLineItem" RENAME TO "POLineItem";
CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentRequestId" TEXT NOT NULL,
    "utr" TEXT NOT NULL,
    "paidAt" DATETIME NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("amount", "createdAt", "id", "paidAt", "paymentRequestId", "utr") SELECT "amount", "createdAt", "id", "paidAt", "paymentRequestId", "utr" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE UNIQUE INDEX "Payment_paymentRequestId_key" ON "Payment"("paymentRequestId");
CREATE TABLE "new_PaymentRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "purpose" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "requesterId" TEXT NOT NULL,
    "approverId" TEXT,
    "approvedAt" DATETIME,
    "lineItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentRequest_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PaymentRequest" ("amount", "approvedAt", "approverId", "createdAt", "id", "lineItemId", "poId", "projectId", "purpose", "requesterId", "status", "updatedAt") SELECT "amount", "approvedAt", "approverId", "createdAt", "id", "lineItemId", "poId", "projectId", "purpose", "requesterId", "status", "updatedAt" FROM "PaymentRequest";
DROP TABLE "PaymentRequest";
ALTER TABLE "new_PaymentRequest" RENAME TO "PaymentRequest";
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "client" TEXT,
    "sectorId" TEXT NOT NULL,
    "parentId" TEXT,
    "capacityMw" REAL,
    "billable" BIGINT NOT NULL DEFAULT 0,
    "netCost" BIGINT NOT NULL DEFAULT 0,
    "profit" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'IN_EXECUTION',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("billable", "capacityMw", "client", "code", "createdAt", "id", "name", "netCost", "parentId", "profit", "sectorId", "status", "updatedAt") SELECT "billable", "capacityMw", "client", "code", "createdAt", "id", "name", "netCost", "parentId", "profit", "sectorId", "status", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE TABLE "new_PurchaseOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poNumber" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "totalAmount" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "requesterId" TEXT NOT NULL,
    "approverId" TEXT,
    "approvedAt" DATETIME,
    "rejectReason" TEXT,
    "quotationRequestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrder_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrder_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseOrder" ("approvedAt", "approverId", "createdAt", "id", "poNumber", "projectId", "quotationRequestId", "rejectReason", "requesterId", "status", "title", "totalAmount", "updatedAt", "vendorId") SELECT "approvedAt", "approverId", "createdAt", "id", "poNumber", "projectId", "quotationRequestId", "rejectReason", "requesterId", "status", "title", "totalAmount", "updatedAt", "vendorId" FROM "PurchaseOrder";
DROP TABLE "PurchaseOrder";
ALTER TABLE "new_PurchaseOrder" RENAME TO "PurchaseOrder";
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");
CREATE TABLE "new_Quotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "deliveryDays" INTEGER,
    "notes" TEXT,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Quotation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "QuotationRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Quotation_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Quotation" ("amount", "createdAt", "deliveryDays", "id", "isWinner", "notes", "requestId", "vendorId") SELECT "amount", "createdAt", "deliveryDays", "id", "isWinner", "notes", "requestId", "vendorId" FROM "Quotation";
DROP TABLE "Quotation";
ALTER TABLE "new_Quotation" RENAME TO "Quotation";
CREATE TABLE "new_VendorInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "invoiceDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorInvoice_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_VendorInvoice" ("amount", "createdAt", "id", "invoiceDate", "invoiceNumber", "poId") SELECT "amount", "createdAt", "id", "invoiceDate", "invoiceNumber", "poId" FROM "VendorInvoice";
DROP TABLE "VendorInvoice";
ALTER TABLE "new_VendorInvoice" RENAME TO "VendorInvoice";
CREATE TABLE "new_WBSLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "estimated" BIGINT NOT NULL DEFAULT 0,
    "committed" BIGINT NOT NULL DEFAULT 0,
    "paid" BIGINT NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WBSLineItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WBSLineItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WBSCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WBSLineItem" ("categoryId", "committed", "description", "estimated", "id", "paid", "projectId", "sortOrder") SELECT "categoryId", "committed", "description", "estimated", "id", "paid", "projectId", "sortOrder" FROM "WBSLineItem";
DROP TABLE "WBSLineItem";
ALTER TABLE "new_WBSLineItem" RENAME TO "WBSLineItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
