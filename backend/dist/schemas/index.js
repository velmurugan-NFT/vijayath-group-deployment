import { z } from 'zod';
export const vendorSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    category: z.string().min(1, 'Category is required'),
    gstin: z.string().optional(),
    pan: z.string().optional(),
    bankName: z.string().optional(), // ← was "bankAccount" before — now matches Prisma
    accountNo: z.string().optional(), // ← new field matching Prisma
    ifsc: z.string().optional(), // ← new field matching Prisma
    contact: z.string().optional(),
});
export const taskCreateSchema = z.object({
    projectId: z.string(),
    title: z.string().min(1),
    department: z.string().min(1),
    status: z.string().optional(),
    plannedStart: z.string().optional(),
    plannedEnd: z.string().optional(),
    remarks: z.string().optional(),
});
export const projectCreateSchema = z.object({
    name: z.string().min(1),
    templateId: z.string().optional(),
    parentId: z.string().optional(),
    sectorId: z.string(),
    client: z.string().optional(),
    capacityMw: z.number().optional(),
    billable: z.number().optional(),
    projectHeadId: z.string().optional(),
});
export const userCreateSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    role: z.enum(['SUPER_ADMIN', 'CORPORATE_OFFICE', 'SECTOR_HEAD', 'PROJECT_HEAD']),
    password: z.string().min(6).optional(),
    sectorId: z.string().optional().nullable(),
    projectIds: z.array(z.string()).optional(),
});
export const userUpdateSchema = userCreateSchema.partial().extend({
    active: z.boolean().optional(),
});
