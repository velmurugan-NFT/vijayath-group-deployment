/*
  Warnings:

  - You are about to alter the column `amount` on the `VendorInvoice` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Float`.
  - Added the required column `updatedAt` to the `VendorInvoice` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "VendorInvoicePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "VendorInvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "VendorInvoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "approvalLimit" BIGINT NOT NULL DEFAULT 0,
    "sectorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "password", "role", "sectorId", "updatedAt") SELECT "createdAt", "email", "id", "name", "password", "role", "sectorId", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "new_VendorInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "invoiceDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VendorInvoice_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_VendorInvoice" ("amount", "createdAt", "id", "invoiceDate", "invoiceNumber", "poId") SELECT "amount", "createdAt", "id", "invoiceDate", "invoiceNumber", "poId" FROM "VendorInvoice";
DROP TABLE "VendorInvoice";
ALTER TABLE "new_VendorInvoice" RENAME TO "VendorInvoice";
CREATE UNIQUE INDEX "VendorInvoice_invoiceNumber_key" ON "VendorInvoice"("invoiceNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
