import React from 'react';

interface DealTypeBadgesProps {
  dealTypes: string;
}

const DealTypeBadges: React.FC<DealTypeBadgesProps> = ({ dealTypes }) => {
  if (!dealTypes) return <span className="text-muted">-</span>;

  const types = dealTypes.split(',').map(t => t.trim());

  const badgeStyles: { [key: string]: string } = {
    'Free': 'badge bg-success bg-opacity-10 text-success border border-success',
    'Perm': 'badge bg-primary bg-opacity-10 text-primary border border-primary',
    'Loan': 'badge bg-info bg-opacity-10 text-info border border-info',
    'Loan with Option': 'badge bg-warning bg-opacity-10 text-warning border border-warning',
  };

  const shortLabels: { [key: string]: string } = {
    'Free': 'Free',
    'Perm': 'Perm',
    'Loan': 'Loan',
    'Loan with Option': 'Loan+',
  };

  return (
    <div className="d-flex flex-wrap gap-1">
      {types.map((type, index) => (
        <span
          key={index}
          className={badgeStyles[type] || 'badge bg-secondary bg-opacity-10 text-secondary border border-secondary'}
          style={{ fontSize: '0.7rem', fontWeight: 600 }}
        >
          {shortLabels[type] || type}
        </span>
      ))}
    </div>
  );
};

export default DealTypeBadges;
