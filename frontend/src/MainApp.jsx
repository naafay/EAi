// src/MainApp.jsx

import React, { useEffect, useState, useMemo, useRef, Fragment } from "react";
import axios from "axios";
import { supabase } from "./utils/supabaseClient";
import {
  Mail,
  Loader,
  MailCheck,
  CopyCheck,
  MailOpen,
  Tag,
  Settings,
  User,
  HelpCircle,
  LogOut,
  X
} from "lucide-react";

axios.defaults.baseURL = "http://localhost:8000";

// --- SettingsModal Overlay ---
function SettingsModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState({
    app_title: initial.app_title,
    full_name: initial.full_name,
    outlook_email: initial.outlook_email,
    aliases: (initial.aliases || []).join("\n"),
    vip_group_name: initial.vip_group_name,
    vip_emails: (initial.vip_emails || []).join("\n"),
    label_5: initial.label_5,
    label_4: initial.label_4,
    label_3: initial.label_3,
    label_2: initial.label_2 || "Medium",
    fetch_interval_minutes: initial.fetch_interval_minutes,
    lookback_hours: initial.lookback_hours,
    entries_per_page: initial.entries_per_page,
    default_sort: initial.default_sort
  });

  const updateField = (key, value) => {
    setForm(f => ({ ...f, [key]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="relative bg-white w-[90%] max-w-3xl h-[90%] rounded-lg shadow-lg overflow-auto p-6">
        {/* Close button in top-right */}
        <button
          onClick={onCancel}
          aria-label="Close settings"
          className="absolute top-4 right-4 p-1 hover:bg-gray-200 rounded-full"
        >
          <X className="h-5 w-5 text-gray-600" />
        </button>

        <h2 className="text-2xl font-semibold mb-4">Settings</h2>

        {/* App Branding */}
        <section className="space-y-4">
          <h3 className="font-medium">App Branding</h3>
          <label className="block text-sm">App Title</label>
          <input
            type="text"
            value={form.app_title}
            onChange={e => updateField("app_title", e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </section>

        {/* Your Identity */}
        <section className="space-y-4 mt-6">
          <h3 className="font-medium">Your Identity</h3>
          <label className="block text-sm">Outlook Alias</label>
          <input
            type="text"
            value={form.full_name}
            onChange={e => updateField("full_name", e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <label className="block text-sm">Outlook Email Address</label>
          <input
            type="email"
            value={form.outlook_email}
            onChange={e => updateField("outlook_email", e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <label className="block text-sm">Additional Aliases (one per line)</label>
          <textarea
            rows={3}
            value={form.aliases}
            onChange={e => updateField("aliases", e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </section>

        {/* VIP Group */}
        <section className="space-y-4 mt-6">
          <h3 className="font-medium">VIP Group</h3>
          <label className="block text-sm">Group Name</label>
          <input
            type="text"
            value={form.vip_group_name}
            onChange={e => updateField("vip_group_name", e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <label className="block text-sm">VIP Email Addresses (one per line)</label>
          <textarea
            rows={4}
            value={form.vip_emails}
            onChange={e => updateField("vip_emails", e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </section>

        {/* Importance Labels */}
        <section className="space-y-4 mt-6">
          <h3 className="font-medium">Importance Labels</h3>
          {[5, 4, 3, 2].map(tier => (
            <div key={tier}>
              <label className="block text-sm">
                Tier {tier} {tier === 5 && "(highest)"}
              </label>
              <input
                type="text"
                value={form[`label_${tier}`]}
                onChange={e => updateField(`label_${tier}`, e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          ))}
        </section>

        {/* Fetch & Display Preferences */}
        <section className="space-y-4 mt-6">
          <h3 className="font-medium">Fetch & Display Preferences</h3>
          <div>
            <label className="block text-sm">Fetch interval (minutes)</label>
            <input
              type="number"
              value={form.fetch_interval_minutes}
              onChange={e => updateField("fetch_interval_minutes", +e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm">Look-back window (hours)</label>
            <input
              type="number"
              value={form.lookback_hours}
              onChange={e => updateField("lookback_hours", +e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm">Entries per page</label>
            <input
              type="number"
              value={form.entries_per_page}
              onChange={e => updateField("entries_per_page", +e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm">Default sort by</label>
            <select
              value={form.default_sort}
              onChange={e => updateField("default_sort", e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option>Importance</option>
              <option>Date</option>
            </select>
          </div>
        </section>

        {/* Action Buttons */}
        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onSave({
                app_title: form.app_title,
                full_name: form.full_name,
                outlook_email: form.outlook_email,
                aliases: form.aliases
                  .split("\n")
                  .map(l => l.trim())
                  .filter(Boolean),
                vip_group_name: form.vip_group_name,
                vip_emails: form.vip_emails
                  .split("\n")
                  .map(l => l.trim())
                  .filter(Boolean),
                label_5: form.label_5,
                label_4: form.label_4,
                label_3: form.label_3,
                label_2: form.label_2,
                fetch_interval_minutes: form.fetch_interval_minutes,
                lookback_hours: form.lookback_hours,
                entries_per_page: form.entries_per_page,
                default_sort: form.default_sort
              });
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// --- ConfigPanel component (unchanged) ---
const LOOKBACK_OPTIONS = [
  { label: "1 hr", value: 1 },
  { label: "3 hr", value: 3 },
  { label: "6 hr", value: 6 },
  { label: "12 hr", value: 12 },
  { label: "24 hr", value: 24 },
  { label: "72 hr", value: 72 },
  { label: "7 d", value: 168 },
  { label: "30 d", value: 720 },
  { label: "Custom", value: "custom" }
];

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
      onSave({ fetch_interval_minutes: interval, lookback_hours: lookback, start: customStart, end: customEnd });
    } else {
      onSave({ fetch_interval_minutes: interval, lookback_hours: lookback, start: null, end: null });
    }
  };

  return (
    <div>
      {error && <div className="text-red-500 mb-2">{error}</div>}
      <div className="flex flex-wrap items-center space-x-4 mb-4">
        <div className="flex items-center bg-gray-50 border rounded-lg px-3 py-2 space-x-2">
          <span className="text-gray-600 text-sm">Fetch every</span>
          <select
            value={interval}
            onChange={e => setIntervalValue(+e.target.value)}
            disabled={loading}
            className="border rounded-md px-2 py-1 text-sm"
          >
            {[1,5,15,30,60,180,360,720,1440].map(m => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m/60} hr`}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center bg-gray-50 border rounded-lg px-3 py-2 space-x-2">
          <span className="text-gray-600 text-sm">Look back</span>
          <select
            value={mode === "preset" ? lookback : "custom"}
            onChange={e => {
              const v = e.target.value;
              if (v === "custom") setMode("custom");
              else { setMode("preset"); setLookback(+v); }
            }}
            disabled={loading}
            className="border rounded-md px-2 py-1 text-sm"
          >
            {LOOKBACK_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        {mode === "custom" && (
          <div className="flex items-center space-x-2">
            <input
              type="datetime-local"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              max={nowLocal}
              className="border rounded-md px-2 py-1 text-sm"
            />
            <span className="text-gray-600">to</span>
            <input
              type="datetime-local"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
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
          {loading ? <Loader className="h-4 w-4 animate-spin" /> : "Save Config"}
        </button>
        <button
          onClick={() => mode === "custom" ? onFetch(customStart, customEnd) : onFetch()}
          disabled={loading}
          className="flex items-center bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow disabled:opacity-50"
        >
          {loading ? <Loader className="h-4 w-4 animate-spin" /> : "Fetch Now"}
        </button>
      </div>
    </div>
  );
}

// --- MainApp Component ---
export default function MainApp({ userSettings }) {
  const [settings, setSettingsState] = useState(userSettings);
  useEffect(() => {
    setSettingsState(userSettings);
  }, [userSettings]);

  const {
    user_id,
    app_title,
    full_name,
    outlook_email,
    aliases,
    vip_group_name,
    vip_emails,
    label_5,
    label_4,
    label_3,
    label_2,
    fetch_interval_minutes,
    lookback_hours,
    entries_per_page,
    default_sort
  } = settings;

  const DEFAULT_SORT_KEY = default_sort.toLowerCase();

  // sync user-config (send raw Supabase arrays)
  const [userSynced, setUserSynced] = useState(false);
  useEffect(() => {
    (async () => {
      if (!outlook_email) {
        setUserSynced(true);
        return;
      }
      try {
        await axios.post("/user-config", {
          outlook_email,
          full_name,
          aliases,
          vip_group_name,
          vip_emails
        });
      } catch (e) {
        console.error("Error syncing user-config:", e);
      } finally {
        setUserSynced(true);
      }
    })();
  }, [outlook_email, full_name, aliases, vip_group_name, vip_emails]);

  const [emails, setEmails] = useState([]);
  const [config, setConfig] = useState({
    fetch_interval_minutes,
    lookback_hours,
    start: null,
    end: null
  });
  const [configLoaded, setConfigLoaded] = useState(false);

  const [sortKey, setSortKey] = useState(DEFAULT_SORT_KEY);
  const [sortDir, setSortDir] = useState("desc");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(entries_per_page);
  const [page, setPage] = useState(1);
  const [lastFetch, setLastFetch] = useState(null);
  const [nextFetch, setNextFetch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [showSettings, setShowSettings] = useState(false);

  const [cloudOk, setCloudOk] = useState(navigator.onLine);
  const [outlookOk, setOutlookOk] = useState(true);
  const [localOk, setLocalOk] = useState(true);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  const intervalRef = useRef(null);
  const modalTimerRef = useRef(null);

  function parseLocal(iso) {
    const [date, time] = iso.split("T");
    const [Y, M, D] = date.split("-").map(Number);
    const [h, m, s] = time.split(/[:.]/).map(Number);
    return new Date(Y, M - 1, D, h, m, s);
  }
  function insertZWS(str, maxLen = 30) {
    return str
      .split(" ")
      .map(word => {
        if (word.length <= maxLen) return word;
        return word.replace(new RegExp(`(.{${maxLen}})(?=.)`, "g"), "$1\u200B");
      })
      .join(" ");
  }

  const IMPORTANCE_LABELS = { 5: label_5, 4: label_4, 3: label_3, 2: label_2 };
  const COLUMNS = [
    { key: "received", label: "Datetime" },
    { key: "sender", label: "From" },
    { key: "subject", label: "Subject" },
    { key: "preview", label: "Body preview" },
    { key: "importance", label: "Priority" },
    { key: "reason", label: "Reason" },
    { key: "open", label: "" },
    { key: "dismiss", label: "" },
    { key: "dismiss_conversation", label: "" }
  ];

  const fmtDT = dt =>
    dt
      ? `${dt.toLocaleDateString("en-GB",{timeZone:"Asia/Dubai"})} ${dt.toLocaleTimeString("en-GB",{hour:'2-digit',minute:'2-digit',timeZone:"Asia/Dubai"})}`
      : "---";
  const fmtEmailDT = iso => {
    const d = parseLocal(iso);
    return `${d.toLocaleDateString("en-GB",{timeZone:"Asia/Dubai"})} ${d.toLocaleTimeString("en-GB",{hour:'2-digit',minute:'2-digit',timeZone:"Asia/Dubai"})}`;
  };

  // load timing config
  useEffect(() => {
    setLoading(true);
    axios.get("/config")
      .then(r => {
        setConfig(r.data);
        if (!modalTimerRef.current && (r.data.start !== null || r.data.lookback_hours > 3)) {
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

  // fetch loop
  useEffect(() => {
    if (!configLoaded || showModal || !userSynced) return;
    if (intervalRef.current) clearInterval(intervalRef.current);

    async function fetchLoop() {
      setLoading(true);
      const now = new Date();
      setLastFetch(now);
      setNextFetch(new Date(now.getTime() + config.fetch_interval_minutes * 60000));
      try {
        const params = config.start && config.end
          ? { start: config.start, end: config.end }
          : undefined;
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
    intervalRef.current = setInterval(fetchLoop, config.fetch_interval_minutes * 60000);
    return () => clearInterval(intervalRef.current);
  }, [configLoaded, showModal, userSynced, config]);

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
    axios.get("/emails", {
      params: startIso && endIso ? { start: startIso, end: endIso } : undefined
    })
      .then(r => { setEmails(r.data); setPage(1); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  function handleResetDefault() {
    setShowModal(false);
    clearTimeout(modalTimerRef.current);
    saveConfig({ fetch_interval_minutes: config.fetch_interval_minutes, lookback_hours: 3, start: null, end: null });
  }
  function handleContinue() {
    setShowModal(false);
    clearTimeout(modalTimerRef.current);
  }

  function dismiss(id) {
    axios.post(`/emails/${id}/dismiss`);
    setEmails(e => e.filter(m => m.message_id !== id));
  }
  function dismissConversation(id, convId) {
    axios.post(`/emails/${id}/dismiss-conversation`)
      .then(() => setEmails(e => e.filter(m => m.conversation_id !== convId)))
      .catch(console.error);
  }
  async function openInOutlook(id) {
    try { await axios.post(`/open/${encodeURIComponent(id)}`); }
    catch { alert("Could not open Outlook."); }
  }

  const filtered = useMemo(
    () =>
      emails.filter(e =>
        [e.sender, e.subject, e.preview].some(f =>
          f.toLowerCase().includes(search.toLowerCase())
        )
      ),
    [emails, search]
  );

  const sorted = useMemo(() => {
    return filtered.slice().sort((a, b) => {
      if (b.importance !== a.importance) {
        return sortDir === "asc"
          ? a.importance - b.importance
          : b.importance - a.importance;
      }
      const da = Date.parse(a.received), db = Date.parse(b.received);
      return sortDir === "asc" ? da - db : db - da;
    });
  }, [filtered, sortKey, sortDir]);

  const groupedData = useMemo(() => {
    if (sortKey === "importance") {
      const buckets = { 5: [], 4: [], 3: [], 2: [] };
      sorted.forEach(e => { if (buckets[e.importance]) buckets[e.importance].push(e); });
      return buckets;
    }
    if (sortKey === "received") {
      const now = new Date();
      const buckets = { Today: [], "This week": [], Older: [] };
      sorted.forEach(e => {
        const d = parseLocal(e.received), diff = now - d;
        if (d.toDateString() === now.toDateString()) buckets.Today.push(e);
        else if (diff < 1000 * 60 * 60 * 24 * 7) buckets["This week"].push(e);
        else buckets.Older.push(e);
      });
      return buckets;
    }
    return { All: sorted };
  }, [sorted, sortKey]);

  const groupKeys = useMemo(() => {
    if (sortKey === "importance") return [5,4,3,2].filter(k => groupedData[k].length);
    if (sortKey === "received") return ["Today","This week","Older"].filter(k => groupedData[k].length);
    return ["All"];
  }, [groupedData, sortKey]);

  const toggleGroup = key => setCollapsed(c => ({ ...c, [key]: !c[key] }));
  const pageCount = Math.ceil(sorted.length / pageSize);

  function onHeaderClick(key) {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const renderPill = imp => {
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
              : ""
        }}
      >
        {label}
      </span>
    );
  };

  // health polling
  const checkHealth = () => {
    setCloudOk(navigator.onLine);
    axios.get("/health/outlook").then(() => setOutlookOk(true)).catch(() => setOutlookOk(false));
    axios.get("/health/local").then(() => setLocalOk(true)).catch(() => setLocalOk(false));
  };
  useEffect(() => {
    checkHealth();
    window.addEventListener("online",  () => setCloudOk(true));
    window.addEventListener("offline", () => setCloudOk(false));
    const hInt = setInterval(checkHealth, 60000);
    return () => {
      window.removeEventListener("online",  () => setCloudOk(true));
      window.removeEventListener("offline", () => setCloudOk(false));
      clearInterval(hInt);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Top Ribbon Header */}
      <div className="flex items-center justify-between bg-transparent border-b p-3 shadow-sm">
        <div className="flex items-center">
          <img src="./logo192.png" alt="Logo" className="h-8 w-8 mr-2" />
          <span className="text-lg font-semibold">{app_title}</span>
        </div>
        <div className="flex items-center space-x-7 text-gray-200">
          {/* STATUS CIRCLE */}
          <div className="relative">
            <div
              className={`h-3 w-3 rounded-full cursor-pointer ${
                cloudOk && outlookOk && localOk
                  ? "bg-green-500"
                  : "bg-amber-400"
              }`}
              onMouseEnter={() => setShowStatusDropdown(true)}
              onMouseLeave={() => setShowStatusDropdown(false)}
            />
            {showStatusDropdown && (
              <div className="absolute top-6 left-0 p-2 w-44 bg-white text-black rounded shadow-lg ">
                <div className="flex items-center mb-2 text-sm text-gray-600">
                  <span
                    className={`h-2 w-2 rounded-full mr-2 ${
                      cloudOk ? "bg-green-500" : "bg-amber-400"
                    }`}
                  />
                  Outprio Cloud
                </div>
                <div className="flex items-center mb-2 text-sm text-gray-600">
                  <span
                    className={`h-2 w-2 rounded-full mr-2 ${
                      outlookOk ? "bg-green-500" : "bg-amber-400"
                    }`}
                  />
                  Outlook
                </div>
                <div className="flex items-center mb-2 text-sm text-gray-600">
                  <span
                    className={`h-2 w-2 rounded-full mr-2 ${
                      localOk ? "bg-green-500" : "bg-amber-400"
                    }`}
                  />
                  Local services
                </div>
              </div>
            )}
          </div>

          <button onClick={() => setShowSettings(true)} title="Settings">
            <Settings className="h-5 w-5" />
          </button>
          <button onClick={() => window.open("/profile", "_blank")} title="Account">
            <User className="h-5 w-5" />
          </button>
          <button onClick={() => window.open("/help", "_blank")} title="Help">
            <HelpCircle className="h-5 w-5" />
          </button>
          <button
            onClick={async () => {
              const { error } = await supabase.auth.signOut();
              if (error) console.error(error);
            }}
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="p-10">
        <div className="bg-white rounded-2xl shadow-lg p-8 overflow-hidden">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-semibold">{app_title}</h1>
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
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full max-w-xs border rounded-lg px-4 py-2 text-sm shadow-inner focus:ring-2 focus:ring-blue-200"
            />
            <div className="flex items-center space-x-2">
              <span className="text-gray-600 text-sm">Show</span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(+e.target.value); setPage(1); }}
                className="border rounded-lg px-3 py-2 text-sm"
              >
                {[50, 100, 200].map(n => (
                  <option key={n} value={n}>{n}</option>
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
                      className={`px-4 py-2 text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer ${
                        (key==="importance"||key==="reason") ? "text-center" : "text-left"
                      }`}
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
                {groupKeys.map(groupKey => (
                  <Fragment key={groupKey}>
                    <tr
                      className="bg-gray-100 cursor-pointer"
                      onClick={() => toggleGroup(groupKey)}
                    >
                      <td colSpan={COLUMNS.length} className="px-4 py-2">
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
                    {!collapsed[groupKey] &&
                      groupedData[groupKey].map(e => (
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
                            {e.reason.split("+").map((r, i) => {
                              const seg = r.trim();
                              const disp = seg.replace(
                                new RegExp(vip_group_name, "gi"),
                                vip_group_name
                              );
                              return (
                                <div
                                  key={i}
                                  className="flex items-center mb-1 whitespace-nowrap justify-center"
                                >
                                  <Tag className="h-3 w-3 text-gray-500 mr-1" />
                                  <span className="bg-red-100 text-gray-800 text-xs font-medium px-2 py-1 rounded">
                                    {disp}
                                  </span>
                                </div>
                              );
                            })}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <MailOpen
                              strokeWidth={1.5}
                              className="h-5 w-5 text-blue-600 hover:text-blue-800 cursor-pointer"
                              onClick={() => openInOutlook(e.message_id)}
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
                                dismissConversation(e.message_id, e.conversation_id)
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
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-white border rounded-full disabled:opacity-50"
              >
                ‹
              </button>
              <button
                onClick={() => setPage(p => Math.min(pageCount, p + 1))}
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
              onChange={e => { setPageSize(+e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-1 text-sm"
            >
              {[50, 100, 200].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Pre-config / Custom Modal */}
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

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          initial={{ ...settings, aliases }}
          onCancel={() => setShowSettings(false)}
          onSave={async newSettings => {
            const payload = { user_id, ...newSettings };
            const { error: upsertError, data: upserted } = await supabase
              .from("user_settings")
              .upsert(payload)
              .select()
              .single();
            if (upsertError) {
              console.error("Supabase upsert error:", upsertError);
              return;
            }
            // re-sync identity & VIP with raw arrays
            try {
              await axios.post("/user-config", {
                outlook_email: newSettings.outlook_email,
                full_name: newSettings.full_name,
                aliases: newSettings.aliases,
                vip_group_name: newSettings.vip_group_name,
                vip_emails: newSettings.vip_emails
              });
            } catch (e) {
              console.error("Error syncing user-config:", e);
            }
            // re-sync timing config
            try {
              const { data: cfgData } = await axios.post("/config", {
                fetch_interval_minutes: newSettings.fetch_interval_minutes,
                lookback_hours: newSettings.lookback_hours,
                start: null,
                end: null
              });
              setConfig(cfgData);
            } catch (e) {
              console.error("Error updating timing config:", e);
            }
            setSettingsState(upserted);
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}
