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
      backgroundColor: ds.backgroundColor || 'transparent',
      tension: 0.4,
      fill: true,
      borderWidth: 3,
      pointRadius: 5,
      pointHoverRadius: 7,
      pointBackgroundColor: ds.borderColor || '#000000',
      pointBorderColor: '#fff',
      pointBorderWidth: 2
    }))
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 20,
        right: 20,
        bottom: 10,
        left: 10
      }
    },
    plugins: {
      legend: {
        display: datasets.length > 1,
        position: 'right' as const,
        align: 'center' as const,
        labels: {
          boxWidth: 15,
          padding: 20,
          font: {
            size: 13,
            weight: 600
          },
          usePointStyle: true,
          pointStyle: 'circle'
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
        offset: 6,
        font: {
          size: 13,
          weight: 700
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
            size: 13,
            weight: 500
          },
          color: '#495057',
          padding: 8
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.08)',
          drawBorder: false,
          lineWidth: 1
        }
      },
      x: {
        ticks: {
          font: {
            size: 13,
            weight: 500
          },
          color: '#495057',
          padding: 8
        },
        grid: {
          display: false,
          drawBorder: false
        }
      }
    }
  };

  return (
    <Card className="shadow-sm" style={{ border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <Card.Header style={{ backgroundColor: '#212529', borderBottom: '2px solid #b91c1c', padding: '1rem 1.25rem' }}>
        <h5 className="mb-0" style={{ color: '#ffffff', fontWeight: 600 }}>{title}</h5>
      </Card.Header>
      <Card.Body style={{ padding: '1.5rem' }}>
        <div style={{ height: `${height}px` }}>
          <Line data={chartData} options={options} />
        </div>
      </Card.Body>
    </Card>
  );
};

export default SimpleLineChart;
