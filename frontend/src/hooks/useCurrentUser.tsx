import { useState, useEffect } from "react";
import axiosInstance from "../axiosInstance";
import { useAuth } from "../App";

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
        const response = await axiosInstance.get("/users/me");
        setUser(response.data);
      } catch (error) {
        console.error("Failed to fetch current user:", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentUser();
  }, [token]);

  // Role checks
  const isAdmin = user?.role === "admin";
  const isSeniorManager = user?.role === "senior_manager";
  const isManager = user?.role === "manager";
  const isLoanManager = user?.role === "loan_manager";
  const isScout = user?.role === "scout";

  return {
    user,
    loading,
    // Individual role checks
    isAdmin,
    isSeniorManager,
    isManager,
    isLoanManager,
    isScout,
    // Permission checks
    canAccessAdmin: isAdmin,
    canAccessIntel: isAdmin || isSeniorManager,
    canAccessAnalytics: isAdmin || isSeniorManager || isManager,
    canAccessLists: isAdmin || isSeniorManager,
    canSeeAllReports: isAdmin || isSeniorManager || isManager,
    canSeeAllLoanReports: isAdmin || isSeniorManager || isManager || isLoanManager,
    canGenerateShareLinks: isAdmin || isSeniorManager || isManager,
  };
};
