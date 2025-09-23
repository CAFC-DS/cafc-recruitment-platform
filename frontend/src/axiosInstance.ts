import axios from 'axios';

// Environment-based API URL configuration
const getApiUrl = () => {
  // Check if we're in production (Vercel sets NODE_ENV=production)
  if (process.env.NODE_ENV === 'production') {
    // Force production URL if env var is not set
    return process.env.REACT_APP_API_URL || 'https://cafc-recruitment-platform-production.up.railway.app';
  }
  
  // In development, use localhost
  return process.env.REACT_APP_API_URL || 'http://localhost:8000';
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

// Add a response interceptor for better error handling
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle network errors
    if (!error.response) {
      console.error('Network error - API might be down');
      // You could show a global error message here
    }
    
    // Handle authentication errors (401 and 422)
    if (error.response?.status === 401 || error.response?.status === 422) {
      // Don't auto-logout on scout report submissions or other critical operations
      const url = error.config?.url || '';
      const isScoutReportSubmission = url.includes('/scout_reports') && (error.config?.method === 'post' || error.config?.method === 'put');
      const isIntelReportSubmission = url.includes('/intel_reports') && (error.config?.method === 'post' || error.config?.method === 'put');
      const isMatchesByDate = url.includes('/matches/date');

      if (!isScoutReportSubmission && !isIntelReportSubmission && !isMatchesByDate) {
        clearAuthAndRedirect();
      }
    }
    
    return Promise.reject(error);
  }
);

// Log the current API URL for debugging
console.log('API URL:', getApiUrl());
console.log('Environment:', process.env.NODE_ENV);

export default axiosInstance;