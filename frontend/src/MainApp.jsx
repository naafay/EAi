// src/App.jsx
import { useEffect, useState, useMemo, useRef, Fragment } from "react";
import axios from "axios";
import {
  Mail,
  Loader,
  MailSearch,
  MailCheck,
  Mails,
  ExternalLink,
  CopyCheck,
  MailOpen,
  Tag,
  Settings,
  User,
  HelpCircle,
  LogOut
} from "lucide-react";

// point axios at your backend once
axios.defaults.baseURL = "http://localhost:8000";

// URL of your Netlify-hosted web front
const WEB_URL = "https://outprio.netlify.app";

// Electron shell helper for opening links in default browser
let shell;
try {
  shell = window.require("electron").shell;
} catch {
  shell = null;
}

// helper to open external links
function openExternal(url) {
  if (shell) shell.openExternal(url);
  else window.open(url, "_blank");
}

// logout/exit helper
function handleLogout() {
  window.close();
}

// helper to treat naive ISO (YYYY-MM-DDTHH:mm:ss) as local time
function parseLocal(iso) {
  const [date, time] = iso.split("T");
  const [Y, M, D] = date.split("-").map(Number);
  const [h, m, s] = time.split(/[:.]/).map(Number);
  return new Date(Y, M - 1, D, h, m, s);
}

function insertZWS(str, maxLen = 30) {
  return str
    .split(" ")
    .map((word) => {
      if (word.length <= maxLen) return word;
      return word.replace(
        new RegExp(`(.{${maxLen}})(?=.)`, "g"),
        "$1\u200B"
      );
    })
    .join(" ");
}

const LOOKBACK_OPTIONS = [
  { label: "1 hr", value: 1 },
  { label: "3 hr", value: 3 },
  { label: "6 hr", value: 6 },
  { label: "12 hr", value: 12 },
  { label: "24 hr", value: 24 },
  { label: "72 hr", value: 72 },
  { label: "7 d", value: 168 },
  { label: "30 d", value: 720 },
  { label: "Custom", value: "custom" },
];

const COLUMNS = [
  { key: "received", label: "Datetime" },
  { key: "sender", label: "From" },
  { key: "subject", label: "Subject" },
  { key: "preview", label: "Body preview" },
  { key: "importance", label: "Priority" },
  { key: "reason", label: "Reason" },
  { key: "open", label: "" },
  { key: "dismiss", label: "" },
  { key: "dismiss_conversation", label: "" },
];

const IMPORTANCE_LABELS = {
  5: "Critical",
  4: "Major",
  3: "High",
  2: "Medium",
};

function ConfigPanel({ config, onSave, onFetch, loading }) {
  const [interval, setIntervalValue] = useState(config.fetch_interval_minutes);
  const [lookback, setLookback] = useState(config.lookback_hours);
  const [mode, setMode] = useState(config.start ? "custom" : "preset");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setIntervalValue(config.fetch_interval_minutes);
    setLookback(config.lookback_hours);
    if (config.start && config.end) {
      setMode("custom");
      setCustomStart(config.start.slice(0, 16));
      setCustomEnd(config.end.slice(0, 16));
    } else {
      setMode("preset");
      setCustomStart("");
      setCustomEnd("");
    }
    setError("");
  }, [config]);

  const nowLocal = new Date().toISOString().slice(0, 16);

  const handleSave = () => {
    setError("");
    if (mode === "custom") {
      if (!customStart || !customEnd) {
        setError("Both start and end are required for custom range.");
        return;
      }
      const s = new Date(customStart),
        e = new Date(customEnd);
      if (e <= s) {
        setError("End must be after start.");
        return;
      }
      if ((e - s) / (1000 * 60 * 60 * 24) > 31) {
        setError("Range cannot exceed 31 days.");
        return;
      }
      onSave({
        fetch_interval_minutes: interval,
        lookback_hours: lookback,
        start: customStart,
        end: customEnd,
      });
    } else {
      onSave({
        fetch_interval_minutes: interval,
        lookback_hours: lookback,
        start: null,
        end: null,
      });
    }
  };

  return (
    <div>
      {error && <div className="text-red-500 mb-2">{error}</div>}
      <div className="flex flex-wrap items-center space-x-4 mb-4">
        {/* Fetch every */}
        <div className="flex items-center bg-gray-50 border rounded-lg px-3 py-2 space-x-2">
          <span className="text-gray-600 text-sm">Fetch every</span>
          <select
            value={interval}
            onChange={(e) => setIntervalValue(+e.target.value)}
            disabled={loading}
            className="border rounded-md px-2 py-1 text-sm"
          >
            {[1, 5, 15, 30, 60, 180, 360, 720, 1440].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} hr`}
              </option>
            ))}
          </select>
        </div>

        {/* Look back */}
        <div className="flex items-center bg-gray-50 border rounded-lg px-3 py-2 space-x-2">
          <span className="text-gray-600 text-sm">Look back</span>
          <select
            value={mode === "preset" ? lookback : "custom"}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "custom") setMode("custom");
              else {
                setMode("preset");
                setLookback(+v);
              }
            }}
            disabled={loading}
            className="border rounded-md px-2 py-1 text-sm"
          >
            {LOOKBACK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Custom inputs */}
        {mode === "custom" && (
          <div className="flex items-center space-x-2">
            <input
              type="datetime-local"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              max={nowLocal}
              className="border rounded-md px-2 py-1 text-sm"
            />
            <span className="text-gray-600">to</span>
            <input
              type="datetime-local"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              min={customStart || undefined}
              max={nowLocal}
              className="border rounded-md px-2 py-1 text-sm"
            />
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow disabled:opacity-50"
        >
          {loading ? (
            <Loader className="h-4 w-4 animate-spin" />
          ) : (
            "Save Config"
          )}
        </button>
        <button
          onClick={() =>
            mode === "custom"
              ? onFetch(customStart, customEnd)
              : onFetch()
          }
          disabled={loading}
          className="flex items-center bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow disabled:opacity-50"
        >
          {loading ? (
            <Loader className="h-4 w-4 animate-spin" />
          ) : (
            "Fetch Now"
          )}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [emails, setEmails] = useState([]);
  const [config, setConfig] = useState({
    fetch_interval_minutes: 5,
    lookback_hours: 3,
    start: null,
    end: null,
  });
  const [configLoaded, setConfigLoaded] = useState(false);
  const [sortKey, setSortKey] = useState("importance");
  const [sortDir, setSortDir] = useState("desc");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [lastFetch, setLastFetch] = useState(null);
  const [nextFetch, setNextFetch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [collapsed, setCollapsed] = useState({});

  const intervalRef = useRef(null);
  const modalTimerRef = useRef(null);

  // 1) on mount, load config
  useEffect(() => {
    setLoading(true);
    axios
      .get("/config")
      .then((r) => {
        setConfig(r.data);
        if (
          !modalTimerRef.current &&
          (r.data.start !== null || r.data.lookback_hours > 3)
        ) {
          setShowModal(true);
          modalTimerRef.current = setTimeout(handleResetDefault, 60000);
        }
      })
      .catch(console.error)
      .finally(() => {
        setLoading(false);
        setConfigLoaded(true);
      });
  }, []);

  // 2) polling + immediate fetch when configLoaded && modal closed && config changes
  useEffect(() => {
    if (!configLoaded || showModal) return;
    if (intervalRef.current) clearInterval(intervalRef.current);

    async function fetchLoop() {
      setLoading(true);
      const now = new Date();
      setLastFetch(now);
      setNextFetch(
        new Date(now.getTime() + config.fetch_interval_minutes * 60000)
      );
      try {
        const params = {};
        if (config.start && config.end) {
          params.start = config.start;
          params.end = config.end;
        }
        const { data } = await axios.get("/emails", { params });
        setEmails(data);
        setPage(1);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }

    fetchLoop();
    intervalRef.current = setInterval(
      fetchLoop,
      config.fetch_interval_minutes * 60000
    );
    return () => clearInterval(intervalRef.current);
  }, [configLoaded, showModal, config]);

  const fmtDT = (dt) =>
    dt
      ? `${dt.toLocaleDateString("en-GB", {
          timeZone: "Asia/Dubai",
        })} ${dt.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Dubai",
        })}`
      : "---";

  const fmtEmailDT = (iso) => {
    const d = parseLocal(iso);
    return `${d.toLocaleDateString("en-GB", {
      timeZone: "Asia/Dubai",
    })} ${d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Dubai",
    })}`;
  };

  async function saveConfig(newCfg) {
    setLoading(true);
    try {
      const { data } = await axios.post("/config", newCfg);
      setConfig(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function fetchNow(startIso, endIso) {
    setLoading(true);
    axios
      .get("/emails", {
        params:
          startIso && endIso
            ? { start: startIso, end: endIso }
            : undefined,
      })
      .then((r) => {
        setEmails(r.data);
        setPage(1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  function handleResetDefault() {
    setShowModal(false);
    clearTimeout(modalTimerRef.current);
    saveConfig({
      fetch_interval_minutes: config.fetch_interval_minutes,
      lookback_hours: 3,
      start: null,
      end: null,
    });
  }

  function handleContinue() {
    setShowModal(false);
    clearTimeout(modalTimerRef.current);
  }

  function dismiss(id) {
    axios.post(`/emails/${id}/dismiss`);
    setEmails((e) => e.filter((m) => m.message_id !== id));
  }

  function dismissConversation(id, convId) {
    axios
      .post(`/emails/${id}/dismiss-conversation`)
      .then(() => {
        setEmails((e) =>
          e.filter((m) => m.conversation_id !== convId)
        );
      })
      .catch(console.error);
  }

  async function openInOutlook(id) {
    try {
      await axios.post(
        `/open/${encodeURIComponent(id)}`
      );
    } catch {
      alert("Could not open Outlook.");
    }
  }

  const filtered = useMemo(
    () =>
      emails.filter((e) =>
        [e.sender, e.subject, e.preview].some((f) =>
          f.toLowerCase().includes(search.toLowerCase())
        )
      ),
    [emails, search]
  );

  const sorted = useMemo(() => {
    const arr = filtered.slice().sort((a, b) => {
      if (b.importance !== a.importance) {
        return sortDir === "asc"
          ? a.importance - b.importance
          : b.importance - a.importance;
      }
      const da = Date.parse(a.received),
        db = Date.parse(b.received);
      return sortDir === "asc" ? da - db : db - da;  
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const groupedData = useMemo(() => {
    if (sortKey === "importance") {
      const buckets = { 5: [], 4: [], 3: [], 2: [] };
      sorted.forEach((e) => {
        if (buckets[e.importance]) buckets[e.importance].push(e);
      });
      return buckets;
    }
    if (sortKey === "received") {
      const now = new Date();
      const buckets = { Today: [], "This week": [], Older: [] };
      sorted.forEach((e) => {
        const d = parseLocal(e.received),
          diff = now - d;
        if (d.toDateString() === now.toDateString())
          buckets.Today.push(e);
        else if (diff < 1000 * 60 * 60 * 24 * 7)
          buckets["This week"].push(e);
        else buckets.Older.push(e);
      });
      return buckets;
    }
    return { All: sorted };
  }, [sorted, sortKey]);

  const groupKeys = useMemo(() => {
    if (sortKey === "importance") {
      return [5, 4, 3, 2].filter((k) => groupedData[k].length);
    }
    if (sortKey === "received") {
      return ["Today", "This week", "Older"].filter(
        (k) => groupedData[k].length
      );
    }
    return ["All"];
  }, [groupedData, sortKey]);

  const toggleGroup = (key) =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  const pageCount = Math.ceil(sorted.length / pageSize);

  function onHeaderClick(key) {
    if (sortKey === key)
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const renderPill = (imp) => {
    const label = IMPORTANCE_LABELS[imp] || "";
    return (
      <span
        className="inline-block uppercase text-xs font-semibold px-3 py-1 rounded-full"
        style={{
          backgroundColor:
            imp === 5
              ? "#fed7d7"
              : imp === 4
              ? "#fef3c7"
              : imp === 3
              ? "#dbecff"
              : imp === 2
              ? "#dcfce7"
              : "",
          color:
            imp === 5
              ? "#c53030"
              : imp === 4
              ? "#b45309"
              : imp === 3
              ? "#2c5282"
              : imp === 2
              ? "#047857"
              : "",
        }}
      >
        {label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Top Ribbon Header */}
      <div className="flex items-center justify-between bg-transparent border-b p-3 shadow-sm">
        <img
          src={`${WEB_URL}/logo192.png`}
          alt="OutPrio Logo"
          className="h-8 w-8"
        />
        <div className="flex items-center space-x-5 text-gray-300">
          <button
            onClick={() => openExternal(`${WEB_URL}/settings`)}
            title="Settings"
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            onClick={() => openExternal(`${WEB_URL}/profile`)}
            title="Account"
          >
            <User className="h-5 w-5" />
          </button>
          <button
            onClick={() => openExternal(`${WEB_URL}/help`)}
            title="Help"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
          <button onClick={handleLogout} title="Logout">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="p-10">
        <div className="bg-white rounded-2xl shadow-lg p-8 overflow-hidden">
          {/* Original Header */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-semibold">EAi: Important Emails</h1>
            <div className="text-right text-sm text-gray-600 space-y-1">
              <div>Last update: {fmtDT(lastFetch)}</div>
              <div>Next update: {fmtDT(nextFetch)}</div>
            </div>
          </div>

          {/* Config Panel */}
          <ConfigPanel
            config={config}
            onSave={saveConfig}
            onFetch={fetchNow}
            loading={loading}
          />

          {/* Search & Page Size */}
          <div className="flex items-center justify-between mb-6">
            <input
              type="text"
              placeholder="Search emails…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full max-w-xs border rounded-lg px-4 py-2 text-sm shadow-inner focus:ring-2 focus:ring-blue-200"
            />
            <div className="flex items-center space-x-2">
              <span className="text-gray-600 text-sm">Show</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(+e.target.value);
                  setPage(1);
                }}
                className="border rounded-lg px-3 py-2 text-sm"
              >
                {[50, 100, 200].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-gray-600 text-sm">entries</span>
            </div>
          </div>

          {/* Email Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white rounded-lg overflow-hidden">
              <thead className="bg-gray-200">
                <tr>
                  {COLUMNS.map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => onHeaderClick(key)}
                      className={`
                        px-4 py-2 text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer
                        ${
                          key === "importance" || key === "reason"
                            ? "text-center"
                            : "text-left"
                        }
                      `}
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
                {groupKeys.map((groupKey) => (
                  <Fragment key={groupKey}>
                    {/* Group header */}
                    <tr
                      className="bg-gray-100 cursor-pointer"
                      onClick={() => toggleGroup(groupKey)}
                    >
                      <td
                        colSpan={COLUMNS.length}
                        className="px-4 py-2"
                      >
                        <span className="font-medium mr-2">
                          {collapsed[groupKey] ? "+" : "–"}
                        </span>
                        <span className="text-xs font-semibold text-gray-700 uppercase">
                          {sortKey === "importance"
                            ? IMPORTANCE_LABELS[groupKey]
                            : groupKey}
                        </span>
                        <span className="ml-1 text-gray-600">
                          ({groupedData[groupKey].length})
                        </span>
                      </td>
                    </tr>

                    {/* Group rows */}
                    {!collapsed[groupKey] &&
                      groupedData[groupKey].map((e) => (
                        <tr
                          key={e.message_id}
                          className="border-b last:border-0 hover:bg-gray-50"
                        >
                          <td className="px-4 py-2 text-sm text-gray-800">
                            {fmtEmailDT(e.received)}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-800">
                            {e.sender}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-800">
                            {e.subject}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-800 break-words whitespace-normal">
                            {insertZWS(e.preview)}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {renderPill(e.importance)}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {e.reason
                              .split("+")
                              .map((r) => r.trim())
                              .map((r, i) => (
                                <div
                                  key={i}
                                  className="flex items-center mb-1 whitespace-nowrap justify-center"
                                >
                                  <Tag className="h-3 w-3 text-gray-500 mr-1" />
                                  <span className="bg-red-100 text-gray-800 text-xs font-medium px-2 py-1 rounded">
                                    {r}
                                  </span>
                                </div>
                              ))}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <MailOpen
                              strokeWidth={1.5}
                              className="h-5 w-5 text-blue-600 hover:text-blue-800 cursor-pointer"
                              onClick={() =>
                                openInOutlook(e.message_id)
                              }
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <MailCheck
                              strokeWidth={1.5}
                              className="h-5 w-5 text-red-600 hover:text-red-800 cursor-pointer"
                              onClick={() => dismiss(e.message_id)}
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <CopyCheck
                              strokeWidth={1.5}
                              className="h-5 w-5 text-red-600 hover:text-red-800 cursor-pointer"
                              onClick={() =>
                                dismissConversation(
                                  e.message_id,
                                  e.conversation_id
                                )
                              }
                            />
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Page <span className="font-medium">{page}</span> of{" "}
              <span className="font-medium">{pageCount}</span>
            </div>
            <div className="space-x-2">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="px-3 py-1 bg-white border rounded-full disabled:opacity-50"
              >
                «
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-white border rounded-full disabled:opacity-50"
              >
                ‹
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page === pageCount}
                className="px-3 py-1 bg-white border rounded-full disabled:opacity-50"
              >
                ›
              </button>
              <button
                onClick={() => setPage(pageCount)}
                disabled={page === pageCount}
                className="px-3 py-1 bg-white border rounded-full disabled:opacity-50"
              >
                »
              </button>
            </div>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(+e.target.value);
                setPage(1);
              }}
              className="border rounded-lg px-3 py-1 text-sm"
            >
              {[50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Pre-configured / custom-range modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              {config.start
                ? "Custom range detected"
                : "Pre-configured range"}
            </h2>
            <p className="mb-6">
              {config.start
                ? "A custom date-time range is currently set. Would you like to continue with it or reset to defaults?"
                : "A pre-configured look-back window over 3 hours was detected. Would you like to reset to the default 3 hours?"}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleContinue}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
              >
                Continue
              </button>
              <button
                onClick={handleResetDefault}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Reset to default
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
