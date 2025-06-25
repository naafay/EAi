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

function ConfigPanel({ config, onSave, onFetch }) {
  const [interval, setInterval] = useState(config.fetch_interval_minutes);
  const [lookback, setLookback] = useState(config.lookback_hours);

  return (
    <div className="flex items-center space-x-4 mb-6">
      <label>
        Backend Fetch Every:
        <select
          value={interval}
          onChange={e => setInterval(+e.target.value)}
          className="ml-2 border rounded p-1"
        >
          {[1,5,15,30,60,180,360,720,1440].map(m => (
            <option key={m} value={m}>
              {m < 60 ? `${m} min` : `${m/60} hr`}
            </option>
          ))}
        </select>
      </label>

      <label>
        Look Back:
        <select
          value={lookback}
          onChange={e => setLookback(+e.target.value)}
          className="ml-2 border rounded p-1"
        >
          {[1,3,6,12,24,72,168,720].map(h => (
            <option key={h} value={h}>
              {h <= 24 ? `${h} hr` : `${h/24} d`}
            </option>
          ))}
        </select>
      </label>

      <button
        onClick={() => onSave({ fetch_interval_minutes: interval, lookback_hours: lookback })}
        className="bg-blue-600 text-white px-3 py-1 rounded"
      >
        Save Config
      </button>

      <button
        onClick={onFetch}
        className="bg-green-600 text-white px-3 py-1 rounded"
      >
        Fetch Now
      </button>
    </div>
  );
}

export default function App() {
  const [emails, setEmails] = useState([]);
  const [config, setConfig] = useState({ fetch_interval_minutes: 5, lookback_hours: 3 });
  const [sortKey, setSortKey] = useState("importance");
  const [sortDir, setSortDir] = useState("desc");

  // Load config once on mount
  useEffect(() => {
    axios.get("http://localhost:8000/config")
      .then(res => setConfig(res.data))
      .catch(console.error);
  }, []);

  // Fetch emails initially and every time we save config
  useEffect(() => {
    fetchData();
  }, [config]);

  async function fetchData() {
    try {
      const { data } = await axios.get("http://localhost:8000/emails");
      setEmails(data);
    } catch (err) {
      console.error("Error fetching emails:", err);
    }
  }

  async function saveConfig(newCfg) {
    try {
      const { data } = await axios.post("http://localhost:8000/config", newCfg);
      setConfig(data);
    } catch (err) {
      console.error("Error saving config:", err);
    }
  }

  async function fetchNow() {
    try {
      await axios.post("http://localhost:8000/fetch-now");
      fetchData();
    } catch (err) {
      console.error("Error on manual fetch:", err);
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
    console.log(`[${new Date().toLocaleTimeString()}] Clicked open for`, id);
    try {
      await axios.post(`http://localhost:8000/open/${encodeURIComponent(id)}`);
      console.log(`Opened in ${((Date.now()-start)/1000).toFixed(2)}s`);
    } catch (err) {
      console.error("Open failed:", err);
      alert("Could not open email in Outlook.");
    }
  }

  const sorted = useMemo(() => {
    const arr = [...emails];
    arr.sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (sortKey === "received") {
        va = Date.parse(va); vb = Date.parse(vb);
      }
      if (va<vb) return sortDir==="asc"? -1:1;
      if (va>vb) return sortDir==="asc"? 1:-1;
      return 0;
    });
    return arr;
  }, [emails, sortKey, sortDir]);

  function onHeaderClick(key){
    if(key===sortKey) setSortDir(d=>d==="asc"?"desc":"asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">EAi: Important Emails</h1>
      <ConfigPanel config={config} onSave={saveConfig} onFetch={fetchNow}/>
      <div className="overflow-auto">
        <table className="min-w-full bg-white border">
          <thead><tr>
            {COLUMNS.map(({key,label})=>(
              <th key={key}
                className="px-4 py-2 border-b cursor-pointer select-none"
                onClick={()=>onHeaderClick(key)}>
                <div className="flex items-center justify-center">
                  {label}
                  {sortKey===key && (
                    <span className="ml-1 text-gray-500">
                      {sortDir==="asc"?"▲":"▼"}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {sorted.map(e=>(
              <tr key={e.message_id} className="hover:bg-gray-50">
                <td className="px-4 py-2 border-b text-center">
                  {e.received
                    ? (() => {
                        const d = new Date(e.received);
                        const date = d.toLocaleDateString("en-GB");
                        const hh = d.getUTCHours().toString().padStart(2,"0");
                        const mm = d.getUTCMinutes().toString().padStart(2,"0");
                        return `${date}, ${hh}:${mm}`;
                      })()
                    : "---"}
                </td>
                <td className="px-4 py-2 border-b">{e.sender}</td>
                <td className="px-4 py-2 border-b">{e.subject}</td>
                <td className="px-4 py-2 border-b">{e.preview}</td>
                <td className="px-4 py-2 border-b text-center">{e.importance}</td>
                <td className="px-4 py-2 border-b text-center">{e.reason}</td>
                <td className="px-4 py-2 border-b text-center">
                  <button onClick={()=>openInOutlook(e.message_id)}>
                    <Mail className="h-5 w-5 text-blue-600 hover:text-blue-800" />
                  </button>
                </td>
                <td className="px-4 py-2 border-b text-center">
                  <button onClick={()=>dismiss(e.message_id)}
                          className="text-red-500 hover:text-red-700">
                    Dismiss
                  </button>
                </td>
              </tr>
            ))}
            {sorted.length===0 && (
              <tr>
                <td colSpan={COLUMNS.length}
                    className="p-4 text-center text-gray-600">
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
