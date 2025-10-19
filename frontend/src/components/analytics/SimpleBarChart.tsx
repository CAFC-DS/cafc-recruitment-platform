import React from 'react';
import { Card } from 'react-bootstrap';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import '../../styles/professional-theme.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartDataLabels
);

interface SimpleBarChartProps {
  title: string;
  labels: string[];
  data: number[];
  color?: string;
  height?: number;
}

const SimpleBarChart: React.FC<SimpleBarChartProps> = ({
  title,
  labels,
  data,
  color = '#e31e24',
  height = 300
}) => {
  const chartData = {
    labels: labels || [],
    datasets: [
      {
        label: title,
        data: data || [],
        backgroundColor: color,
        borderColor: color,
        borderWidth: 1
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y' as const, // Horizontal bar chart for better readability
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            return `Reports: ${context.parsed.x}`;
          }
        }
      },
      datalabels: {
        color: '#000000',
        font: {
          size: 13,
          weight: 'bold' as const
        },
        anchor: 'end' as const,
        align: 'end' as const,
        offset: 8,
        formatter: (value: number) => {
          return value > 0 ? value : '';
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          precision: 0,
          font: {
            size: 11
          },
          color: '#6c757d'
        },
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.05)',
          drawBorder: false
        }
      },
      y: {
        ticks: {
          font: {
            size: 12,
            weight: 'bold' as const
          },
          color: '#000000'
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
          <Bar data={chartData} options={options} />
        </div>
      </Card.Body>
    </Card>
  );
};

export default SimpleBarChart;
