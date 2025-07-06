// src/pages/Auth.jsx
import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/outprio.png';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleAuth = async (e) => {
    e.preventDefault();
    setMessage('');
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else navigate('/dashboard');
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setMessage(error.message);
      else {
        const userId = data.user?.id;
        const now = new Date().toISOString();
        await supabase.from('profiles').insert({
          id: userId,
          email,
          first_name: firstName,
          last_name: lastName,
          trial_start: null,
          trial_expires: null,
          is_paid: false,
          created_at: now,
        });
        setMessage('✅ Signup successful. You can now log in.');
        setIsLogin(true);
        setEmail(''); setPassword(''); setFirstName(''); setLastName('');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1B0A2A] to-[#330C59] flex flex-col">
      <nav className="flex items-center justify-between p-6">
        <img src={logo} alt="OutPrio" className="h-8 w-auto" />
        <div className="space-x-6 text-sm text-gray-200 uppercase">
          <a href="/download" className="hover:text-white">Download</a>
          <a href="/subscribe" className="hover:text-white">Subscribe</a>
        </div>
      </nav>

      <div className="flex-grow flex items-center justify-center">
        <form onSubmit={handleAuth} className="w-full max-w-md bg-black/30 backdrop-blur-sm border border-white/20 rounded-2xl p-8 space-y-6">
          <div className="flex justify-center">
            <img src={logo} alt="OutPrio" className="h-10 w-auto" />
          </div>
          <h2 className="text-center text-2xl font-bold text-white uppercase">
            {isLogin ? 'Login' : 'Sign Up'} to OutPrio
          </h2>
          {message && <p className="text-center text-sm text-red-400">{message}</p>}

          {!isLogin && (
            <div className="grid grid-cols-2 gap-4">
              <input type="text" placeholder="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} className="px-4 py-2 rounded bg-white/10 placeholder-gray-300 text-gray-100" required />
              <input type="text" placeholder="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} className="px-4 py-2 rounded bg-white/10 placeholder-gray-300 text-gray-100" required />
            </div>
          )}

          <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-2 rounded bg-white/10 placeholder-gray-300 text-gray-100" required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2 rounded bg-white/10 placeholder-gray-300 text-gray-100" required />

          <button type="submit" className="w-full py-2 rounded bg-purple-600 hover:bg-purple-700 text-white font-semibold transition">
            {isLogin ? 'Login' : 'Sign Up'}
          </button>

          <p className="text-center text-sm text-gray-200">
            {isLogin ? (
              <>New here? <button type="button" onClick={() => setIsLogin(false)} className="underline">Create an account</button></>
            ) : (
              <>Already have an account? <button type="button" onClick={() => setIsLogin(true)} className="underline">Log in</button></>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}