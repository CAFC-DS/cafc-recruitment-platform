import React from 'react';
import { Card, ButtonGroup, Button } from 'react-bootstrap';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import '../../styles/professional-theme.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartDataLabels
);

interface DatasetConfig {
  label: string;
  data: number[];
  borderColor?: string;
  backgroundColor?: string;
}

interface SimpleLineChartProps {
  title: string;
  labels: string[];
  datasets: DatasetConfig[];
  height?: number;
}

const SimpleLineChart: React.FC<SimpleLineChartProps> = ({
  title,
  labels,
  datasets,
  height = 300
}) => {
  const chartData = {
    labels: labels || [],
    datasets: (datasets || []).map((ds, index) => ({
      label: ds.label || '',
      data: ds.data || [],
      borderColor: ds.borderColor || (index === 0 ? '#000000' : '#6c757d'),
      backgroundColor: 'transparent',
      tension: 0.3,
      fill: false,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5
    }))
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: datasets.length > 1,
        position: 'top' as const,
        labels: {
          boxWidth: 12,
          padding: 15,
          font: {
            size: 12,
            weight: 500
          }
        }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: {
          size: 13,
          weight: 600
        },
        bodyFont: {
          size: 12
        }
      },
      datalabels: {
        align: 'top' as const,
        anchor: 'end' as const,
        offset: 4,
        font: {
          size: 11,
          weight: 600
        },
        formatter: (value: number) => {
          return value > 0 ? value : '';
        },
        color: (context: any) => {
          // Use the border color of the dataset for the label
          return context.dataset.borderColor || '#000000';
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0,
          font: {
            size: 11
          },
          color: '#6c757d'
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
          drawBorder: false
        }
      },
      x: {
        ticks: {
          font: {
            size: 11
          },
          color: '#6c757d'
        },
        grid: {
          display: false,
          drawBorder: false
        }
      }
    }
  };

  return (
    <Card className="stat-card">
      <Card.Body>
        <h5 className="mb-3">{title}</h5>
        <div style={{ height: `${height}px` }}>
          <Line data={chartData} options={options} />
        </div>
      </Card.Body>
    </Card>
  );
};

export default SimpleLineChart;
