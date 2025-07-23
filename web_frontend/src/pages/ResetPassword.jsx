// Replace the entire ResetPassword.jsx content
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import logo from '../assets/outprio.png';

export default function ResetPassword() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const starPositions = useRef([]);

  useEffect(() => {
    starPositions.current = Array.from({ length: 50 }).map(() => ({
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 5}s`,
    }));
  }, []);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      setLoading(false);
      return;
    }

    const { data, error: fetchError } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('email', email)
      .eq('otp', otp)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (fetchError || !data) {
      setMessage('Invalid or expired OTP.');
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setMessage(updateError.message);
    } else {
      // Mark OTP as used
      await supabase
        .from('otp_codes')
        .update({ used: true })
        .eq('id', data.id);

      setMessage('✅ Password updated successfully. Redirecting to login...');
      setTimeout(() => navigate('/'), 2000);
    }
    setLoading(false);
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
          <a href="https://www.outprio.com" className="transition-transform hover:scale-110">
            <img src={logo} alt="OutPrio" className="h-12" />
          </a>
        </div>
        <h2 className="text-center text-2xl font-extrabold text-white uppercase tracking-wide mb-6 glow-text">
          Reset Password
        </h2>
        {message && (
          <div className="text-center text-sm text-red-200 mb-6 animate-fade-in">
            {message}
          </div>
        )}
        <form onSubmit={handleResetPassword} className="space-y-6">
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-5 py-3 rounded-xl bg-white/30 backdrop-blur-md text-white placeholder-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300"
            required
          />
          <input
            type="text"
            placeholder="Enter OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="w-full px-5 py-3 rounded-xl bg-white/30 backdrop-blur-md text-white placeholder-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300"
            required
          />
          <input
            type="password"
            placeholder="New Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-5 py-3 rounded-xl bg-white/30 backdrop-blur-md text-white placeholder-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300"
            required
          />
          <input
            type="password"
            placeholder="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-5 py-3 rounded-xl bg-white/30 backdrop-blur-md text-white placeholder-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-700 text-white font-bold text-lg hover:from-purple-700 hover:to-indigo-800 focus:ring-4 focus:ring-purple-500 focus:outline-none transition-all duration-300 transform hover:scale-105 disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
        <div className="mt-4 text-center text-sm text-gray-300">
          <button
            onClick={() => navigate('/')}
            className="underline text-indigo-200 hover:text-indigo-100 transition-colors duration-300"
          >
            ⟵ Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}