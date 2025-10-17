import React from 'react';
import { Card, Table } from 'react-bootstrap';
import '../../styles/professional-theme.css';

interface ColumnConfig {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
}

interface SimpleTableProps {
  title: string;
  columns: ColumnConfig[];
  data: any[];
  onRowClick?: (row: any) => void;
  emptyMessage?: string;
}

const SimpleTable: React.FC<SimpleTableProps> = ({
  title,
  columns,
  data,
  onRowClick,
  emptyMessage = 'No data available'
}) => {
  return (
    <Card className="stat-card">
      <Card.Body>
        <h5 className="mb-3">{title}</h5>
        {(!data || data.length === 0) ? (
          <div className="text-center text-muted py-4">{emptyMessage}</div>
        ) : (
          <div className="table-responsive">
            <Table hover className="mb-0">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, idx) => (
                  <tr
                    key={idx}
                    onClick={() => onRowClick?.(row)}
                    style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                  >
                    {columns.map((col) => (
                      <td key={col.key}>
                        {col.render
                          ? col.render(row[col.key], row)
                          : row[col.key] ?? '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default SimpleTable;
