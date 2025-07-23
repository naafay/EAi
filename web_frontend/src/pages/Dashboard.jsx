import { useEffect, useState, useRef, useNavigate } from 'react'; // Add useNavigate
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
  const [showModal, setShowModal] = useState(false); // Modal visibility
  const [modalMessage, setModalMessage] = useState(''); // Modal content
  const [confirmAction, setConfirmAction] = useState(null); // For confirmation actions
  const navigate = useNavigate(); // Add navigate hook
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
      setLoading(true);
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        navigate('/'); // Use navigate instead of window.location.href
        setLoading(false);
        return;
      }
      setUser(user);

      const { data, error: pfErr } = await supabase
        .from('profiles')
        .select('*, cancel_at_period_end')
        .eq('id', user.id)
        .single();

      if (!pfErr && data) {
        setProfile(data);
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
        setEmail(data.email || user.email || '');
      } else {
        console.error('Profile fetch error:', pfErr);
      }

      if (data.subscription_id) {
        try {
          const res = await fetch(
            `${BACKEND}/subscription-info/${data.subscription_id}`
          );
          if (res.ok) {
            const info = await res.json();
            console.log('Subscription info from Stripe:', info); // Debug log
            setSubscriptionInfo(info);
          } else {
            console.error('Failed to fetch subscription info:', res.status);
          }
        } catch (err) {
          console.error('Error fetching subscription info:', err);
        }
      }
      setLoading(false);
    })();
  }, [navigate]); // Add navigate to dependency array

  const saveProfile = async () => {
    setMessage('');
    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({ first_name: firstName, last_name: lastName })
      .eq('id', user.id);
    if (error) {
      setModalMessage(error.message);
      setShowModal(true);
    } else {
      setModalMessage('✅ Profile updated.');
      setShowModal(true);
      setEditing(false);
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    navigate('/'); // Use navigate instead of window.location.href
    setLoading(false);
  };

  const handleStartTrial = async () => {
    if (profile.trial_start) {
      setModalMessage('You have already started a trial.');
      setShowModal(true);
      return;
    }
    setLoading(true);
    try {
      const now = new Date();
      const expires = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const { error } = await supabase
        .from('profiles')
        .update({
          trial_start: now.toISOString().split('T')[0],
          trial_expires: expires.toISOString().split('T')[0],
        })
        .eq('id', user.id)
        .select();
      if (error) {
        console.error('Supabase trial update error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        setModalMessage(`Error starting trial: ${error.message} (Code: ${error.code})`);
        setShowModal(true);
        setLoading(false);
        return;
      }
      console.log('Trial started successfully');
      window.location.reload(); // Reloading might still be needed here
    } catch (err) {
      console.error('Unexpected error starting trial:', err);
      setModalMessage(`Unexpected error starting trial: ${err.message}`);
      setShowModal(true);
      setLoading(false);
    }
  };

  const handleSubscription = async (priceId) => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price_id: priceId, customer_email: email }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else {
        setModalMessage('Checkout error');
        setShowModal(true);
      }
    } catch (err) {
      setModalMessage(`Checkout error: ${err.message}`);
      setShowModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    if (!profile.subscription_id) {
      setModalMessage('No subscription to resume.');
      setShowModal(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${BACKEND}/resume-subscription/${profile.subscription_id}`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (data.status === 'success') {
        setModalMessage('Subscription resumed.');
        setShowModal(true);
        window.location.reload(); // Reloading might still be needed here
      } else {
        setModalMessage(`Failed to resume subscription: ${data.message || 'Unknown error'}`);
        setShowModal(true);
      }
    } catch (err) {
      setModalMessage(`Error resuming subscription: ${err.message}`);
      setShowModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!profile.subscription_id) {
      setModalMessage('No subscription to cancel.');
      setShowModal(true);
      return;
    }
    setModalMessage('Are you sure you want to cancel your subscription? You will retain access until the end of the billing cycle.');
    setConfirmAction(() => async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${BACKEND}/cancel-subscription/${profile.subscription_id}`,
          { method: 'POST' }
        );
        const data = await res.json();
        if (data.status === 'success') {
          setModalMessage('Subscription cancellation scheduled. You will retain access until the end of the billing cycle.');
          setShowModal(true);
          window.location.reload(); // Reloading might still be needed here
        } else {
          setModalMessage(`Failed to cancel subscription: ${data.message || 'Unknown error'}`);
          setShowModal(true);
        }
      } catch (err) {
        setModalMessage(`Error canceling subscription: ${err.message}`);
        setShowModal(true);
      } finally {
        setLoading(false);
        setConfirmAction(null);
      }
    });
    setShowModal(true);
  };

  const handleManageBilling = async () => {
    if (!subscriptionInfo || !subscriptionInfo.customer) {
      setModalMessage('No customer information available.');
      setShowModal(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/create-portal-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: subscriptionInfo.customer }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else {
        setModalMessage('Failed to open billing portal');
        setShowModal(true);
      }
    } catch (err) {
      setModalMessage(`Error: ${err.message}`);
      setShowModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setMessage('');
    setLoading(true);
    const resetEmail = user.email || profile.email;
    if (!resetEmail) {
      setModalMessage('Error: No valid email found for this user.');
      setShowModal(true);
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: resetEmail,
        options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + '/reset-password' },
      });
      if (error) throw error;
      setModalMessage('✅ OTP sent to your email. Redirecting to reset page...');
      setShowModal(true);
      setTimeout(() => navigate('/reset-password'), 1000); // Use navigate
    } catch (error) {
      setModalMessage(`Error sending OTP: ${error.message}`);
      setShowModal(true);
    }
    setLoading(false);
  };

  const handleModalConfirm = () => {
    if (confirmAction) {
      confirmAction();
    } else {
      setShowModal(false);
    }
  };

  const handleModalCancel = () => {
    setShowModal(false);
    setConfirmAction(null);
  };

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0b0b1a] to-[#37123d] flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-t-[#db69ab] border-[#0b0b1a] drop-shadow" />
      </div>
    );
  }

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

  if (subscriptionInfo && subscriptionInfo.status === 'active') {
    status = subscriptionInfo.cancel_at_period_end ? '❌ Scheduled to Cancel' : '✅ Paid';
    licenseType = subscriptionInfo.plan.interval === 'month' ? 'OutPrio Monthly' :
                  subscriptionInfo.plan.interval === 'year' ? 'OutPrio Annual' : 'Premium';
    startDate = subscriptionInfo.start_date ? new Date(subscriptionInfo.start_date * 1000) : null;
    endDate = subscriptionInfo.current_period_end ? new Date(subscriptionInfo.current_period_end * 1000) : null;
  } else if (subscriptionInfo && ['past_due', 'unpaid'].includes(subscriptionInfo.status)) {
    status = '⚠️ Payment Issue';
    licenseType = subscriptionInfo.plan.interval === 'month' ? 'OutPrio Monthly' :
                  subscriptionInfo.plan.interval === 'year' ? 'OutPrio Annual' : 'Premium';
    startDate = subscriptionInfo.start_date ? new Date(subscriptionInfo.start_date * 1000) : null;
    endDate = subscriptionInfo.current_period_end ? new Date(subscriptionInfo.current_period_end * 1000) : null;
  } else if (profile.is_paid) {
    status = profile.cancel_at_period_end ? '❌ Scheduled to Cancel' : '✅ Paid';
    licenseType = profile.subscription_type === 'month' ? 'OutPrio Monthly' :
                  profile.subscription_type === 'year' ? 'OutPrio Annual' : 'Premium';
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
      {/* Loading Spinner Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-t-[#db69ab] border-[#0b0b1a] drop-shadow" />
        </div>
      )}

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

      {/* Modal for Messages or Confirmation */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white/20 backdrop-blur-xl rounded-2xl p-6 max-w-md w-full border border-white/30 shadow-2xl glow-effect">
            <p className="text-gray-200 mb-4">{modalMessage}</p>
            {confirmAction ? (
              <div className="flex justify-between">
                <button
                  onClick={handleModalConfirm}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition-colors duration-300"
                >
                  Confirm
                </button>
                <button
                  onClick={handleModalCancel}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors duration-300"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowModal(false)}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors duration-300"
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}

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
          disabled={loading}
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
                    className="text-xl text-indigo-300 hover:text-indigo-400 transition-colors duration-300"
                    disabled={loading}
                  >
                    ✎
                  </button>
                ) : (
                  <div className="space-x-4">
                    <button
                      onClick={saveProfile}
                      className="text-xl text-teal-900 hover:text-teal-400 transition-colors duration-300"
                      disabled={loading}
                    >
                      ✔
                    </button>
                    <button
                      onClick={() => {
                        setEditing(false);
                        setFirstName(profile.first_name || '');
                        setLastName(profile.last_name || '');
                      }}
                      className="text-sm text-gray-700 hover:text-gray-500 transition-colors duration-300"
                      disabled={loading}
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
                    disabled={!editing || loading}
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
                    disabled={!editing || loading}
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
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold uppercase text-gray-200">License Information</h2>
                <div className="bg-white/20 p-4 rounded-xl backdrop-blur-md space-y-3 mt-3">
                  <div className="flex justify-between text-gray-300">
                    <span>Status</span>
                    <span className="font-medium">{status}</span>
                  </div>
                  {licenseType && (
                    <div className="flex justify-between text-gray-300">
                      <span>Plan</span>
                      <span className="font-medium capitalize">{licenseType}</span>
                    </div>
                  )}
                  {endDate && (
                    <div className="flex justify-between text-gray-300">
                      <span>
                        {status === '🧪 Trial Active' ? 'Trial Expiry' :
                         subscriptionInfo && subscriptionInfo.cancel_at_period_end ? 'Access Ends' : 'Next Billing'}
                      </span>
                      <span className="font-medium">{endDate.toLocaleDateString()}</span>
                    </div>
                  )}
                  {subscriptionInfo && subscriptionInfo.status === 'active' ? (
                    <div className="flex flex-col space-y-2">
                      {subscriptionInfo.cancel_at_period_end ? (
                        <button
                          onClick={handleResume}
                          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg"
                          disabled={loading}
                        >
                          Resume Subscription
                        </button>
                      ) : (
                        <>
                          {subscriptionInfo.plan.interval === 'month' && (
                            <button
                              onClick={() => handleSubscription('price_1RfJ54FVd7b5c6lTbljBBCOB')}
                              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg"
                              disabled={loading}
                            >
                              {loading ? 'Loading...' : 'Buy Annual ($39.9/yr)'}
                            </button>
                          )}
                          <button
                            onClick={handleCancel}
                            className="w-full px-4 py-2 bg-rose-700 text-white rounded-lg"
                            disabled={loading}
                          >
                            Cancel Subscription
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col space-y-2">
                      {subscriptionInfo && ['past_due', 'unpaid'].includes(subscriptionInfo.status) && (
                        <button
                          onClick={handleManageBilling}
                          className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg"
                          disabled={loading}
                        >
                          Update Payment Method
                        </button>
                      )}
                      {!trialStart && (
                        <button
                          onClick={handleStartTrial}
                          className="w-full px-6 py-2 bg-teal-600 rounded-xl text-white font-semibold"
                          disabled={loading}
                        >
                          Start Free 3-Day Trial
                        </button>
                      )}
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleSubscription('price_1RfIVDFVd7b5c6lTQrG7zUtJ')}
                          className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-xl"
                          disabled={loading}
                        >
                          {loading ? 'Loading...' : 'Monthly ($3.99/mo)'}
                        </button>
                        <button
                          onClick={() => handleSubscription('price_1RfJ54FVd7b5c6lTbljBBCOB')}
                          className="flex-1 px-3 py-2 bg-purple-600 text-white rounded-lg rounded-xl"
                          disabled={loading}
                        >
                          {loading ? 'Loading...' : 'Annual ($39.9/yr)'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}