import React, { useState } from "react";
import { Button, Dropdown } from "react-bootstrap";

interface ExportButtonProps {
  data: any[];
  filename: string;
  chartRef?: React.RefObject<any>;
  type?: "data" | "chart" | "both";
}

const ExportButton: React.FC<ExportButtonProps> = ({
  data,
  filename,
  chartRef,
  type = "both",
}) => {
  const [exporting, setExporting] = useState(false);

  const exportToCSV = () => {
    if (!data || data.length === 0) {
      alert("No data to export");
      return;
    }

    // Convert data to CSV
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((header) => {
            const value = row[header];
            // Handle values that contain commas or quotes
            if (typeof value === "string" && (value.includes(",") || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(",")
      ),
    ];

    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPNG = async () => {
    if (!chartRef || !chartRef.current) {
      alert("No chart available to export");
      return;
    }

    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });

      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${filename}.png`;
          link.click();
          URL.revokeObjectURL(url);
        }
        setExporting(false);
      });
    } catch (error) {
      console.error("Error exporting chart:", error);
      alert("Failed to export chart");
      setExporting(false);
    }
  };

  if (type === "data") {
    return (
      <Button
        variant="link"
        size="sm"
        onClick={exportToCSV}
        title="Export CSV"
        style={{
          color: '#fff',
          padding: '4px 8px',
          fontSize: '1.1rem',
          textDecoration: 'none',
          border: 'none'
        }}
      >
        📥
      </Button>
    );
  }

  if (type === "chart") {
    return (
      <Button
        variant="outline-secondary"
        size="sm"
        onClick={exportToPNG}
        disabled={exporting}
      >
        {exporting ? "Exporting..." : "📊 Export PNG"}
      </Button>
    );
  }

  return (
    <Dropdown>
      <Dropdown.Toggle variant="outline-secondary" size="sm" id="export-dropdown">
        📥 Export
      </Dropdown.Toggle>

      <Dropdown.Menu>
        <Dropdown.Item onClick={exportToCSV}>Export Data (CSV)</Dropdown.Item>
        {chartRef && (
          <Dropdown.Item onClick={exportToPNG} disabled={exporting}>
            {exporting ? "Exporting..." : "Export Chart (PNG)"}
          </Dropdown.Item>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
};

export default ExportButton;
