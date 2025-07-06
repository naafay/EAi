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
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return window.location.href = '/';
      setUser(user);
      const { data, error: pf } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!pf && data) {
        setProfile(data);
        setFirstName(data.first_name);
        setLastName(data.last_name);
        setEmail(data.email);
        if (data.subscription_id) fetchSub(data.subscription_id);
      }
    })();
  }, []);

  const saveProfile = async () => {
    setMessage('');
    const { error } = await supabase.from('profiles').update({ first_name: firstName, last_name: lastName }).eq('id', user.id);
    if (error) setMessage(error.message);
    else { setMessage('✅ Profile updated.'); setEditing(false); }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); window.location.href = '/'; };

  const handleStartTrial = async () => {
    const now = new Date();
    const expires = new Date(now.getTime() + 3*24*60*60*1000);
    await supabase.from('profiles').update({ trial_start: now.toISOString(), trial_expires: expires.toISOString() }).eq('id', user.id);
    window.location.reload();
  };

  const handleSubscription = async (priceId) => {
    setLoading(true);
    const res = await fetch(`${BACKEND}/create-checkout-session`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ price_id: priceId, customer_email: email }) });
    const data = await res.json();
    if(data.url) window.location.href = data.url;
    else alert('Checkout error');
    setLoading(false);
  };

  const handleCancel = async () => {
    if(!profile.subscription_id) return;
    const res = await fetch(`${BACKEND}/cancel-subscription/${profile.subscription_id}`,{method:'POST'});
    const data = await res.json();
    if(data.status==='success') alert('Cancelled');
    else alert('Cancel error');
  };

  if (!user || !profile) return null;

  // License status
  const today = new Date();
  const trialStart = profile.trial_start ? new Date(profile.trial_start) : null;
  const trialExpires = profile.trial_expires ? new Date(profile.trial_expires) : null;
  let status='⏳ Not Started'; let days=0;
  if(profile.is_paid) status='✅ Paid';
  else if(trialStart && trialExpires){ days=Math.ceil((trialExpires-today)/(1000*60*60*24)); status= days>0?'🧪 Trial Active':'⚠️ Trial Expired'; }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 to-indigo-800 relative overflow-hidden">
      {/* Starry Background Overlay with Fixed Positions */}
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
        <img src={logo} alt="OutPrio" className="h-10 w-auto transition-transform hover:scale-110" />
        <button onClick={handleLogout} className="text-sm uppercase text-gray-300 hover:text-white transition-colors duration-300">Logout</button>
      </nav>
      <div className="flex-grow flex items-center justify-center p-6">
        <div className="relative w-full max-w-xl bg-white/20 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/30 glow-effect">
          <h1 className="text-center text-3xl font-extrabold uppercase text-white mb-6 glow-text">Welcome, {firstName}</h1>
          {message && <p className="text-center text-green-300 mb-6 animate-fade-in">{message}</p>}
          <div className="space-y-6">
            <div className="space-y-4">
              <div><label className="block text-sm uppercase text-gray-300">Email</label><input className="w-full mt-2 p-3 rounded-xl bg-white/30 backdrop-blur-md text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300" value={email} disabled /></div>
              <div><label className="block text-sm uppercase text-gray-300">First Name</label><input className="w-full mt-2 p-3 rounded-xl bg-white/30 backdrop-blur-md text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300" value={firstName} onChange={e=>setFirstName(e.target.value)} disabled={!editing} /></div>
              <div><label className="block text-sm uppercase text-gray-300">Last Name</label><input className="w-full mt-2 p-3 rounded-xl bg-white/30 backdrop-blur-md text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-300" value={lastName} onChange={e=>setLastName(e.target.value)} disabled={!editing} /></div>
            </div>
            <div className="flex justify-center space-x-4">
              {editing ? (
                <>
                  <button onClick={saveProfile} className="px-6 py-2 bg-green-500 rounded-xl text-white font-semibold hover:bg-green-600 focus:ring-2 focus:ring-green-400 transition-all duration-300 transform hover:scale-105">Save</button>
                  <button onClick={() => setEditing(false)} className="px-6 py-2 bg-gray-600 rounded-xl text-white font-semibold hover:bg-gray-700 focus:ring-2 focus:ring-gray-400 transition-all duration-300 transform hover:scale-105">Cancel</button>
                </>
              ) : (
                <button onClick={() => setEditing(true)} className="w-full py-2 bg-blue-600 rounded-xl text-white font-semibold hover:bg-blue-700 focus:ring-2 focus:ring-blue-400 transition-all duration-300 transform hover:scale-105">Edit Profile</button>
              )}
            </div>
            <div className="pt-6 border-t border-white/20 space-y-4">
              <h2 className="text-lg font-semibold uppercase text-gray-200">License Information</h2>
              <p className="text-gray-300"><strong>Status:</strong> {status}</p>
              {!profile.is_paid && trialStart && <p className="text-gray-300"><strong>Days Remaining:</strong> {Math.max(0, days)}</p>}
              {profile.is_paid || (trialStart && days > 0) ? (
                <div className="space-y-4">
                  {profile.is_paid && subscriptionInfo && (
                    <div className="bg-white/20 p-4 rounded-xl backdrop-blur-md space-y-2">
                      <p className="text-gray-300"><strong>Plan:</strong> {subscriptionInfo.plan.interval} (${subscriptionInfo.plan.amount / 100}/{subscriptionInfo.plan.interval})</p>
                      <p className="text-gray-300"><strong>Renewal:</strong> {new Date(subscriptionInfo.current_period_end * 1000).toLocaleDateString()}</p>
                      <div className="flex space-x-2">
                        {!subscriptionInfo.cancel_at_period_end ? (
                          <button onClick={handleCancel} className="px-4 py-2 bg-red-600 rounded-xl text-white font-semibold hover:bg-red-700 focus:ring-2 focus:ring-red-400 transition-all duration-300 transform hover:scale-105">Cancel Subscription</button>
                        ) : (
                          <button onClick={() => alert('Resume not implemented')} className="px-4 py-2 bg-green-600 rounded-xl text-white font-semibold hover:bg-green-700 focus:ring-2 focus:ring-green-400 transition-all duration-300 transform hover:scale-105">Resume Subscription</button>
                        )}
                      </div>
                    </div>
                  )}
                  {!profile.is_paid && !trialStart && (
                    <button onClick={handleStartTrial} className="w-full px-6 py-2 bg-green-600 rounded-xl text-white font-semibold hover:bg-green-700 focus:ring-2 focus:ring-green-400 transition-all duration-300 transform hover:scale-105">Start Free 3-Day Trial</button>
                  )}
                  {!profile.is_paid && (
                    <>
                      <button onClick={() => handleSubscription('price_1RfIVDFVd7b5c6lTQrG7zUtJ')} disabled={loading} className="w-full px-6 py-2 bg-blue-600 rounded-xl text-white font-semibold hover:bg-blue-700 focus:ring-2 focus:ring-blue-400 transition-all duration-300 transform hover:scale-105">{loading ? 'Redirecting...' : 'Buy Monthly'}</button>
                      <button onClick={() => handleSubscription('price_1RfJ54FVd7b5c6lTbljBBCOB')} disabled={loading} className="w-full px-6 py-2 bg-purple-600 rounded-xl text-white font-semibold hover:bg-purple-700 focus:ring-2 focus:ring-purple-400 transition-all duration-300 transform hover:scale-105">{loading ? 'Redirecting...' : 'Buy Annual'}</button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}