// src/App.jsx
import { useEffect, useState, useMemo, useRef } from "react";
import axios from "axios";
import { Mail, Loader } from "lucide-react";

// point axios at your backend once
axios.defaults.baseURL = "http://localhost:8000";

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

function ConfigPanel({ config, onSave, onFetch, loading }) {
  const [interval, setIntervalValue] = useState(config.fetch_interval_minutes);
  const [lookback, setLookback]     = useState(config.lookback_hours);

  // keep selects in sync if server config changes
  useEffect(() => {
    setIntervalValue(config.fetch_interval_minutes);
    setLookback(config.lookback_hours);
  }, [config]);

  return (
    <div className="flex flex-wrap items-center space-x-4 mb-4">
      {/* Fetch every */}
      <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 space-x-2">
        <span className="text-gray-600 text-sm">Fetch every</span>
        <select
          value={interval}
          onChange={e => setIntervalValue(+e.target.value)}
          disabled={loading}
          className="bg-white border border-gray-300 rounded-md px-2 py-1 text-sm"
        >
          {[1,5,15,30,60,180,360,720,1440].map(m => (
            <option key={m} value={m}>
              {m < 60 ? `${m} min` : `${m/60} hr`}
            </option>
          ))}
        </select>
      </div>

      {/* Look back */}
      <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 space-x-2">
        <span className="text-gray-600 text-sm">Look back</span>
        <select
          value={lookback}
          onChange={e => setLookback(+e.target.value)}
          disabled={loading}
          className="bg-white border border-gray-300 rounded-md px-2 py-1 text-sm"
        >
          {[1,3,6,12,24,72,168,720].map(h => (
            <option key={h} value={h}>
              {h <= 24 ? `${h} hr` : `${h/24} d`}
            </option>
          ))}
        </select>
      </div>

      {/* Save Config */}
      <button
        onClick={() => onSave({ fetch_interval_minutes: interval, lookback_hours: lookback })}
        disabled={loading}
        className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow disabled:opacity-50"
      >
        {loading
          ? <Loader className="h-4 w-4 animate-spin" />
          : "Save Config"}
      </button>

      {/* Manual Fetch */}
      <button
        onClick={onFetch}
        disabled={loading}
        className="flex items-center justify-center bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow disabled:opacity-50"
      >
        {loading
          ? <Loader className="h-4 w-4 animate-spin" />
          : "Fetch Now"}
      </button>
    </div>
  );
}

export default function App() {
  const [emails, setEmails]       = useState([]);
  const [config, setConfig]       = useState({ fetch_interval_minutes: 5, lookback_hours: 3 });
  const [sortKey, setSortKey]     = useState("importance");
  const [sortDir, setSortDir]     = useState("desc");
  const [search, setSearch]       = useState("");
  const [pageSize, setPageSize]   = useState(50);
  const [page, setPage]           = useState(1);
  const [lastFetch, setLastFetch] = useState(null);
  const [nextFetch, setNextFetch] = useState(null);
  const [loading, setLoading]     = useState(false);

  // hold interval id so we can re-schedule
  const intervalRef = useRef(null);

  // 1) load config on mount
  useEffect(() => {
    setLoading(true);
    axios.get("/config")
      .then(r => setConfig(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // 2) whenever config changes: reset polling and immediately fetch
  useEffect(() => {
    // clear old
    if (intervalRef.current) clearInterval(intervalRef.current);

    // schedule new
    intervalRef.current = setInterval(() => {
      doFetch();
    }, config.fetch_interval_minutes * 60 * 1000);

    // immediate first fetch
    doFetch();

    return () => clearInterval(intervalRef.current);
  }, [config]);

  // core fetch + timestamps
  async function doFetch() {
    setLoading(true);
    const now = new Date();
    setLastFetch(now);
    setNextFetch(new Date(now.getTime() + config.fetch_interval_minutes * 60000));

    try {
      const { data } = await axios.get("/emails");
      setEmails(data);
      setPage(1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // save config
  async function saveConfig(newCfg) {
    setLoading(true);
    try {
      const { data } = await axios.post("/config", newCfg);
      setConfig(data);
      // the config‐effect will clear interval & call doFetch()
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }

  // manual fetch
  function fetchNow() {
    doFetch();
  }

  // dismiss & open
  async function dismiss(id) {
    await axios.post(`/emails/${id}/dismiss`);
    setEmails(e => e.filter(m => m.message_id !== id));
  }
  async function openInOutlook(id) {
    try {
      await axios.post(`/open/${encodeURIComponent(id)}`);
    } catch {
      alert("Could not open Outlook.");
    }
  }

  // filter → sort → paginate
  const filtered = useMemo(() =>
    emails.filter(e =>
      [e.sender, e.subject, e.preview].some(f =>
        f.toLowerCase().includes(search.toLowerCase())
      )
    ), [emails, search]
  );

    const sorted = useMemo(() => {
    return filtered
      .slice() // make a copy
      .sort((a, b) => {
        // 1) rating descending
        if (b.importance !== a.importance) {
          return b.importance - a.importance;
        }
        // 2) received datetime descending
        const ta = Date.parse(a.received);
        const tb = Date.parse(b.received);
        return tb - ta;
      });
  }, [filtered]);

  const pageCount = Math.ceil(sorted.length / pageSize);
  const pageData  = sorted.slice((page-1)*pageSize, page*pageSize);

  function onHeaderClick(key) {
    if (key === sortKey) setSortDir(d => d==="asc"? "desc":"asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const renderPill = imp => {
    if (imp===5) return <span className="inline-block uppercase text-xs font-semibold bg-red-200 text-red-700 px-3 py-1 rounded-full">Critical</span>;
    if (imp===4) return <span className="inline-block uppercase text-xs font-semibold bg-orange-100 text-orange-700 px-3 py-1 rounded-full">Major</span>;
    if (imp===3) return <span className="inline-block uppercase text-xs font-semibold bg-blue-100 text-blue-700 px-3 py-1 rounded-full">High</span>;
    return null;
  };

  const fmtDT = dt =>
    dt
      ? `${dt.toLocaleDateString("en-GB",{timeZone:"Asia/Dubai"})} ${dt.toLocaleTimeString("en-GB",{hour:'2-digit',minute:'2-digit',timeZone:"Asia/Dubai"})}`
      : "---";

  return (
    <div className="min-h-screen bg-gray-900 p-10">
      <div className="bg-white rounded-2xl shadow-lg p-8 overflow-hidden">
        {/* header + timings */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-semibold">EAi: Important Emails</h1>
          <div className="text-right text-sm text-gray-600 space-y-1">
            <div>Last update: {fmtDT(lastFetch)}</div>
            <div>Next update: {fmtDT(nextFetch)}</div>
          </div>
        </div>

        <ConfigPanel
          config={config}
          onSave={saveConfig}
          onFetch={fetchNow}
          loading={loading}
        />

        {/* search & page size */}
        <div className="flex items-center justify-between mb-6">
          <input
            type="text"
            placeholder="Search emails…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full max-w-xs border border-gray-300 rounded-lg px-4 py-2 text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <div className="flex items-center space-x-2">
            <span className="text-gray-600 text-sm">Show</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(+e.target.value); setPage(1); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {[50,100,200].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-gray-600 text-sm">entries</span>
          </div>
        </div>

        {/* table */}
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white rounded-lg overflow-hidden">
            <thead className="bg-gray-100">
              <tr>
                {COLUMNS.map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={()=>onHeaderClick(key)}
                    className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer"
                  >
                    <div className="inline-flex items-center">
                      {label}
                      {sortKey===key && <span className="ml-1 text-gray-500 text-xs">{sortDir==="asc"?"▲":"▼"}</span>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageData.map(e => (
                <tr key={e.message_id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-800">{(() => {
                    const d=new Date(e.received);
                    return `${d.toLocaleDateString("en-GB",{timeZone:"Asia/Dubai"})}, ${d.toLocaleTimeString("en-GB",{hour:'2-digit',minute:'2-digit',timeZone:"Asia/Dubai"})}`;
                  })()}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">{e.sender}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">{e.subject}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">{e.preview}</td>
                  <td className="px-4 py-2 text-center">{renderPill(e.importance)}</td>
                  <td className="px-4 py-2 text-center text-sm text-gray-800">{e.reason}</td>
                  <td className="px-4 py-2 text-center">
                    <Mail className="h-5 w-5 text-blue-600 hover:text-blue-800 cursor-pointer" onClick={()=>openInOutlook(e.message_id)} />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={()=>dismiss(e.message_id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Dismiss</button>
                  </td>
                </tr>
              ))}
              {!pageData.length && (
                <tr><td colSpan={COLUMNS.length} className="px-4 py-4 text-center text-gray-500">No records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* pagination */}
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Page <span className="font-medium">{page}</span> of <span className="font-medium">{pageCount}</span>
          </div>
          <div className="space-x-2">
            <button onClick={()=>setPage(1)} disabled={page===1} className="px-3 py-1 bg-white border border-gray-300 rounded-full disabled:opacity-50">«</button>
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="px-3 py-1 bg-white border border-gray-300 rounded-full disabled:opacity-50">‹</button>
            <button onClick={()=>setPage(p=>Math.min(pageCount,p+1))} disabled={page===pageCount} className="px-3 py-1 bg-white border border-gray-300 rounded-full disabled:opacity-50">›</button>
            <button onClick={()=>setPage(pageCount)} disabled={page===pageCount} className="px-3 py-1 bg-white border border-gray-300 rounded-full disabled:opacity-50">»</button>
          </div>
          <select value={pageSize} onChange={e=>{ setPageSize(+e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-1 text-sm">
            {[50,100,200].map(n=><option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
