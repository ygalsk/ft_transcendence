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

  // ✅ FIX: Don't set Content-Type for FormData (browser sets it with boundary)
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
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
  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: 'GET' });
  },

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    });
  },

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    });
  },

  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    });
  },

  async delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: 'DELETE' });
  },
};

