import { loadingStore } from '@/context/LoadingContext';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

async function parseError(res: Response): Promise<string> {
  const text = await res.text();

  if (!text) {
    return res.statusText || 'Request failed';
  }

  try {
    const body = JSON.parse(text) as {
      error?: string;
    };

    return body.error || text;
  } catch {
    return text;
  }
}

export async function api<T>(
  path: string,
  options?: RequestInit
): Promise<T> {

  loadingStore.setLoading(true);

  try {

    const hasBody =
      options?.body != null;

    const res = await fetch(
      `${BASE}${path}`,
      {
        ...options,

        credentials: 'include',

        headers: {
          ...(hasBody
            ? {
                'Content-Type':
                  'application/json',
              }
            : {}),

          ...options?.headers,
        },
      }
    );

    if (!res.ok) {

      const message =
        await parseError(res);

      throw new Error(message);

    }

    if (
      res.headers
        .get('content-type')
        ?.includes(
          'application/json'
        )
    ) {

      return res.json();

    }

    return res as unknown as T;

  } finally {

    loadingStore.setLoading(false);

  }

}

export async function apiDownload(
  path: string,
  filename: string
): Promise<void> {

  loadingStore.setLoading(true);

  try {

    const res =
      await fetch(
        `${BASE}${path}`,
        {
          credentials:
            'include',
        }
      );

    if (!res.ok) {

      throw new Error(
        await parseError(res)
      );

    }

    const blob =
      await res.blob();

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement('a');

    a.href = url;

    a.download =
      filename;

    a.click();

    URL.revokeObjectURL(url);

  } finally {

    loadingStore.setLoading(false);

  }

}

export async function apiUpload(
  path: string,
  formData: FormData,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<unknown> {

  loadingStore.setLoading(true);

  try {

    const res =
      await fetch(
        `${BASE}${path}`,
        {
          method,

          credentials:
            'include',

          body:
            formData,
        }
      );

    if (!res.ok) {

      throw new Error(
        await parseError(res)
      );

    }

    return res.json();

  } finally {

    loadingStore.setLoading(false);

  }

}