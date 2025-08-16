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

// Add a response interceptor for better error handling
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle network errors
    if (!error.response) {
      console.error('Network error - API might be down');
      // You could show a global error message here
    }
    
    // Handle 401 errors (unauthorized)
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    
    return Promise.reject(error);
  }
);

// Log the current API URL for debugging
console.log('API URL:', getApiUrl());
console.log('Environment:', process.env.NODE_ENV);

export default axiosInstance;