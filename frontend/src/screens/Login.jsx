import React, { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { open } from '@tauri-apps/plugin-shell'; // Updated for Tauri v1

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    try {
      console.log('Attempting login with email:', email); // Debug log
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('Supabase login error:', error.message); // Debug log
        setError(error.message);
      } else {
        console.log('Login successful, data:', data); // Debug log
      }
    } catch (err) {
      console.error('Unexpected login error:', err.message, err.stack); // Debug log
      setError('An unexpected error occurred. Please try again.');
    }
  };

  const openExternal = async (url) => {
    try {
      await open(url);
    } catch (err) {
      console.error('Failed to open URL in Tauri:', err);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#0b0b1a] to-[#37123d]">
      <div className="relative w-full max-w-md bg-white/20 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/30 glow-effect">
        <h2 className="text-center text-2xl font-extrabold text-white uppercase tracking-wide mb-6 glow-text">
          Login to OutPrio
        </h2>
        {error && (
          <div className="text-center text-sm text-red-200 mb-6 animate-fade-in">{error}</div>
        )}
        <div className="space-y-6">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-5 py-3 rounded-xl bg-white/30 backdrop-blur-md text-white placeholder-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-5 py-3 rounded-xl bg-white/30 backdrop-blur-md text-white placeholder-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300"
            required
          />
          <button
            onClick={handleLogin}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-700 text-white font-bold text-lg hover:from-purple-700 hover:to-indigo-800 focus:ring-4 focus:ring-purple-500 focus:outline-none transition-all duration-300 transform hover:scale-105"
          >
            Login
          </button>
        </div>
        <div className="mt-6 text-center text-sm text-gray-300">
          New to OutPrio?{' '}
          <button
            type="button"
            onClick={() => openExternal('https://outprio.netlify.app')}
            className="underline text-indigo-200 hover:text-indigo-100 transition-colors duration-300 bg-transparent border-0 p-0 cursor-pointer"
          >
            Start here
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;