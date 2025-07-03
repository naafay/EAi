import React, { createContext, useEffect, useState, useContext } from 'react';
import { supabase } from '../utils/supabaseClient';
import dayjs from 'dayjs';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // initial session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) fetchLicenseStatus(data.session.user.id);
      setLoading(false);
    });

    // listen for changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchLicenseStatus(session.user.id);
      else setLicenseStatus(null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const fetchLicenseStatus = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_paid, trial_expires')
      .eq('id', userId)
      .single();

    if (error || !data) {
      setLicenseStatus('error');
    } else {
      const today = dayjs();
      setLicenseStatus(
        data.is_paid || today.isBefore(dayjs(data.trial_expires))
          ? 'active'
          : 'expired'
      );
    }
  };

  return (
    <AuthContext.Provider value={{ session, licenseStatus, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
