-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "sectorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sector" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProjectAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    CONSTRAINT "ProjectAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "client" TEXT,
    "sectorId" TEXT NOT NULL,
    "parentId" TEXT,
    "capacityMw" REAL,
    "billable" INTEGER NOT NULL DEFAULT 0,
    "netCost" INTEGER NOT NULL DEFAULT 0,
    "profit" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'IN_EXECUTION',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sectorId" TEXT NOT NULL,
    "description" TEXT,
    "tasksJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Template_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WBSCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WBSCategory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WBSLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "estimated" INTEGER NOT NULL DEFAULT 0,
    "committed" INTEGER NOT NULL DEFAULT 0,
    "paid" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WBSLineItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WBSLineItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WBSCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "plannedStart" DATETIME,
    "plannedEnd" DATETIME,
    "actualStart" DATETIME,
    "actualEnd" DATETIME,
    "isDelayed" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "bankName" TEXT,
    "accountNo" TEXT,
    "ifsc" TEXT,
    "contact" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "QuotationRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "lineItemId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "requesterId" TEXT NOT NULL,
    "winnerId" TEXT,
    "winnerReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuotationRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QuotationRequest_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "WBSLineItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "deliveryDays" INTEGER,
    "notes" TEXT,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Quotation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "QuotationRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Quotation_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poNumber" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "totalAmount" INTEGER NOT NULL,
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

-- CreateTable
CREATE TABLE "POLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    CONSTRAINT "POLineItem_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "POLineItem_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "WBSLineItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GRN" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poId" TEXT NOT NULL,
    "grnNumber" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GRN_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VendorInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "invoiceDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorInvoice_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
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

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentRequestId" TEXT NOT NULL,
    "utr" TEXT NOT NULL,
    "paidAt" DATETIME NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "amount" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "milestone" TEXT,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "reference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerReceipt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "filepath" TEXT NOT NULL,
    "category" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyStatus_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DailyStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "headcount" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attendance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApprovalThreshold" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "ceiling" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Sector_name_key" ON "Sector"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAssignment_userId_projectId_key" ON "ProjectAssignment"("userId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentRequestId_key" ON "Payment"("paymentRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerInvoice_invoiceNumber_key" ON "CustomerInvoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalThreshold_role_key" ON "ApprovalThreshold"("role");
