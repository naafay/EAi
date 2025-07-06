// src/pages/Dashboard.jsx
import { useEffect, useState } from 'react';
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

  useEffect(() => {
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

    async function fetchSub(id) {
      try {
        const res = await fetch(`${BACKEND}/subscription-info/${id}`);
        const info = await res.json();
        if (!info.error) setSubscriptionInfo(info);
      } catch {};
    }
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
    <div className="min-h-screen bg-gradient-to-b from-[#1B0A2A] to-[#330C59] text-gray-100 flex flex-col">
      <nav className="flex items-center justify-between p-6">
        <img src={logo} alt="OutPrio" className="h-8 w-auto" />
        <button onClick={handleLogout} className="text-sm uppercase hover:text-white">Logout</button>
      </nav>

      <div className="flex-grow flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-black/30 backdrop-blur-sm border border-white/20 rounded-2xl shadow-lg p-6 space-y-6">
          <h1 className="text-2xl font-bold uppercase text-white text-center">Welcome, {firstName}</h1>
          {message && <p className="text-center text-green-400">{message}</p>}

          <div className="space-y-4">
            <div><label className="block text-sm uppercase">Email</label><input className="w-full mt-1 p-2 bg-white/10 rounded text-gray-100" value={email} disabled /></div>
            <div><label className="block text-sm uppercase">First Name</label><input className="w-full mt-1 p-2 bg-white/10 rounded text-gray-100" value={firstName} onChange={e=>setFirstName(e.target.value)} disabled={!editing} /></div>
            <div><label className="block text-sm uppercase">Last Name</label><input className="w-full mt-1 p-2 bg-white/10 rounded text-gray-100" value={lastName} onChange={e=>setLastName(e.target.value)} disabled={!editing} /></div>
          </div>

          <div className="flex justify-center space-x-4">
            {editing? <><button onClick={saveProfile} className="px-4 py-2 bg-green-500 rounded uppercase">Save</button><button onClick={()=>setEditing(false)} className="px-4 py-2 bg-gray-600 rounded uppercase">Cancel</button></>: <button onClick={()=>setEditing(true)} className="w-full py-2 bg-blue-600 rounded uppercase">Edit Profile</button>}
          </div>

          {/* Subscription / License Section */}
          <div className="pt-4 border-t border-white/20 space-y-4">
            <h2 className="text-lg font-semibold uppercase">License Information</h2>
            <p>Status: <strong>{status}</strong></p>
            {!profile.is_paid && trialStart && <p>Days Remaining: <strong>{Math.max(0,days)}</strong></p>}

            {profile.is_paid || (trialStart && days>0) ? (
              // Paid or active trial: show subscription actions
              <div className="flex flex-col space-y-2">
                {profile.is_paid && subscriptionInfo && (
                  <div className="bg-white/10 p-4 rounded space-y-2">
                    <p><strong>Plan:</strong> {subscriptionInfo.plan.interval} (${subscriptionInfo.plan.amount / 100}/{subscriptionInfo.plan.interval})</p>
                    <p><strong>Renewal:</strong> {new Date(subscriptionInfo.current_period_end*1000).toLocaleDateString()}</p>
                    <div className="flex space-x-2">
                      {!subscriptionInfo.cancel_at_period_end ? <button onClick={handleCancel} className="px-3 py-1 bg-red-600 rounded uppercase">Cancel Subscription</button> : <button onClick={()=>alert('Resume not implemented')} className="px-3 py-1 bg-green-600 rounded uppercase">Resume Subscription</button>}
                    </div>
                  </div>
                )}
                {!profile.is_paid && !trialStart && (
                  <button onClick={handleStartTrial} className="w-full px-4 py-2 bg-green-600 rounded uppercase">Start Free 3-Day Trial</button>
                )}
                {!profile.is_paid && (
                  <>  <button onClick={()=>handleSubscription('price_1RfIVDFVd7b5c6lTQrG7zUtJ')} disabled={loading} className="w-full px-4 py-2 bg-blue-600 rounded uppercase">{loading?'Redirecting...':'Buy Monthly'}</button>
                    <button onClick={()=>handleSubscription('price_1RfJ54FVd7b5c6lTbljBBCOB')} disabled={loading} className="w-full px-4 py-2 bg-purple-600 rounded uppercase">{loading?'Redirecting...':'Buy Annual'}</button> </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
