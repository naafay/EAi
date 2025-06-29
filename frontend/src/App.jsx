// src/App.jsx
import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./screens/Login";
import LicenseGate from "./screens/LicenseGate";
import MainApp from "./MainApp"; // this should be your original app UI code

const AppRoutes = () => {
  const { session, licenseStatus, loading } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!session) return <Login />;
  if (licenseStatus === "expired") return <LicenseGate />;
  return <MainApp />;
};

const App = () => (
  <AuthProvider>
    <Router>
      <AppRoutes />
    </Router>
  </AuthProvider>
);

export default App;
