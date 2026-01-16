const resolveBaseUrl = () => {
  const envBase =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
      ? import.meta.env.VITE_API_BASE_URL
      : undefined;

  if (envBase) return envBase;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:8080';
};

let authToken: string | null =
  typeof window !== 'undefined' ? localStorage.getItem('jwt') : null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem('jwt', token);
    else localStorage.removeItem('jwt');
  }
};

type RequestOptions = RequestInit & { skipAuth?: boolean };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const baseUrl = resolveBaseUrl();
  const headers = new Headers(options.headers);

  if (!options.skipAuth && authToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  if (!headers.has('Content-Type') && options.body instanceof Blob === false) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    credentials: options.credentials ?? 'include',
  });

  const data = (await response.json()) as T;
  if (!response.ok) {
    throw new Error((data as any)?.error ?? 'API request failed');
  }
  return data;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
};