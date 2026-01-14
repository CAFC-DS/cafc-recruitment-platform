import axios from 'axios';

// Environment-based API URL configuration
const getApiUrl = () => {
  // Check if we're in production (Vercel sets NODE_ENV=production)
  if (process.env.NODE_ENV === 'production') {
    // Force production URL if env var is not set
    return process.env.REACT_APP_API_URL || 'https://cafc-recruitment-platform-production.up.railway.app';
  }

  // In development, use localhost
  return process.env.REACT_APP_API_URL || 'http://localhost:3001';
};

const axiosInstance = axios.create({
  baseURL: getApiUrl(),
  timeout: 60000, // 60 second timeout for Railway cold starts
});

// Add a request interceptor
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Function to clear authentication and redirect
const clearAuthAndRedirect = () => {
  localStorage.removeItem('token');
  
  // Only redirect if we're not already on the login page
  if (!window.location.pathname.includes('/login')) {
    window.location.href = '/login';
  }
};

// Add a response interceptor for better error handling and token refresh
axiosInstance.interceptors.response.use(
  (response) => {
    // On successful responses, try to refresh token if we're getting close to expiry
    const token = localStorage.getItem('token');
    if (token && !response.config.url?.includes('/auth/refresh')) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const currentTime = Date.now() / 1000;
        const timeUntilExpiry = payload.exp - currentTime;

        // Refresh token if less than 30 minutes remaining
        if (timeUntilExpiry > 0 && timeUntilExpiry < 30 * 60) {
          refreshTokenAsync();
        }
      } catch (error) {
        // Invalid token format, will be handled by auth validation
      }
    }
    return response;
  },
  async (error) => {
    // Handle network errors
    if (!error.response) {
      console.error('Network error - API might be down');
      return Promise.reject(error);
    }

    // Handle authentication errors (401 and 422)
    if (error.response?.status === 401 || error.response?.status === 422) {
      const url = error.config?.url || '';
      const isRefreshAttempt = url.includes('/auth/refresh');
      const isScoutReportSubmission = url.includes('/scout_reports') && (error.config?.method === 'post' || error.config?.method === 'put');
      const isIntelReportSubmission = url.includes('/intel_reports') && (error.config?.method === 'post' || error.config?.method === 'put');
      const isMatchesByDate = url.includes('/matches/date');

      // If refresh failed or critical operations failed, logout
      if (isRefreshAttempt || (!isScoutReportSubmission && !isIntelReportSubmission && !isMatchesByDate)) {
        clearAuthAndRedirect();
      }
    }

    return Promise.reject(error);
  }
);

// Async token refresh function to avoid blocking API calls
const refreshTokenAsync = async () => {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const response = await fetch(`${axiosInstance.defaults.baseURL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('token', data.access_token);
    }
  } catch (error) {
    console.warn('Background token refresh failed:', error);
  }
};

// Log the current API URL for debugging
console.log('API URL:', getApiUrl());
console.log('Environment:', process.env.NODE_ENV);

export default axiosInstance;