import React from "react";
import { Card, Form, Row, Col } from "react-bootstrap";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export interface MonthlyReportsChartProps {
  title: string;
  data: Array<{
    month: string;
    [key: string]: any;
  }>;
  dataKeys: Array<{
    key: string;
    label: string;
    color: string;
  }>;
  minMonths: number;
  onMinMonthsChange: (months: number) => void;
  color?: string;
  height?: number;
}

const MonthlyReportsChart: React.FC<MonthlyReportsChartProps> = ({
  title,
  data,
  dataKeys,
  minMonths,
  onMinMonthsChange,
  color = "#6c757d",
  height = 350,
}) => {
  // Format month labels
  const formatMonth = (monthStr: string) => {
    try {
      const date = new Date(monthStr);
      return date.toLocaleDateString("en-US", { year: "numeric", month: "short" });
    } catch {
      return monthStr;
    }
  };

  const chartData = {
    labels: data.map((item) => formatMonth(item.month)),
    datasets: dataKeys.map((dk) => ({
      label: dk.label,
      data: data.map((item) => item[dk.key] || 0),
      borderColor: dk.color,
      backgroundColor: `${dk.color}33`,
      tension: 0.3,
      fill: true,
    })),
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          font: { size: 12 },
          padding: 15,
        },
      },
      title: {
        display: false,
      },
      tooltip: {
        mode: "index" as const,
        intersect: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: "Number of Reports",
          font: { size: 12, weight: "bold" as const },
        },
        grid: { color: "#f0f0f0" },
      },
      x: {
        title: {
          display: true,
          text: "Month",
          font: { size: 12, weight: "bold" as const },
        },
        grid: { display: false },
      },
    },
    interaction: {
      mode: "nearest" as const,
      axis: "x" as const,
      intersect: false,
    },
  };

  return (
    <Card
      className="shadow-sm"
      style={{
        borderRadius: "12px",
        border: `2px solid ${color}`,
      }}
    >
      <Card.Header
        style={{
          backgroundColor: "#f8f9fa",
          color: "#2c3e50",
          borderBottom: "2px solid #dee2e6",
        }}
      >
        <Row className="align-items-center">
          <Col md={8}>
            <h6 className="mb-0 fw-bold">{title}</h6>
          </Col>
          <Col md={4}>
            <Form.Select
              value={minMonths}
              onChange={(e) => onMinMonthsChange(Number(e.target.value))}
              size="sm"
            >
              <option value={3}>Last 3 Months</option>
              <option value={6}>Last 6 Months</option>
              <option value={9}>Last 9 Months</option>
              <option value={12}>Last 12 Months</option>
            </Form.Select>
          </Col>
        </Row>
      </Card.Header>
      <Card.Body style={{ height: `${height}px`, padding: "1.5rem" }}>
        {data.length > 0 ? (
          <Line data={chartData} options={options} />
        ) : (
          <div className="text-center py-5">
            <p className="text-muted">No data available for the selected period</p>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default MonthlyReportsChart;
