// src/App.jsx
import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { Mail, Loader } from "lucide-react";

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
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave({ fetch_interval_minutes: interval, lookback_hours: lookback });
    // wait for a fetch under new config
    await onFetch();
    setSaving(false);
  };

  const handleFetchNow = async () => {
    setFetching(true);
    await onFetch();
    setFetching(false);
  };

  return (
    <div className="flex flex-wrap items-center space-x-4 mb-4">
      <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 space-x-2">
        <span className="text-gray-600 text-sm">Fetch every</span>
        <select
          value={interval}
          onChange={e => setInterval(+e.target.value)}
          className="bg-white border border-gray-300 rounded-md px-2 py-1 text-sm"
        >
          {[1,5,15,30,60,180,360,720,1440].map(m => (
            <option key={m} value={m}>
              {m < 60 ? `${m} min` : `${m/60} hr`}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 space-x-2">
        <span className="text-gray-600 text-sm">Look back</span>
        <select
          value={lookback}
          onChange={e => setLookback(+e.target.value)}
          className="bg-white border border-gray-300 rounded-md px-2 py-1 text-sm"
        >
          {[1,3,6,12,24,72,168,720].map(h => (
            <option key={h} value={h}>
              {h <= 24 ? `${h} hr` : `${h/24} d`}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow disabled:opacity-50"
      >
        {saving
          ? <Loader className="h-4 w-4 animate-spin" />
          : "Save Config"}
      </button>

      <button
        onClick={handleFetchNow}
        disabled={fetching}
        className="flex items-center justify-center bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow disabled:opacity-50"
      >
        {fetching
          ? <Loader className="h-4 w-4 animate-spin" />
          : "Fetch Now"}
      </button>
    </div>
  );
}

export default function App() {
  const [emails, setEmails]     = useState([]);
  const [config, setConfig]     = useState({ fetch_interval_minutes: 5, lookback_hours: 3 });
  const [sortKey, setSortKey]   = useState("importance");
  const [sortDir, setSortDir]   = useState("desc");
  const [search, setSearch]     = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage]         = useState(1);

  useEffect(() => {
    axios.get("http://localhost:8000/config")
      .then(res => setConfig(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
  }, [config]);

  async function fetchData() {
    try {
      const { data } = await axios.get("http://localhost:8000/emails");
      setEmails(data);
      setPage(1);
    } catch (err) {
      console.error("Error fetching emails:", err);
    }
  }

  async function saveConfig(newCfg) {
    try {
      const { data } = await axios.post("http://localhost:8000/config", newCfg);
      setConfig(data);
      return data;
    } catch (err) {
      console.error("Error saving config:", err);
    }
  }

  async function fetchNow() {
    try {
      await axios.post("http://localhost:8000/fetch-now");
      await fetchData();
    } catch (err) {
      console.error("Error on manual fetch:", err);
    }
  }

  async function dismiss(id) {
    try {
      await axios.post(`http://localhost:8000/emails/${id}/dismiss`);
      setEmails(e => e.filter(m => m.message_id !== id));
    } catch (err) {
      console.error(err);
    }
  }

  async function openInOutlook(id) {
    const start = Date.now();
    console.log(`Opening ${id}`);
    try {
      await axios.post(`http://localhost:8000/open/${encodeURIComponent(id)}`);
      console.log("Took", ((Date.now()-start)/1000).toFixed(2), "s");
    } catch (err) {
      console.error(err);
      alert("Could not open email in Outlook.");
    }
  }

  const filtered = useMemo(() =>
    emails.filter(e =>
      [e.sender, e.subject, e.preview].some(f =>
        f.toLowerCase().includes(search.toLowerCase())
      )
    ), [emails, search]
  );

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a,b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (sortKey === "received") {
        va = Date.parse(va); vb = Date.parse(vb);
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.ceil(sorted.length / pageSize);
  const pageData  = sorted.slice((page-1)*pageSize, page*pageSize);

  function onHeaderClick(key) {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const renderPill = (imp) => {
    if (imp === 5) return (
      <span className="
        inline-block uppercase text-xs font-semibold
        bg-red-100 text-red-700
        px-3 py-1 rounded-full
      ">
        Critical
      </span>
    );
    if (imp === 4) return (
      <span className="
        inline-block uppercase text-xs font-semibold
        bg-yellow-100 text-yellow-700
        px-3 py-1 rounded-full
      ">
        Major
      </span>
    );
    if (imp === 3) return (
      <span className="
        inline-block uppercase text-xs font-semibold
        bg-blue-100 text-blue-700
        px-3 py-1 rounded-full
      ">
        High
      </span>
    );
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-3xl font-semibold mb-6">EAi: Important Emails</h1>

        <ConfigPanel
          config={config}
          onSave={saveConfig}
          onFetch={fetchNow}
        />

        <div className="flex items-center justify-between mb-6">
          <div className="flex-1 max-w-xs">
            <input
              type="text"
              placeholder="Search emails…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-gray-600 text-sm">Show</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(+e.target.value); setPage(1); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {[50,100,200].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="text-gray-600 text-sm">entries</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full bg-white rounded-lg overflow-hidden">
            <thead className="bg-gray-100">
              <tr>
                {COLUMNS.map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => onHeaderClick(key)}
                    className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer"
                  >
                    <div className="inline-flex items-center">
                      {label}
                      {sortKey === key && (
                        <span className="ml-1 text-gray-500 text-xs">
                          {sortDir === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageData.map(e => (
                <tr key={e.message_id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-800">
                    {(() => {
                      const d = new Date(e.received);
                      return `${d.toLocaleDateString("en-GB")}, ${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
                    })()}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-800">{e.sender}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">{e.subject}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">{e.preview}</td>
                  <td className="px-4 py-2 text-center">{renderPill(e.importance)}</td>
                  <td className="px-4 py-2 text-center text-sm text-gray-800">{e.reason}</td>
                  <td className="px-4 py-2 text-center">
                    <Mail
                      className="h-5 w-5 text-blue-600 hover:text-blue-800 cursor-pointer"
                      onClick={() => openInOutlook(e.message_id)}
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => dismiss(e.message_id)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Dismiss
                    </button>
                  </td>
                </tr>
              ))}

              {pageData.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-4 text-center text-gray-500">
                    No records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Page <span className="font-medium">{page}</span> of <span className="font-medium">{pageCount}</span>
          </div>
          <div className="space-x-2">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-3 py-1 bg-white border border-gray-300 rounded-full disabled:opacity-50"
            >
              «
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 bg-white border border-gray-300 rounded-full disabled:opacity-50"
            >
              ‹
            </button>
            <button
              onClick={() => setPage(p => Math.min(pageCount, p + 1))}
              disabled={page === pageCount}
              className="px-3 py-1 bg-white border border-gray-300 rounded-full disabled:opacity-50"
            >
              ›
            </button>
            <button
              onClick={() => setPage(pageCount)}
              disabled={page === pageCount}
              className="px-3 py-1 bg-white border border-gray-300 rounded-full disabled:opacity-50"
            >
              »
            </button>
          </div>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-1 text-sm"
          >
            {[50,100,200].map(size => (
              <option key={size} value={size}>
                Show {size}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
