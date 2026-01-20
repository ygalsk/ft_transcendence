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
    return apiClient.get<T>('/api/user/me');
  },

  logout() {
    // Call backend logout endpoint to set offline status
    apiClient.post('/api/user/logout', {}).catch(() => {
      // Ignore errors, still clear token locally
    });
    setAuthToken(null);
  },

  // Update profile - Backend uses PUT /api/user/me
  async updateProfile(payload: { display_name?: string; email?: string; bio?: string }) {
    return apiClient.put('/api/user/me', payload);
  },

  // Upload avatar - Try with userId in path if backend requires it
async uploadAvatar(file: File) {
  const form = new FormData();
  form.append('file', file);
  
  console.log('Uploading avatar:', {
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
  });
  
  // Backend extracts userId from JWT token, no need to include in URL
  const response = await apiClient.post<{ avatar_url: string; message: string }>(
    '/api/user/avatar',
    form
  );
  return response;
},

  // Delete avatar - Backend uses DELETE /api/user/avatar
  async deleteAvatar() {
    return apiClient.delete('/api/user/avatar');
  },

  // Delete account - Backend uses DELETE /api/user/me
  async deleteAccount() {
    const response = await apiClient.delete('/api/user/me');
    setAuthToken(null);
    return response;
  },

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