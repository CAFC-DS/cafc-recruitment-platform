import React, { useState, useRef, useEffect } from 'react';

interface QuickActionMenuProps {
  onViewDetails: () => void;
  onChangeStatus: () => void;
  onViewHistory: () => void;
}

const QuickActionMenu: React.FC<QuickActionMenuProps> = ({
  onViewDetails,
  onChangeStatus,
  onViewHistory,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="position-relative" ref={menuRef}>
      <button
        className="btn btn-sm btn-link text-dark p-0"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        style={{ lineHeight: 1 }}
      >
        <i className="bi bi-three-dots-vertical" style={{ fontSize: '1.2rem' }}></i>
      </button>

      {isOpen && (
        <div
          className="dropdown-menu dropdown-menu-end show position-absolute"
          style={{
            top: '100%',
            right: 0,
            zIndex: 1000,
            minWidth: '160px',
          }}
        >
          <button
            className="dropdown-item d-flex align-items-center"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
              setIsOpen(false);
            }}
          >
            <i className="bi bi-eye me-2"></i>
            View Details
          </button>
          <button
            className="dropdown-item d-flex align-items-center"
            onClick={(e) => {
              e.stopPropagation();
              onChangeStatus();
              setIsOpen(false);
            }}
          >
            <i className="bi bi-pencil me-2"></i>
            Change Status
          </button>
          <button
            className="dropdown-item d-flex align-items-center"
            onClick={(e) => {
              e.stopPropagation();
              onViewHistory();
              setIsOpen(false);
            }}
          >
            <i className="bi bi-clock-history me-2"></i>
            View History
          </button>
        </div>
      )}
    </div>
  );
};

export default QuickActionMenu;
