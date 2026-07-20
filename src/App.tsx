import React, { useState } from "react";
import MergerTool from "./MergerTool.tsx";
import Dashboard from "./Dashboard.tsx";

const TABS = [
  { key: "merger", label: "Data Merger" },
  { key: "dashboard", label: "Dashboard Analisis" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function App() {
  const [tab, setTab] = useState<TabKey>("merger");

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0F1318" }}>
      <nav
        style={{
          display: "flex",
          gap: 4,
          padding: "10px 24px",
          borderBottom: "1px solid #232A32",
          backgroundColor: "#0B0E12",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              backgroundColor: tab === t.key ? "#F5A623" : "transparent",
              color: tab === t.key ? "#14181C" : "#B8C0C9",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "merger" ? <MergerTool /> : <Dashboard />}
    </div>
  );
}
