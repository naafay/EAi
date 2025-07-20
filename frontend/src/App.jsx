// src/App.jsx

import React, { useEffect, useState } from "react";
import axios from "axios";
import { BrowserRouter as Router } from "react-router-dom";
import { supabase } from "./utils/supabaseClient";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./screens/Login";
import LicenseGate from "./screens/LicenseGate";
import MainApp from "./MainApp";
import SetupWizard from "./SetupWizard";

axios.defaults.baseURL = "http://127.0.0.1:8000";

function AppRoutes() {
  const { session, licenseStatus, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Sync to backend
  const syncUserConfig = async (cfg) => {
    try {
      await axios.post("/user-config", {
        outlook_email:  cfg.outlook_email,
        full_name:      cfg.full_name,
        aliases:        cfg.aliases || [],
        vip_group_name: cfg.vip_group_name,
        vip_emails:     cfg.vip_emails
      });
    } catch (e) {
      console.error("Error syncing user config:", e);
    }
  };

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
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("Error loading settings:", error);
        setSettings(data);
        if (data) {
          syncUserConfig(data);
        }
      })
      .finally(() => setLoadingSettings(false));
  }, [session]);

  // 2) Called when SetupWizard finishes
  const onWizardComplete = async (cfg) => {
    const payload = { user_id: session.user.id, ...cfg };
    const { data, error } = await supabase
      .from("user_settings")
      .upsert(payload)
      .select()
      .single();
    if (error) {
      console.error("Error saving settings:", error);
      return;
    }
    setSettings(data);
    syncUserConfig(data);
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
