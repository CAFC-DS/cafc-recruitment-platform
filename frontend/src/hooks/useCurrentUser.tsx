import { useState, useEffect } from 'react';
import axiosInstance from '../axiosInstance';
import { useAuth } from '../App';

interface CurrentUser {
  id: number;
  username: string;
  role: string;
  email?: string;
  firstname?: string;
  lastname?: string;
}

export const useCurrentUser = () => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  useEffect(() => {
    const fetchCurrentUser = async () => {
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const response = await axiosInstance.get('/users/me');
        setUser(response.data);
      } catch (error) {
        console.error('Failed to fetch current user:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentUser();
  }, [token]);

  return { 
    user, 
    loading, 
    isAdmin: user?.role === 'admin',
    isManager: user?.role === 'manager',
    canAccessPlayers: user?.role === 'admin' || user?.role === 'manager'
  };
};