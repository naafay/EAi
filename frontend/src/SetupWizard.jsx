// src/SetupWizard.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from './utils/supabaseClient';

const STEPS = [
  'Welcome',
  'Outlook ID',
  'VIP Group',
  'Labels',
  'Preferences',
  'Review'
];

export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(1);

  // Wizard state
  const [appTitle,        setAppTitle]        = useState('Priority Mail');
  const [fullName,        setFullName]        = useState('');
  const [outlookEmail,    setOutlookEmail]    = useState('');
  const [vipGroupName,    setVipGroupName]    = useState('VIP');
  const [vipEmails,       setVipEmails]       = useState(
`Jon Doe <jon.doe@outlook.com>
Jane Roe <jane.roe@outlook.com>`
  );
  const [label5,          setLabel5]          = useState('Critical');
  const [label4,          setLabel4]          = useState('Major');
  const [label3,          setLabel3]          = useState('High');
  const [label2,          setLabel2]          = useState('Medium');
  const [fetchInterval,   setFetchInterval]   = useState(5);
  const [lookbackHours,   setLookbackHours]   = useState(3);
  const [entriesPerPage,  setEntriesPerPage]  = useState(50);
  const [defaultSort,     setDefaultSort]     = useState('Importance');

  // Prefill from Supabase profile
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (!session) return;
      supabase
        .from('profiles')
        .select('first_name,last_name,email')
        .eq('id', session.user.id)
        .single()
        .then(({ data: profile }) => {
          if (profile) {
            setFullName(`${profile.first_name} ${profile.last_name}`);
            setOutlookEmail(profile.email);
          }
        });
    });
  }, []);

  const next = () => setStep(s => Math.min(s + 1, STEPS.length));
  const back = () => setStep(s => Math.max(s - 1, 1));

  const finish = async () => {
    // 1) grab the current user id:
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) {
      alert('You must be logged in to save your settings.');
      return;
    }

    // 2) build the payload exactly as your backend expects
    const payload = {
      user_id:                user.id,
      app_title:              appTitle,
      full_name:              fullName,
      outlook_email:          outlookEmail,
      vip_group_name:         vipGroupName,
      vip_emails:             vipEmails
                                .split('\n')
                                .map(l => l.trim())
                                .filter(Boolean),
      label_5:                label5,
      label_4:                label4,
      label_3:                label3,
      label_2:                label2,
      fetch_interval_minutes: fetchInterval,
      lookback_hours:         lookbackHours,
      entries_per_page:       entriesPerPage,
      default_sort:           defaultSort.toLowerCase()
    };

    // 3) upsert it straight to Supabase
    const { error } = await supabase
      .from('user_settings')
      .upsert(payload);
    if (error) {
      alert(`Error saving settings: ${error.message}`);
      return;
    }

    // 4) notify parent that wizard is done
    onComplete(payload);
  };

  return (
    <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
      <div className="w-[900px] h-[600px] bg-white rounded-lg shadow-lg flex flex-col">
        {/* Progress bar with thin connecting line */}
        <div className="relative flex items-center px-8 py-4">
          <div className="absolute inset-x-8 top-1/2 h-px bg-gray-300" />
          <div className="relative flex w-full justify-between">
            {STEPS.map((title, i) => (
              <div key={i} className="flex flex-col items-center z-10">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${
                    i+1 <= step ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  {i+1}
                </div>
                <div className="mt-1 text-xs text-gray-700 text-center">
                  {title}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-8 flex flex-col justify-center space-y-6">
          {step === 1 && (
            <div className="space-y-2">
              <h2 className="text-lg font-medium">What would you like to call this app?</h2>
              <input
                type="text"
                value={appTitle}
                onChange={e => setAppTitle(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium">Outlook ID</h2>
              <div>
                <label className="block mb-1 text-sm">What’s your Outlook Alias?</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm">What's your Outlook Email Address?</label>
                <input
                  type="email"
                  value={outlookEmail}
                  onChange={e => setOutlookEmail(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium">VIP Group Setup</h2>
              <div>
                <label className="block mb-1 text-sm">What should we call your VIP group?</label>
                <input
                  type="text"
                  value={vipGroupName}
                  onChange={e => setVipGroupName(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm">
                  Enter the email addresses (one per line) in your VIP group
                </label>
                <textarea
                  rows={4}
                  value={vipEmails}
                  onChange={e => setVipEmails(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium">Give your four top-importance tiers meaningful names.</h2>
              {[5,4,3,2].map(tier => (
                <div key={tier}>
                  <label className="block mb-1 text-sm">
                    Tier {tier}{tier===5?' (highest)':''}
                  </label>
                  <input
                    type="text"
                    value={{5:label5,4:label4,3:label3,2:label2}[tier]}
                    onChange={e => {
                      const v = e.target.value;
                      if (tier===5) setLabel5(v);
                      if (tier===4) setLabel4(v);
                      if (tier===3) setLabel3(v);
                      if (tier===2) setLabel2(v);
                    }}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium">Fetch & Display Preferences</h2>
              {[
                { label: 'How often should we check for new mail? (minutes)', value:fetchInterval, setter:setFetchInterval },
                { label: 'How far back should we fetch unread mail? (hours)', value:lookbackHours, setter:setLookbackHours },
                { label: 'How many messages per page?', value:entriesPerPage, setter:setEntriesPerPage }
              ].map((fld,i) => (
                <div key={i}>
                  <label className="block mb-1 text-sm">{fld.label}</label>
                  <input
                    type="number"
                    value={fld.value}
                    onChange={e => fld.setter(+e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
              ))}
              <div>
                <label className="block mb-1 text-sm">Sort messages by default on…</label>
                <select
                  value={defaultSort}
                  onChange={e => setDefaultSort(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option>Importance</option>
                  <option>Date</option>
                </select>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="overflow-auto" style={{ maxHeight: 'calc(100% - 40px)' }}>
              <h2 className="text-lg font-medium mb-4">Review & Save</h2>
              <ul className="list-disc list-inside mb-4 text-gray-700 text-sm">
                <li><strong>App Title:</strong> {appTitle}</li>
                <li><strong>Outlook Alias:</strong> {fullName}</li>
                <li><strong>Outlook Address:</strong> {outlookEmail}</li>
                <li><strong>VIP Group:</strong> {vipGroupName}</li>
                <li><strong>VIP Addresses:</strong>
                  <ul className="list-decimal list-inside ml-4">
                    {vipEmails.split('\n').filter(Boolean).map((l,i) => <li key={i}>{l}</li>)}
                  </ul>
                </li>
                <li><strong>Labels:</strong> {label5}, {label4}, {label3}, {label2}</li>
                <li><strong>Fetch every:</strong> {fetchInterval} min</li>
                <li><strong>Look-back:</strong> {lookbackHours} hrs</li>
                <li><strong>Entries/page:</strong> {entriesPerPage}</li>
                <li><strong>Default sort:</strong> {defaultSort}</li>
              </ul>
              <p className="text-red-600 font-semibold text-sm">
                Please ensure Microsoft Outlook is running concurrently for this application to function correctly.
              </p>
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="p-4 border-t flex">
          {step > 1 && (
            <button
              onClick={back}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
            >
              Previous
            </button>
          )}
          {step < STEPS.length ? (
            <button
              onClick={next}
              className="ml-auto px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              Next
            </button>
          ) : (
            <button
              onClick={finish}
              className="ml-auto px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
            >
              Finish and Save to Cloud
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
