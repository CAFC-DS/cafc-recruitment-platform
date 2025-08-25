import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';

type ViewMode = 'cards' | 'table';

interface ViewModeContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  initializeUserViewMode: (userId: string) => void;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

export const ViewModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [viewMode, setViewModeState] = useState<ViewMode>('table');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);


  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    // Use a closure to avoid dependency on currentUserId
    const userId = currentUserId;
    if (userId) {
      localStorage.setItem(`viewMode_${userId}`, mode);
    }
  }, [currentUserId]);

  const toggleViewMode = useCallback(() => {
    setViewModeState(current => {
      const newMode = current === 'cards' ? 'table' : 'cards';
      // Use a closure to avoid dependencies
      const userId = currentUserId;
      if (userId) {
        localStorage.setItem(`viewMode_${userId}`, newMode);
      }
      return newMode;
    });
  }, [currentUserId]);

  const initializeUserViewMode = useCallback((userId: string) => {
    // Only update if the user ID changed or if we don't have a current user
    setCurrentUserId(prevUserId => {
      if (prevUserId !== userId) {
        const stored = localStorage.getItem(`viewMode_${userId}`);
        const userViewMode = (stored as ViewMode) || 'table';
        // Set the view mode directly to avoid circular dependencies
        setViewModeState(userViewMode);
        return userId;
      }
      return prevUserId;
    });
  }, []);

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode, toggleViewMode, initializeUserViewMode }}>
      {children}
    </ViewModeContext.Provider>
  );
};

export const useViewMode = () => {
  const context = useContext(ViewModeContext);
  if (context === undefined) {
    throw new Error('useViewMode must be used within a ViewModeProvider');
  }
  return context;
};