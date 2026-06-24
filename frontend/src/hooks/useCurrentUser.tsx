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
  const isAgent = user?.role === "agent";
  // View-only role: intel + external/internal recommendations only.
  const isIntelReviewer = user?.role === "intel_reviewer";

  return {
    user,
    loading,
    // Individual role checks
    isAdmin,
    isSeniorManager,
    isManager,
    isLoanManager,
    isScout,
    isAgent,
    isIntelReviewer,
    // Permission checks
    canAccessAdmin: isAdmin,
    canAccessIntel: isAdmin || isSeniorManager || isIntelReviewer,
    canManageIntel: isAdmin || isSeniorManager,
    canAccessAnalytics: isAdmin || isSeniorManager || isManager,
    canAccessLists: isAdmin || isSeniorManager,
    // Recommendations (external = agent intake page, internal = staff page)
    canAccessExternalRecs: isAdmin || isSeniorManager || isIntelReviewer,
    canAccessInternalRecs: isAdmin || isSeniorManager || isManager || isLoanManager || isScout || isIntelReviewer,
    canAccessRecommendations: isAdmin || isSeniorManager || isManager || isLoanManager || isScout,
    canSeeAllReports: isAdmin || isSeniorManager || isManager,
    canSeeAllLoanReports: isAdmin || isSeniorManager || isManager || isLoanManager,
    canGenerateShareLinks: isAdmin || isSeniorManager || isManager,
  };
};
