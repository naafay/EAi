import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const BACKEND_URL = 'https://eai-uuwt.onrender.com'; // Replace with your actual URL

  useEffect(() => {
    const fetchUserAndProfile = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        window.location.href = '/';
        return;
      }

      setUser(user);
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!profileError && profileData) {
        setProfile(profileData);
        setFirstName(profileData.first_name || '');
        setLastName(profileData.last_name || '');
        setEmail(profileData.email || '');
      }
    };

    fetchUserAndProfile();
  }, []);

  const handleSave = async () => {
    setMessage('');
    const { error } = await supabase
      .from('profiles')
      .update({ first_name: firstName, last_name: lastName })
      .eq('id', user.id);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('✅ Profile updated successfully.');
      setEditing(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const handleStartTrial = async () => {
    const now = new Date();
    const trialExpires = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const { error } = await supabase
      .from('profiles')
      .update({
        trial_start: now.toISOString(),
        trial_expires: trialExpires.toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      alert(error.message);
    } else {
      window.location.reload();
    }
  };

  const handleSubscription = async (priceId) => {
    if (!email) return alert('User email not loaded');
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price_id: priceId, customer_email: email }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert('Failed to initiate checkout session.');
      }
    } catch (err) {
      console.error(err);
      alert('Error creating checkout session.');
    } finally {
      setLoading(false);
    }
  };

  if (!user || !profile) return null;

  const today = new Date();
  const trialStart = profile.trial_start ? new Date(profile.trial_start) : null;
  const trialExpires = profile.trial_expires ? new Date(profile.trial_expires) : null;
  const isPaid = profile.is_paid;

  let licenseStatus = '⏳ Not Started';
  let daysRemaining = 0;

  if (isPaid) {
    licenseStatus = '✅ Paid Subscription Active';
  } else if (trialStart && trialExpires) {
    const daysLeft = Math.ceil((trialExpires - today) / (1000 * 60 * 60 * 24));
    daysRemaining = Math.max(0, daysLeft);
    licenseStatus = daysRemaining > 0 ? '🧪 Trial Active' : '⚠️ Trial Expired';
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-xl mx-auto bg-white rounded shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">Welcome, {firstName || 'User'}</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="text"
            value={email}
            disabled
            className="w-full border px-3 py-2 rounded bg-gray-100"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">First Name</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full border px-3 py-2 rounded"
            disabled={!editing}
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Last Name</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full border px-3 py-2 rounded"
            disabled={!editing}
          />
        </div>

        {message && <div className="text-sm text-green-600 mb-3">{message}</div>}

        <div className="flex gap-2 mb-6">
          {editing ? (
            <>
              <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded">
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="bg-gray-300 px-4 py-2 rounded"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              Edit Profile
            </button>
          )}
        </div>

        <hr className="my-6" />

        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">License Information</h3>
          <p>Status: <strong>{licenseStatus}</strong></p>
          {!isPaid && trialStart && (
            <p>Days Remaining: <strong>{daysRemaining}</strong></p>
          )}
        </div>

        {!trialStart && !isPaid && (
          <div className="mb-4">
            <button
              onClick={handleStartTrial}
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              Start Free 3-Day Trial
            </button>
          </div>
        )}

        {!isPaid && (
          <div className="mb-4 space-y-2">
            <button
              onClick={() => handleSubscription('price_1RfIVDFVd7b5c6lTQrG7zUtJ')}
              disabled={loading}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded"
            >
              {loading ? 'Redirecting...' : 'Buy Monthly Subscription'}
            </button>
            <button
              onClick={() => handleSubscription('price_1RfJ54FVd7b5c6lTbljBBCOB')}
              disabled={loading}
              className="w-full bg-blue-800 text-white px-4 py-2 rounded"
            >
              {loading ? 'Redirecting...' : 'Buy Annual Subscription'}
            </button>
          </div>
        )}

        <button
          onClick={handleLogout}
          className="bg-red-500 text-white px-4 py-2 rounded mt-6"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
