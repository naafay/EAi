import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

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
      if (error) {
        setMessage(error.message);
      } else {
        navigate('/dashboard');
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
      } else {
        const userId = data.user?.id;
        const now = new Date();

        await supabase.from('profiles').insert({
          id: userId,
          email,
          first_name: firstName,
          last_name: lastName,
          trial_start: null,
          trial_expires: null,
          is_paid: false,
          created_at: now.toISOString(),
        });

        setMessage('✅ Signup successful. You can now log in.');
        setIsLogin(true);
        setEmail('');
        setPassword('');
        setFirstName('');
        setLastName('');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <form onSubmit={handleAuth} className="bg-white p-8 rounded shadow-md w-full max-w-sm">
        <h2 className="text-xl font-bold mb-4">
          {isLogin ? 'Login to OutPrio' : 'Sign Up for OutPrio'}
        </h2>

        {message && <div className="mb-4 text-sm text-blue-600">{message}</div>}

        {!isLogin && (
          <>
            <label className="block mb-2 text-sm font-medium">First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full border px-3 py-2 rounded mb-4"
              required
            />
            <label className="block mb-2 text-sm font-medium">Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full border px-3 py-2 rounded mb-4"
              required
            />
          </>
        )}

        <label className="block mb-2 text-sm font-medium">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border px-3 py-2 rounded mb-4"
          required
        />

        <label className="block mb-2 text-sm font-medium">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border px-3 py-2 rounded mb-6"
          required
        />

        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded"
        >
          {isLogin ? 'Login' : 'Sign Up'}
        </button>

        <div className="mt-4 text-sm text-center">
          {isLogin ? (
            <>
              New here?{' '}
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                className="text-blue-600 underline"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className="text-blue-600 underline"
              >
                Log in here
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
