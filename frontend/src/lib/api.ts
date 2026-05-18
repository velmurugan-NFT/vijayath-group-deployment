const BASE = import.meta.env.VITE_API_BASE ?? '/api';

async function parseError(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) return res.statusText || 'Request failed';
  try {
    const body = JSON.parse(text) as { error?: string };
    return body.error || text;
  } catch {
    return text;
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const hasBody = options?.body != null;
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const message = await parseError(res);
    throw new Error(message);
  }
  if (res.headers.get('content-type')?.includes('application/json')) return res.json();
  return res as unknown as T;
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function apiUpload(path: string, formData: FormData): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', credentials: 'include', body: formData });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
