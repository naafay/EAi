// src/App.jsx
import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { Mail } from "lucide-react";

const COLUMNS = [
  { key: "received",   label: "Datetime" },
  { key: "sender",     label: "From" },
  { key: "subject",    label: "Subject" },
  { key: "preview",    label: "Body preview" },
  { key: "importance", label: "Rating" },
  { key: "reason",     label: "Reason" },
  { key: "open",       label: "" },
  { key: "dismiss",    label: "" },
];

export default function App() {
  const [emails, setEmails] = useState([]);
  const [sortKey, setSortKey] = useState("importance");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 60000);
    return () => clearInterval(id);
  }, []);

  async function fetchData() {
    try {
      const { data } = await axios.get("http://localhost:8000/emails");
      setEmails(data);
    } catch (err) {
      console.error("Error fetching emails:", err);
    }
  }

  async function dismiss(id) {
    try {
      await axios.post(`http://localhost:8000/emails/${id}/dismiss`);
      setEmails(prev => prev.filter(e => e.message_id !== id));
    } catch (err) {
      console.error("Error dismissing email:", err);
    }
  }

  async function openInOutlook(id) {
    const start = Date.now();
    console.log(`[${new Date().toLocaleTimeString()}] Clicked open icon for:`, id);
    try {
      await axios.post(`http://localhost:8000/open/${encodeURIComponent(id)}`);
      const duration = ((Date.now() - start) / 1000).toFixed(2);
      console.log(
        `[${new Date().toLocaleTimeString()}] Outlook opened — took ${duration}s`
      );
    } catch (err) {
      const duration = ((Date.now() - start) / 1000).toFixed(2);
      console.error(
        `[${new Date().toLocaleTimeString()}] Open failed after ${duration}s:`, err
      );
      alert("Could not open email in Outlook.");
    }
  }

  const sorted = useMemo(() => {
    const arr = [...emails];
    arr.sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (sortKey === "received") {
        va = Date.parse(va);
        vb = Date.parse(vb);
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [emails, sortKey, sortDir]);

  function onHeaderClick(key) {
    if (key === sortKey) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">EAi: Important Emails</h1>
      <div className="overflow-auto">
        <table className="min-w-full bg-white border">
          <thead>
            <tr>
              {COLUMNS.map(({ key, label }) => (
                <th
                  key={key}
                  className="px-4 py-2 border-b cursor-pointer select-none"
                  onClick={() => onHeaderClick(key)}
                >
                  <div className="flex items-center justify-center">
                    {label}
                    {sortKey === key && (
                      <span className="ml-1 text-gray-500">
                        {sortDir === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(e => (
              <tr key={e.message_id} className="hover:bg-gray-50">
                <td className="px-4 py-2 border-b text-center">
                  {e.received ? new Date(e.received).toLocaleString() : "---"}
                </td>
                <td className="px-4 py-2 border-b">{e.sender}</td>
                <td className="px-4 py-2 border-b">{e.subject}</td>
                <td className="px-4 py-2 border-b">{e.preview}</td>
                <td className="px-4 py-2 border-b text-center">{e.importance}</td>
                <td className="px-4 py-2 border-b text-center">{e.reason}</td>
                <td className="px-4 py-2 border-b text-center">
                  <button onClick={() => openInOutlook(e.message_id)}>
                    <Mail className="h-5 w-5 text-blue-600 hover:text-blue-800" />
                  </button>
                </td>
                <td className="px-4 py-2 border-b text-center">
                  <button
                    onClick={() => dismiss(e.message_id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    Dismiss
                  </button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="p-4 text-center text-gray-600">
                  No important emails.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
