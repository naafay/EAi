// src/pages/Dashboard.jsx

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import logo from '../assets/outprio.png';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);
  const BACKEND = 'https://eai-uuwt.onrender.com';

  // Use ref to store star positions, calculated once on mount
  const starPositions = useRef([]);

  useEffect(() => {
    // Generate star positions on initial mount
    starPositions.current = Array.from({ length: 50 }).map(() => ({
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 5}s`,
    }));

    (async () => {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        window.location.href = '/';
        return;
      }
      setUser(user);

      const { data, error: pfErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!pfErr && data) {
        setProfile(data);
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
        setEmail(data.email || '');

        if (data.subscription_id) {
          try {
            const res = await fetch(
              `${BACKEND}/subscription-info/${data.subscription_id}`
            );
            if (res.ok) {
              const info = await res.json();
              setSubscriptionInfo(info);
            } else {
              console.error('Failed to fetch subscription info:', res.status);
            }
          } catch (err) {
            console.error('Error fetching subscription info:', err);
          }
        }
      }
    })();
  }, []);

  const saveProfile = async () => {
    setMessage('');
    const { error } = await supabase
      .from('profiles')
      .update({ first_name: firstName, last_name: lastName })
      .eq('id', user.id);
    if (error) setMessage(error.message);
    else {
      setMessage('✅ Profile updated.');
      setEditing(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const handleStartTrial = async () => {
    const now = new Date();
    const expires = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    await supabase
      .from('profiles')
      .update({
        trial_start: now.toISOString().split('T')[0],
        trial_expires: expires.toISOString().split('T')[0],
      })
      .eq('id', user.id);
    window.location.reload();
  };

  const handleSubscription = async (priceId) => {
    setLoading(true);
    const res = await fetch(`${BACKEND}/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price_id: priceId, customer_email: email }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else alert('Checkout error');
    setLoading(false);
  };

  const handleResume = async () => {
  if (!profile.subscription_id) return;

  const res = await fetch(
    `${BACKEND}/resume-subscription/${profile.subscription_id}`,
    { method: 'POST' }
  );
  const data = await res.json();
  if (data.status === 'success') {
    alert('Subscription resumed.');
    window.location.reload();
  } else {
    alert('Resume error');
  }
};

const handleCancel = async () => {
  if (!profile.subscription_id) return;

  const confirmed = window.confirm("Are you sure you want to cancel your subscription? You will retain access until the end of the billing cycle.");
  if (!confirmed) return;

  const res = await fetch(
    `${BACKEND}/cancel-subscription/${profile.subscription_id}`,
    { method: 'POST' }
  );
  const data = await res.json();
  if (data.status === 'success') {
    alert('Subscription cancellation scheduled. You will retain access until the end of the billing cycle.');
    window.location.reload(); // Refresh state
  } else {
    alert('Cancel error');
  }
};

  const handleResetPassword = async () => {
    setMessage('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    });
    if (error) setMessage(error.message);
    else
      setMessage('✅ Password reset email sent. Check your inbox.');
  };

  if (!user || !profile) return null;

  // License details
  const today = new Date();
  const trialStart = profile.trial_start
    ? new Date(profile.trial_start)
    : null;
  const trialExpires = profile.trial_expires
    ? new Date(profile.trial_expires)
    : null;
  const subscriptionStart = profile.subscription_start
    ? new Date(profile.subscription_start)
    : null;
  const subscriptionEnd = profile.subscription_end
    ? new Date(profile.subscription_end)
    : null;

  let status = '⏳ Not Started';
  let days = 0;
  let licenseType = '';
  let startDate = null;
  let endDate = null;

  if (profile.is_paid) {
    status = '✅ Paid';
    licenseType = profile.subscription_type || 'Premium';
    startDate = subscriptionStart;
    endDate = subscriptionEnd;
  } else if (trialStart && trialExpires) {
    days = Math.ceil((trialExpires - today) / (1000 * 60 * 60 * 24));
    status = days > 0 ? '🧪 Trial Active' : '⚠️ Trial Expired';
    licenseType = 'Trial';
    startDate = trialStart;
    endDate = trialExpires;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b1a] to-[#37123d] relative overflow-hidden">
      {/* Starry Background Overlay */}
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

      <nav className="flex items-center justify-between p-6">
        <a
          href="https://outprio.com"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-transform hover:scale-110"
        >
          <img src={logo} alt="OutPrio" className="h-10 w-auto" />
        </a>
        <button
          onClick={handleLogout}
          className="text-2xl text-gray-300 hover:text-white transition-colors duration-300"
        >
          ⏻
        </button>
      </nav>

      <div className="flex-grow flex items-center justify-center p-6">
        <div className="relative w-full max-w-xl bg-white/20 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/30 glow-effect">
          <h1 className="text-center text-3xl font-extrabold uppercase text-white mb-6 glow-text">
            Welcome, {firstName}
          </h1>
          {message && (
            <p className="text-center text-green-300 mb-6 animate-fade-in">
              {message}
            </p>
          )}

          <div className="space-y-6">
            {/* Personal Information */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold uppercase text-gray-200">
                  Personal Information
                </h2>
                {!editing ? (
                  <button
                    onClick={() => setEditing(true)}
                    className="text-2xl text-indigo-300 hover:text-indigo-400 transition-colors duration-300"
                  >
                    ✎
                  </button>
                ) : (
                  <div className="space-x-4">
                    <button
                      onClick={saveProfile}
                      className="text-xl text-teal-900 hover:text-teal-400 transition-colors duration-300"
                    >
                      ✔
                    </button>
                    <button
                      onClick={() => {
                        setEditing(false);
                        setFirstName(profile.first_name || '');
                        setLastName(profile.last_name || '');
                      }}
                      className="text-l text-gray-700 hover:text-gray-500 transition-colors duration-300"
                    >
                      ❌
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm uppercase text-gray-300">
                    Email
                  </label>
                  <input
                    className="w-full mt-2 p-3 rounded-xl bg-white/30 backdrop-blur-md text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300"
                    value={email}
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm uppercase text-gray-300">
                    First Name
                  </label>
                  <input
                    className="w-full mt-2 p-3 rounded-xl bg-white/30 backdrop-blur-md text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={!editing}
                  />
                </div>
                <div>
                  <label className="block text-sm uppercase text-gray-300">
                    Last Name
                  </label>
                  <input
                    className="w-full mt-2 p-3 rounded-xl bg-white/30 backdrop-blur-md text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={!editing}
                  />
                </div>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    handleResetPassword();
                  }}
                  className="block text-sm text-indigo-200 hover:text-indigo-100 transition-colors duration-300"
                >
                  Reset Password
                </a>
              </div>
            </div>

            {/* License Information */}
            <div className="pt-6 border-t border-white/20 space-y-4">
              <h2 className="text-lg font-semibold uppercase text-gray-200">
                License Information
              </h2>
              <div className="bg-white/20 p-4 rounded-xl backdrop-blur-md space-y-3">
                <div className="flex justify-between text-gray-300">
                  <span>Status</span>
                  <span className="font-medium">{status}</span>
                </div>
                {(trialStart || subscriptionStart) && (
                  <div className="flex justify-between text-gray-300">
                    <span>Plan</span>
                    <span className="font-medium capitalize">OutPrio {licenseType}</span>
                  </div>
                )}
                {startDate && (
                  <div className="flex justify-between text-gray-300">
                    <span>Start Date</span>
                    <span className="font-medium">
                      {startDate.toLocaleDateString()}
                    </span>
                  </div>
                )}
                {endDate && (
                  <div className="flex justify-between text-gray-300">
                    <span>End Date</span>
                    <span className="font-medium">
                      {endDate.toLocaleDateString()}
                    </span>
                  </div>
                )}

                {profile.is_paid && subscriptionInfo && (
                  <>
                    <div className="flex justify-between text-gray-300">
                      <span>License Type</span>
                      <span className="font-medium">
                        {subscriptionInfo.plan.interval === 'month'
                          ? 'Monthly'
                          : 'Annual'}{' '}
                        —{' '}
                        {subscriptionInfo.plan.interval === 'month'
                          ? '$3.99 USD / month'
                          : '$39.9 USD / year'}
                      </span>
                    </div>
                  <div className="flex justify-between text-gray-300">
                    <span>
                      {subscriptionInfo.cancel_at_period_end ? 'Access Ends On' : 'Next Billing'}
                    </span>
                    <span className="font-medium">
                      {new Date(
                        subscriptionInfo.current_period_end * 1000
                      ).toLocaleDateString()}
                    </span>
                  </div>
                  </>
                )}

              {profile.is_paid && subscriptionInfo ? (
                <div className="flex flex-col space-y-2">
                  {subscriptionInfo.cancel_at_period_end ? (
                    <button
                      onClick={handleResume}
                      className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-300 transform hover:scale-105"
                    >
                      Resume Subscription
                    </button>
                  ) : (
                    <>
                      {subscriptionInfo.plan.interval === 'month' && (
                        <button
                          onClick={() =>
                            handleSubscription('price_1RfJ54FVd7b5c6lTbljBBCOB')
                          }
                          disabled={loading}
                          className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all duration-300 transform hover:scale-105"
                        >
                          Buy Annual ($39.9/yr)
                        </button>
                      )}
                      <button
                        onClick={handleCancel}
                        className="w-full px-4 py-2 bg-rose-700 text-white rounded-lg hover:bg-rose-800 transition-all duration-300 transform hover:scale-105"
                      >
                        Cancel Subscription
                      </button>
                    </>
                  )}
                </div>
              ) : trialStart && days > 0 ? (
                <div></div>
              ) : null}
                {!profile.is_paid && !trialStart && (
                  <button
                    onClick={handleStartTrial}
                    className="w-full px-6 py-2 bg-teal-600 rounded-xl text-white font-semibold hover:bg-teal-700 focus:ring-2 focus:ring-teal-400 transition-all duration-300 transform hover:scale-105"
                  >
                    Start Free 3-Day Trial
                  </button>
                )}

                {!profile.is_paid && (
                  <div className="flex space-x-2">
                    <button
                      onClick={() =>
                        handleSubscription('price_1RfIVDFVd7b5c6lTQrG7zUtJ')
                      }
                      disabled={loading}
                      className="flex-1 px-3 py-2 bg-blue-600 rounded-xl text-white font-semibold hover:bg-blue-700 focus:ring-2 focus:ring-blue-400 transition-all duration-300 transform hover:scale-105"
                    >
                      {loading ? 'Redirecting...' : 'Monthly ($3.99/mo)'}
                    </button>
                    <button
                      onClick={() =>
                        handleSubscription('price_1RfJ54FVd7b5c6lTbljBBCOB')
                      }
                      disabled={loading}
                      className="flex-1 px-3 py-2 bg-purple-600 rounded-xl text-white font-semibold hover:bg-purple-700 focus:ring-2 focus:ring-purple-400 transition-all duration-300 transform hover:scale-105"
                    >
                      {loading ? 'Redirecting...' : 'Annual ($39.99/yr)'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
