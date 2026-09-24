import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { getProjectContext, projectFilter } from '../lib/scope.js';
const uploadDir = process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

const router = Router();

const docInclude = {
  project: true,
  uploadedBy: true,
  wbsLineItem: { include: { category: true } },
};

function parseDocumentDate(raw: unknown): Date | null {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function metadataFromBody(body: Record<string, unknown>) {
  const { projectId, wbsLineItemId, category, documentDate, notes } = body;
  const wbsId = typeof wbsLineItemId === 'string' && wbsLineItemId.trim() ? wbsLineItemId.trim() : null;
  const cat = typeof category === 'string' && category.trim() ? category.trim() : null;
  const date = parseDocumentDate(documentDate);
  const noteText = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
  return { projectId, wbsLineItemId: wbsId, category: cat, documentDate: date, notes: noteText };
}

async function validateWbsForProject(projectId: string, wbsLineItemId: string | null) {
  if (!wbsLineItemId) return null;
  const lineItem = await prisma.wBSLineItem.findFirst({
    where: { id: wbsLineItemId, projectId },
  });
  return lineItem ? null : 'WBS item not found for this project';
}

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const pf = await projectFilter(req.user!);
    const { projectId } = req.query;
    const docs = await prisma.document.findMany({
      where: { project: pf, ...(projectId ? { projectId: String(projectId) } : {}) },
      include: docInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json(docs);
  } catch (err) { next(err); }
});

router.post('/', requireAuth, upload.array('files', 50), async (req: AuthRequest, res, next) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files?.length) { res.status(400).json({ error: 'At least one file is required' }); return; }

    const meta = metadataFromBody(req.body);
    if (!meta.projectId || typeof meta.projectId !== 'string') {
      res.status(400).json({ error: 'Project is required' }); return;
    }

    const wbsErr = await validateWbsForProject(meta.projectId, meta.wbsLineItemId);
    if (wbsErr) { res.status(400).json({ error: wbsErr }); return; }

    const ctx = await getProjectContext(meta.projectId);
    assertCan(req.user!, 'create', ctx ?? undefined);

    const batchId = files.length > 1 ? crypto.randomUUID() : null;

    const docs = await Promise.all(files.map((file) =>
      prisma.document.create({
        data: {
          projectId: meta.projectId as string,
          wbsLineItemId: meta.wbsLineItemId,
          filename: file.originalname,
          filepath: file.filename,
          category: meta.category,
          documentDate: meta.documentDate,
          notes: meta.notes,
          uploadBatchId: batchId,
          uploadedById: req.user!.id,
        },
        include: docInclude,
      }),
    ));

    res.status(201).json(docs);
  } catch (err) { next(err); }
});

router.patch('/batches/:batchId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const batchDocs = await prisma.document.findMany({ where: { uploadBatchId: req.params.batchId } });
    if (!batchDocs.length) { res.status(404).json({ error: 'Not found' }); return; }

    const meta = metadataFromBody(req.body);
    if (!meta.projectId || typeof meta.projectId !== 'string') {
      res.status(400).json({ error: 'Project is required' }); return;
    }

    const wbsErr = await validateWbsForProject(meta.projectId, meta.wbsLineItemId);
    if (wbsErr) { res.status(400).json({ error: wbsErr }); return; }

    const ctx = await getProjectContext(batchDocs[0].projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);

    if (meta.projectId !== batchDocs[0].projectId) {
      const newCtx = await getProjectContext(meta.projectId);
      assertCan(req.user!, 'update', newCtx ?? undefined);
    }

    await prisma.document.updateMany({
      where: { uploadBatchId: req.params.batchId },
      data: {
        projectId: meta.projectId,
        wbsLineItemId: meta.wbsLineItemId,
        category: meta.category,
        documentDate: meta.documentDate,
        notes: meta.notes,
      },
    });

    const docs = await prisma.document.findMany({
      where: { uploadBatchId: req.params.batchId },
      include: docInclude,
      orderBy: { filename: 'asc' },
    });
    res.json(docs);
  } catch (err) { next(err); }
});

router.delete('/batches/:batchId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const batchDocs = await prisma.document.findMany({ where: { uploadBatchId: req.params.batchId } });
    if (!batchDocs.length) { res.status(404).json({ error: 'Not found' }); return; }

    const ctx = await getProjectContext(batchDocs[0].projectId);
    assertCan(req.user!, 'delete', ctx ?? undefined);

    for (const doc of batchDocs) {
      const fp = path.join(uploadDir, doc.filepath);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }

    await prisma.document.deleteMany({ where: { uploadBatchId: req.params.batchId } });
    res.json({ ok: true, deleted: batchDocs.length });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAuth, upload.single('file'), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }

    const ctx = await getProjectContext(existing.projectId);
    assertCan(req.user!, 'update', ctx ?? undefined);

    const meta = metadataFromBody(req.body);
    if (!meta.projectId || typeof meta.projectId !== 'string') {
      res.status(400).json({ error: 'Project is required' }); return;
    }

    const wbsErr = await validateWbsForProject(meta.projectId, meta.wbsLineItemId);
    if (wbsErr) { res.status(400).json({ error: wbsErr }); return; }

    if (meta.projectId !== existing.projectId) {
      const newCtx = await getProjectContext(meta.projectId);
      assertCan(req.user!, 'update', newCtx ?? undefined);
    }

    const updateData: {
      projectId: string;
      wbsLineItemId: string | null;
      category: string | null;
      documentDate: Date | null;
      notes: string | null;
      filename?: string;
      filepath?: string;
      version?: { increment: number };
    } = {
      projectId: meta.projectId,
      wbsLineItemId: meta.wbsLineItemId,
      category: meta.category,
      documentDate: meta.documentDate,
      notes: meta.notes,
    };

    if (req.file) {
      const oldPath = path.join(uploadDir, existing.filepath);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      updateData.filename = req.file.originalname;
      updateData.filepath = req.file.filename;
      updateData.version = { increment: 1 };
    }

    const doc = await prisma.document.update({
      where: { id: req.params.id },
      data: updateData,
      include: docInclude,
    });
    res.json(doc);
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }

    const ctx = await getProjectContext(existing.projectId);
    assertCan(req.user!, 'delete', ctx ?? undefined);

    const fp = path.join(uploadDir, existing.filepath);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);

    await prisma.document.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/:id/download', requireAuth, async (req, res, next) => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }
    const fp = path.join(uploadDir, doc.filepath);
    if (!fs.existsSync(fp)) { res.status(404).json({ error: 'File missing' }); return; }
    res.download(fp, doc.filename);
  } catch (err) { next(err); }
});

export default router;
