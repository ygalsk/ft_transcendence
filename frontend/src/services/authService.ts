import { apiClient, setAuthToken } from './apiClient';

export type LoginResponse = {
  token?: string;
  error?: string;
  [key: string]: unknown;
};

export type RegisterResponse = {
  error?: string;
  [key: string]: unknown;
};

export const authService = {
  async login(email: string, password: string, twofa?: string): Promise<LoginResponse> {
    const payload: Record<string, string> = { email, password };
    if (twofa) payload.twofa = twofa;

    const data = await apiClient.post<LoginResponse>('/api/auth/login', payload, {
      skipAuth: true,
    });

    if (data.token) {
      setAuthToken(data.token);
    }

    return data;
  },

  async me<T extends Record<string, unknown>>() {
    return apiClient.get<T>('/api/auth/me');
  },

  logout() {
    setAuthToken(null);
  },

  // Use display_name as required by the backend
  async register(input: { email: string; display_name: string; password: string; twofa?: string }): Promise<RegisterResponse> {
    const payload: Record<string, unknown> = {
      email: input.email,
      display_name: input.display_name,
      password: input.password,
    };
    if (input.twofa) payload.twofa = input.twofa;

    const data = await apiClient.post<RegisterResponse>('/api/auth/register', payload, { skipAuth: true });
    return data;
  },
};