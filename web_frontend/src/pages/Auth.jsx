import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/outprio.png';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [isResetMode, setIsResetMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [message, setMessage] = useState('');
  const [loadingReset, setLoadingReset] = useState(false);
  const navigate = useNavigate();

  const starPositions = useRef([]);

  useEffect(() => {
    starPositions.current = Array.from({ length: 50 }).map(() => ({
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 5}s`,
    }));
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setMessage('');
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else navigate('/dashboard');
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage(error.message);
      } else {
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

const handleResetPassword = async () => {
  setMessage('');
  if (!email) {
    setMessage('Please enter your email address.');
    return;
  }
  setLoadingReset(true);

  // Generate a 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10-minute expiration

  // Store OTP in Supabase
  const { error: insertError } = await supabase
    .from('otp_codes')
    .insert({ email, otp, expires_at: expiresAt, used: false });

  if (insertError) {
    setMessage(`Error generating OTP: ${insertError.message}`);
  } else {
    // Send OTP via Supabase email using the inviteUser template
    const { error: emailError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: null,
      data: { otp }, // OTP will be inserted into the email template
    });
    if (emailError) {
      setMessage(`Error sending OTP: ${emailError.message}`);
    } else {
      setMessage('✅ OTP sent to your email. Enter it on the reset page.');
      setIsResetMode(false); // Return to login view
    }
  }
  setLoadingReset(false);
};

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    if (isResetMode) {
      await handleResetPassword();
    } else {
      await handleAuth(e);
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
          <a href="https://www.outprio.com" className="transition-transform hover:scale-110">
            <img src={logo} alt="OutPrio" className="h-12" />
          </a>
        </div>
        <h2 className="text-center text-2xl font-extrabold text-white uppercase tracking-wide mb-6 glow-text">
          {isResetMode
            ? 'Reset Password'
            : isLogin
            ? 'Welcome Back'
            : 'Join OutPrio'}
        </h2>
        {message && (
          <div className="text-center text-sm text-red-200 mb-6 animate-fade-in">
            {message}
          </div>
        )}
        <form onSubmit={handleFormSubmit} className="space-y-6">
          {!isResetMode && !isLogin && (
            <>
              <input
                type="text"
                placeholder="First Name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="w-full px-5 py-3 rounded-xl bg-white/30 backdrop-blur-md text-white placeholder-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300"
                required
              />
              <input
                type="text"
                placeholder="Last Name"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className="w-full px-5 py-3 rounded-xl bg-white/30 backdrop-blur-md text-white placeholder-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300"
                required
              />
            </>
          )}
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-5 py-3 rounded-xl bg-white/30 backdrop-blur-md text-white placeholder-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300"
            required
          />
          {!isResetMode && (
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-5 py-3 rounded-xl bg-white/30 backdrop-blur-md text-white placeholder-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300"
              required
            />
          )}
          <button
            type="submit"
            disabled={isResetMode ? loadingReset : false}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-700 text-white font-bold text-lg hover:from-purple-700 hover:to-indigo-800 focus:ring-4 focus:ring-purple-500 focus:outline-none transition-all duration-300 transform hover:scale-105 disabled:opacity-50"
          >
            {isResetMode
              ? loadingReset
                ? 'Sending...'
                : 'Reset Password'
              : isLogin
              ? 'Login'
              : 'Sign Up'}
          </button>
        </form>
        <div className="mt-4 text-center text-sm text-gray-300">
          {isResetMode ? (
            <button
              onClick={() => {
                setIsResetMode(false);
                setMessage('');
              }}
              className="underline text-indigo-200 hover:text-indigo-100 transition-colors duration-300"
            >
              ⟵ Back to login
            </button>
          ) : isLogin ? (
            <>
              <button
                onClick={() => setIsResetMode(true)}
                className="underline text-indigo-200 hover:text-indigo-100 transition-colors duration-300"
              >
                Forgot password?
              </button>
              <div className="mt-5">
                New to OutPrio?{' '}
                <button
                  onClick={() => {
                    setIsLogin(false);
                    setIsResetMode(false);
                  }}
                  className="underline text-indigo-200 hover:text-indigo-100 transition-colors duration-300"
                >
                  Create an Account
                </button>
              </div>
            </>
          ) : (
            <>
              Already a member?{' '}
              <button
                onClick={() => {
                  setIsLogin(true);
                  setIsResetMode(false);
                }}
                className="underline text-indigo-200 hover:text-indigo-100 transition-colors duration-300"
              >
                Login Instead
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
