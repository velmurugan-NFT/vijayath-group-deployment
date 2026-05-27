import express from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadUser } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import vendorRoutes from './routes/vendors.js';
import quotationRoutes from './routes/quotations.js';
import poRoutes from './routes/pos.js';
import paymentRoutes from './routes/payments.js';
import invoiceRoutes from './routes/invoices.js';
import receiptRoutes from './routes/receipts.js';
import documentRoutes from './routes/documents.js';
import grnRoutes from './routes/grn.js';
import vendorInvoiceRoutes from './routes/vendor-invoices.js';
import reportRoutes from './routes/reports.js';
import auditRoutes from './routes/audit.js';
import settingsRoutes from './routes/settings.js';
import dailyStatusRoutes from './routes/daily-status.js';
import approvalRoutes from './routes/approvals.js';
import navRoutes from './routes/nav.js';
// import connectSqlite3 from 'connect-sqlite3';
// const SQLiteStore = connectSqlite3(session);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Serialize BigInt in JSON responses
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use('/uploads', express.static(uploadDir));
app.use(session({
  secret: process.env.SESSION_SECRET || 'demo-secret',
  resave: false,
  saveUninitialized: false,

  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: 'none',
    maxAge: 24 * 60 * 60 * 1000
  }
}));
// Debug middleware
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.path} | sessionId: ${req.sessionID} | userId: ${(req.session as any).userId}`);
  next();
});
app.use(loadUser);

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/pos', poRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/grn', grnRoutes);
app.use('/api/vendor-invoices', vendorInvoiceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/daily-status', dailyStatusRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/nav', navRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const status = (err as { status?: number }).status ?? 500;
  const message = err instanceof Error ? err.message : 'Internal server error';
  if (!res.headersSent) res.status(status).json({ error: message });
});

const server = app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other process or run: lsof -ti:${PORT} | xargs kill -9`);
    process.exit(1);
  }
  throw err;
});