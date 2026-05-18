import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { assertCan } from '../lib/rbac.js';
import { getProjectContext, projectFilter } from '../lib/scope.js';

const uploadDir = path.resolve(process.cwd(), '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const pf = await projectFilter(req.user!);
  const { projectId } = req.query;
  const docs = await prisma.document.findMany({
    where: { project: pf, ...(projectId ? { projectId: String(projectId) } : {}) },
    include: { project: true, uploadedBy: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(docs);
});

router.post('/', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
  const { projectId, category } = req.body;
  if (!req.file) { res.status(400).json({ error: 'No file' }); return; }
  const ctx = await getProjectContext(projectId);
  assertCan(req.user!, 'create', ctx ?? undefined);
  const doc = await prisma.document.create({
    data: {
      projectId, filename: req.file.originalname, filepath: req.file.filename,
      category, uploadedById: req.user!.id,
    },
    include: { uploadedBy: true },
  });
  res.status(201).json(doc);
});

router.get('/:id/download', requireAuth, async (req, res) => {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) { res.status(404).json({ error: 'Not found' }); return; }
  const fp = path.join(uploadDir, doc.filepath);
  if (!fs.existsSync(fp)) { res.status(404).json({ error: 'File missing' }); return; }
  res.download(fp, doc.filename);
});

export default router;
