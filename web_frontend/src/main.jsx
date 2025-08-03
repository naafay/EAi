// src/main.jsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './index.css';

import AuthPage from './pages/Auth';
import DownloadSetupPage from './pages/DownloadSetupPage';
import Dashboard from './pages/Dashboard';
import ResetPassword from './pages/ResetPassword';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Router>
    <Routes>
      <Route path="/" element={<AuthPage />} />
      <Route path="/download-setup" element={<DownloadSetupPage />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/reset-password" element={<ResetPassword />} />
    </Routes>
  </Router>
);
