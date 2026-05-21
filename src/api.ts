// API base: in dev, Vite proxy forwards /api to Express.
// In production (Electron), files are loaded via file:// protocol, so we must target the local port 3001 directly.
const API_BASE = typeof window !== 'undefined' && window.location.protocol === 'file:'
  ? 'http://localhost:3001/api'
  : '/api';

async function request(url: string, options?: RequestInit) {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = { 
    'Content-Type': 'application/json', 
    'Accept': 'application/json' 
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${url}`, {
    headers,
    ...options,
  });
  
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Request failed (${res.status})`);
  }
  
  if (res.status === 204) return null;
  return res.json();
}

// Auth
export const login = (email: string, password: string) => 
  request('/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const logout = () => request('/logout', { method: 'POST' });

// Dashboard
export const fetchDashboard = () => request('/dashboard');

// Members
export const fetchMembers = (search = '', status = '') =>
  request(`/members?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`);

export const createMember = (data: {
  name: string; contact: string; plan: string; joined_date: string; expiry_date: string; address?: string;
}) => request('/members', { method: 'POST', body: JSON.stringify(data) });

export const updateMember = (id: number, data: Record<string, string>) =>
  request(`/members/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteMember = (id: number) =>
  request(`/members/${id}`, { method: 'DELETE' });

export const fetchMemberCheckIns = (memberId: string) =>
  request(`/members/${memberId}/checkins`);

// Check-ins
export const fetchCheckIns = (date?: string) => 
  request(`/checkins${date ? `?date=${encodeURIComponent(date)}` : ''}`);

export const createCheckIn = (memberId: string) =>
  request('/checkins', { method: 'POST', body: JSON.stringify({ member_id: memberId }) });

// Settings
export const fetchSettings = () => request('/settings');

export const saveSettings = (data: {
  gymName: string; contact: string; address: string; announcement: string;
}) => request('/settings', { method: 'PUT', body: JSON.stringify(data) });
