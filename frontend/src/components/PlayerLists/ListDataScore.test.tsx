import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ListDataScore from "./ListDataScore";

jest.mock("../../axiosInstance", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("../../contexts/ThemeContext", () => ({ useTheme: () => ({ theme: { isDark: false } }) }));

const career = { kind: "career" as const, value: 120, band: 5, band_name: "Elite", position: "Centre-back", season: "25/26", seasons: 3, min: 3860 };

test("shows the career score in its band colour and says so on hover", async () => {
  render(<ListDataScore score={career} />);
  const box = screen.getByText("120");
  expect(box).toHaveStyle({ backgroundColor: "#0B4A3B", color: "#FFFFFF" });
  expect(screen.queryByText("CH")).not.toBeInTheDocument();
  fireEvent.mouseOver(box);
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Career score · Elite");
  expect(screen.getByRole("tooltip")).toHaveTextContent("Centre-back · 3 seasons");
});

test("marks a CH index fallback and explains it on hover", async () => {
  render(<ListDataScore score={{ ...career, kind: "ch_index", value: 93.7, band: 1, band_name: "Squad level", position: "Winger", season: "2024", seasons: null, min: 1111 }} />);
  const box = screen.getByText("94");
  expect(box).toHaveStyle({ boxShadow: "inset 0 0 0 1.5px #646C72" });
  expect(screen.getByText("CH")).toBeInTheDocument();
  fireEvent.mouseOver(box);
  expect(await screen.findByRole("tooltip")).toHaveTextContent("CH index · Squad level");
  expect(screen.getByRole("tooltip")).toHaveTextContent("no career score yet");
  expect(screen.getByRole("tooltip")).toHaveTextContent("Winger · 2024 · 1111 min");
});

test("explains N/A on hover", async () => {
  render(<ListDataScore score={null} />);
  fireEvent.mouseOver(screen.getByText("N/A"));
  expect(await screen.findByRole("tooltip")).toHaveTextContent("No data score");
  expect(screen.getByRole("tooltip")).toHaveTextContent("Goalkeepers");
});

test("can render the smaller box used beside a player name", () => {
  render(<ListDataScore score={career} size="sm" />);
  expect(screen.getByText("120")).toHaveClass("data-score-box-sm");
});
