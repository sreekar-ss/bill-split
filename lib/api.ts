// API helper functions for authenticated requests

const API_BASE = '';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// Groups API
export const groupsApi = {
  getAll: () => apiRequest('/api/groups'),
  getById: (id: string) => apiRequest(`/api/groups/${id}`),
  create: (data: { name: string; description?: string; category?: string }) =>
    apiRequest('/api/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  addMember: (groupId: string, email: string) =>
    apiRequest(`/api/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
};

// Expenses API
export const expensesApi = {
  create: (data: any) =>
    apiRequest('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    apiRequest(`/api/expenses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiRequest(`/api/expenses/${id}`, {
      method: 'DELETE',
    }),
};

