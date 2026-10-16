import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import axiosInstance from "../axiosInstance";
import { useAuth } from "../contexts/AuthContext";

interface CurrentUser {
  id: number;
  username: string;
  role: string;
  email?: string;
  firstname?: string;
  lastname?: string;
}

const CurrentUserContext = createContext<{ user: CurrentUser | null; loading: boolean } | undefined>(undefined);

export const CurrentUserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const [state, setState] = useState<{ token: string | null; user: CurrentUser | null; loading: boolean }>({ token: null, user: null, loading: false });
  const pending = useRef<{ token: string; request: Promise<CurrentUser> } | null>(null);

  useEffect(() => {
    let active = true;
    if (!token) {
      pending.current = null;
      setState({ token: null, user: null, loading: false });
      return;
    }

    const refresh = async () => {
      // Reuse the request on concurrent focus events and StrictMode effect replay.
      if (pending.current?.token !== token) {
        pending.current = { token, request: axiosInstance.get<CurrentUser>("/users/me").then(({ data }) => data) };
      }
      const request = pending.current.request;
      try {
        const user = await request;
        if (active) setState({ token, user, loading: false });
      } catch (error) {
        if (active) {
          console.error("Failed to fetch current user:", error);
          setState({ token, user: null, loading: false });
        }
      } finally {
        if (pending.current?.request === request) pending.current = null;
      }
    };

    void refresh();
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token]);

  // Never expose the previous account's permissions while a new token loads.
  const value = state.token === token ? state : { user: null, loading: Boolean(token) };
  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
};

export const useCurrentUser = () => {
  const context = useContext(CurrentUserContext);
  if (!context) throw new Error("useCurrentUser must be used within a CurrentUserProvider");
  const { user, loading } = context;

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
    canViewFlowHistory: isAdmin || isSeniorManager,
  };
};
