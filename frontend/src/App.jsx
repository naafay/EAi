// src/App.jsx
import React, { useEffect, useState } from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { supabase } from "./utils/supabaseClient";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./screens/Login";
import LicenseGate from "./screens/LicenseGate";
import MainApp from "./MainApp";
import SetupWizard from "./SetupWizard";

function AppRoutes() {
  const { session, licenseStatus, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // 1) Fetch existing user_settings row (if any)
  useEffect(() => {
    if (!session) {
      setSettings(null);
      setLoadingSettings(false);
      return;
    }
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle()                     // avoid 406, returns `{ data, error }`
      .then(({ data, error }) => {
        if (error) console.error("Error loading settings:", error);
        setSettings(data);
      })
      .finally(() => setLoadingSettings(false));
  }, [session]);

  // 2) Called when SetupWizard finishes
  const onWizardComplete = async (cfg) => {
    // cfg already has snake_case keys matching your table:
    // { app_title, full_name, outlook_email, vip_group_name, vip_emails,
    //   label_5, label_4, label_3, label_2, fetch_interval_minutes,
    //   lookback_hours, entries_per_page, default_sort }
    const payload = { user_id: session.user.id, ...cfg };
    const { data, error } = await supabase
      .from("user_settings")
      .upsert(payload)
      .select()     // return the newly-upserted row
      .single();    // unwrap into an object

    if (error) {
      console.error("Error saving settings:", error);
      return;
    }
    setSettings(data);
  };

  // 3) Routing logic
  if (authLoading || loadingSettings) {
    return <div>Loading…</div>;
  }
  if (!session) {
    return <Login />;
  }
  if (licenseStatus === "expired") {
    return <LicenseGate />;
  }
  if (!settings) {
    return <SetupWizard onComplete={onWizardComplete} />;
  }
  return <MainApp userSettings={settings} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
