import React, { useState } from 'react';
import { Card, Form, Table } from 'react-bootstrap';

interface PlayerData {
  player_name: string;
  position: string;
  avg_performance_score?: number;
  avg_attribute_score?: number;
  report_count: number;
}

interface PositionFilteredTableProps {
  title: string;
  data: PlayerData[];
  positions: string[];
  metric: 'avg_performance_score' | 'avg_attribute_score';
}

const PositionFilteredTable: React.FC<PositionFilteredTableProps> = ({ title, data, positions, metric }) => {
  const [positionFilter, setPositionFilter] = useState<string>('');

  const filteredData = positionFilter
    ? data.filter(p => p.position === positionFilter)
    : data;

  // Sort by the specified metric and take the top 5
  const sortedData = [...filteredData].sort((a, b) => (b[metric] || 0) - (a[metric] || 0)).slice(0, 5);

  const getMetricName = () => {
    if (metric === 'avg_performance_score') return 'Avg Performance';
    if (metric === 'avg_attribute_score') return 'Avg Attributes';
    return 'Score';
  };

  return (
    <Card className="shadow-sm h-100" style={{ borderRadius: "12px", border: "1px solid #e0e0e0" }}>
      <Card.Header style={{ backgroundColor: "#f8f9fa", borderBottom: "2px solid #dee2e6" }}>
        <div className="d-flex justify-content-between align-items-center">
          <h6 className="mb-0 fw-bold">{title}</h6>
          <Form.Select
            size="sm"
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            style={{ width: '180px' }}
          >
            <option value="">All Positions</option>
            {positions.map(pos => <option key={pos} value={pos}>{pos}</option>)} 
          </Form.Select>
        </div>
      </Card.Header>
      <Card.Body style={{ padding: "0" }}>
        <Table hover responsive className="mb-0">
          <thead style={{ backgroundColor: "#6c757d", color: "white" }}>
            <tr>
              <th style={{ padding: "0.75rem" }}>Player</th>
              <th style={{ padding: "0.75rem" }}>Position</th>
              <th style={{ padding: "0.75rem" }}>{getMetricName()}</th>
              <th style={{ padding: "0.75rem" }}>Reports</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((player, index) => (
              <tr key={index}>
                <td style={{ padding: "0.75rem" }}>{player.player_name}</td>
                <td style={{ padding: "0.75rem" }}><span className="badge bg-secondary">{player.position}</span></td>
                <td style={{ padding: "0.75rem" }}>
                  <span 
                    className={`badge ${ (player[metric] || 0) >= 8 ? 'bg-success' : (player[metric] || 0) >= 6 ? 'bg-warning' : 'bg-danger'}`}
                    style={{ fontSize: '0.85rem' }}
                  >
                    {(player[metric] || 0).toFixed(2)}
                  </span>
                </td>
                <td style={{ padding: "0.75rem" }}>{player.report_count}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        {sortedData.length === 0 && <p className="text-center text-muted p-3 mb-0">No data available for this position.</p>}
      </Card.Body>
    </Card>
  );
};

export default PositionFilteredTable;
