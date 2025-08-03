// src/pages/DownloadSetupPage.jsx

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/outprio.png';

export default function DownloadSetupPage() {
  const [tab, setTab] = useState('new');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // starry background positions
  const starPositions = useRef([]);
  useEffect(() => {
    starPositions.current = Array.from({ length: 50 }).map(() => ({
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 5}s`,
    }));
  }, []);

  const downloadUrl =
    'https://outprio.netlify.app/downloads/OutPrio_1.0.0_x64-setup.exe';

  // sign up → activate trial → auto-download
  const handleSignup = async (e) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        setMessage(signUpError.message);
        setLoading(false);
        return;
      }

      const userId = data.user.id;
      const now = new Date();
      const expires = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      const { error: profileError } = await supabase.from('profiles').insert({
        id: userId,
        email,
        first_name: firstName,
        last_name: lastName,
        trial_start: now.toISOString().split('T')[0],
        trial_expires: expires.toISOString().split('T')[0],
        is_paid: false,
        created_at: now.toISOString(),
      });

      if (profileError) {
        setMessage(profileError.message);
        setLoading(false);
        return;
      }

      // everything succeeded → download
      window.location.href = downloadUrl;
    } catch (err) {
      setMessage(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#0b0b1a] to-[#37123d] relative overflow-hidden">
      {starPositions.current.map((pos, i) => (
        <span
          key={i}
          className="absolute h-1 w-1 bg-white rounded-full opacity-10 animate-twinkle"
          style={{
            top: pos.top,
            left: pos.left,
            animationDelay: pos.animationDelay,
          }}
        />
      ))}

      <div className="relative w-full max-w-md bg-white/20 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/30 glow-effect">
        <div className="flex justify-center mb-8">
          <a
            href="https://www.outprio.com"
            className="transition-transform hover:scale-110"
          >
            <img src={logo} alt="OutPrio" className="h-12" />
          </a>
        </div>

        <h2 className="text-center text-2xl font-extrabold text-white uppercase tracking-wide mb-6 glow-text">
          Download OutPrio
        </h2>

        <div className="flex justify-center space-x-4 mb-6">
          <button
            onClick={() => {
              setTab('new');
              setMessage('');
            }}
            className={`px-4 py-2 rounded-full ${
              tab === 'new'
                ? 'bg-purple-600 text-white'
                : 'bg-white/30 text-gray-200'
            }`}
          >
            New to OutPrio
          </button>
          <button
            onClick={() => {
              setTab('returning');
              setMessage('');
            }}
            className={`px-4 py-2 rounded-full ${
              tab === 'returning'
                ? 'bg-purple-600 text-white'
                : 'bg-white/30 text-gray-200'
            }`}
          >
            Returning User
          </button>
        </div>

        {message && (
          <div className="text-center text-sm text-red-200 mb-4">{message}</div>
        )}

        {tab === 'new' && (
          <form onSubmit={handleSignup} className="space-y-4">
            <input
              type="text"
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="w-full px-5 py-3 rounded-xl bg-white/30 backdrop-blur-md text-white placeholder-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300"
            />
            <input
              type="text"
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="w-full px-5 py-3 rounded-xl bg-white/30 backdrop-blur-md text-white placeholder-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300"
            />
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-5 py-3 rounded-xl bg-white/30 backdrop-blur-md text-white placeholder-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-5 py-3 rounded-xl bg-white/30 backdrop-blur-md text-white placeholder-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-700 text-white font-bold text-lg hover:from-purple-700 hover:to-indigo-800 focus:ring-4 focus:ring-purple-500 focus:outline-none transition-all duration-300 transform hover:scale-105 disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create Account & Download'}
            </button>
            <p className="text-center text-gray-300 text-sm">
              By creating an account, you’ll activate a 3-day free trial and
              automatically download the OutPrio installer.
            </p>
          </form>
        )}

        {tab === 'returning' && (
          <div className="space-y-4">
            <a
              href={downloadUrl}
              className="block w-full text-center py-3 rounded-xl bg-teal-600 text-white font-bold text-lg hover:bg-teal-700 transition-all duration-300"
            >
              Download Now
            </a>
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 rounded-xl bg-white/30 text-white font-bold text-lg hover:bg-white/40 transition-all duration-300"
            >
              Sign In to OutPrio
            </button>
            <p className="text-center text-gray-300 text-sm">
              Install the app, then launch and sign in to start prioritizing
              your inbox.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
