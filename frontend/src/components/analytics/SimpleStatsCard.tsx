import React from 'react';
import { Card } from 'react-bootstrap';
import '../../styles/professional-theme.css';

interface SimpleStatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
}

const SimpleStatsCard: React.FC<SimpleStatsCardProps> = ({ title, value, subtitle, icon }) => {
  return (
    <Card className="stat-card">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-start">
          <div>
            <div className="text-muted small mb-1">{title}</div>
            <h3 className="mb-0">{value ?? 0}</h3>
            {subtitle && <div className="text-muted small mt-1">{subtitle}</div>}
          </div>
          {icon && <div className="text-muted" style={{ fontSize: '2rem' }}>{icon}</div>}
        </div>
      </Card.Body>
    </Card>
  );
};

export default SimpleStatsCard;
