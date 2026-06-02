export type DocumentRow = {
  id: string;
  filename: string;
  category: string | null;
  documentDate: string | null;
  notes: string | null;
  uploadBatchId: string | null;
  createdAt: string;
  project: { id: string; name: string };
  wbsLineItem?: {
    id: string;
    description: string;
    category?: { name: string };
  } | null;
};

export type DocGroup = {
  key: string;
  batchId: string | null;
  docs: DocumentRow[];
};

export function wbsLabel(item: DocumentRow['wbsLineItem']): string {
  if (!item) return '—';
  const cat = item.category?.name;
  return cat ? `${cat} — ${item.description}` : item.description;
}

export function groupDocuments(docs: DocumentRow[]): DocGroup[] {
  const map = new Map<string, DocumentRow[]>();
  for (const d of docs) {
    const key = d.uploadBatchId ?? d.id;
    const list = map.get(key) ?? [];
    list.push(d);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .map(([key, groupDocs]) => ({
      key,
      batchId: groupDocs[0]?.uploadBatchId ?? null,
      docs: [...groupDocs].sort((a, b) => a.filename.localeCompare(b.filename)),
    }))
    .sort((a, b) => new Date(b.docs[0].createdAt).getTime() - new Date(a.docs[0].createdAt).getTime());
}
