// src/LicenseGate.jsx

import React from 'react';
import { supabase } from '../utils/supabaseClient'; // import your auth client

export default function LicenseGate() {
  const handleSwitch = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login'; // or wherever your login lives
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#0b0b1a] to-[#37123d] relative overflow-hidden">
      <div className="relative w-full max-w-md bg-white/20 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/30 glow-effect">
        <h2 className="text-center text-2xl font-extrabold text-white uppercase tracking-wide mb-6 glow-text">
          Your License Has Expired
        </h2>
        <p className="text-center text-gray-200 mb-6">
          Please purchase or renew your OutPrio subscription to continue using the app.
        </p>

        <button
          onClick={() => window.location.href = 'https://outprio.netlify.app/dashboard'}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-700 text-white font-bold text-lg hover:from-purple-700 hover:to-indigo-800 focus:ring-4 focus:ring-purple-500 focus:outline-none transition-all duration-300 transform hover:scale-105"
        >
          Purchase Subscription
        </button>

        {/* secondary “switch user” button */}
        <button
          onClick={handleSwitch}
          className="w-full mt-4 py-3 rounded-xl bg-transparent border-2 border-indigo-500 text-indigo-200 font-semibold text-lg hover:bg-indigo-600 hover:text-white focus:ring-4 focus:ring-indigo-400 transition-all duration-300 transform hover:scale-105"
        >
          Logout & Switch User
        </button>
      </div>
    </div>
  );
}