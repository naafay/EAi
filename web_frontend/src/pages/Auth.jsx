/* -------------------------------------------------------------------------
  src/pages/Auth.jsx — Final Simple Tailwind Login/Signup Screen
  - Uses Tailwind via CDN (ensure <script src="https://cdn.tailwindcss.com"></script> in index.html)
  - Full file, clean and minimal, with gradient bg and glass card
---------------------------------------------------------------------------*/
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
        const userId = data.user.id;
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
      }
    }
  };
  <div className="h-8 bg-red-500"></div>
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-800 to-indigo-900 p-6">
      <div className="w-full max-w-sm bg-white bg-opacity-10 backdrop-blur-lg rounded-xl shadow-xl p-6">
        <div className="flex justify-center mb-6">
          <img src={logo} alt="OutPrio" className="h-12" />
        </div>
        <h2 className="text-center text-3xl font-extrabold text-white mb-4">
          {isLogin ? 'Login' : 'Sign Up'} to OutPrio
        </h2>
        {message && (
          <div className="text-center text-sm text-red-300 mb-4">{message}</div>
        )}
        <form onSubmit={handleAuth} className="space-y-4">
          {!isLogin && (
            <>
              <input
                type="text"
                placeholder="First Name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-white bg-opacity-20 placeholder-gray-200 text-white focus:ring-2 focus:ring-purple-500"
                required
              />
              <input
                type="text"
                placeholder="Last Name"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-white bg-opacity-20 placeholder-gray-200 text-white focus:ring-2 focus:ring-purple-500"
                required
              />
            </>
          )}
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-white bg-opacity-20 placeholder-gray-200 text-white focus:ring-2 focus:ring-purple-500"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-white bg-opacity-20 placeholder-gray-200 text-white focus:ring-2 focus:ring-purple-500"
            required
          />
          <button
            type="submit"
            className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold transition"
          >
            {isLogin ? 'Login' : 'Sign Up'}
          </button>
        </form>
        <div className="mt-4 text-center text-sm text-gray-200">
          {isLogin ? (
            <>New here?{' '}
              <button onClick={() => setIsLogin(false)} className="underline">
                Create an Account
              </button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button onClick={() => setIsLogin(true)} className="underline">
                Login Instead
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
