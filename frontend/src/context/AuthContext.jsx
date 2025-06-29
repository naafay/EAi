import React, { createContext, useEffect, useState, useContext } from 'react';
import { supabase } from '../utils/supabaseClient';
import dayjs from 'dayjs';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const currentSession = supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) fetchLicenseStatus(data.session.user.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchLicenseStatus(session.user.id);
      else setLicenseStatus(null);
    });

    setLoading(false);
    return () => listener?.subscription.unsubscribe();
  }, []);

  const fetchLicenseStatus = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      setLicenseStatus('error');
      return;
    }

    const today = dayjs();
    if (data.is_paid || today.isBefore(dayjs(data.trial_expires))) {
      setLicenseStatus('active');
    } else {
      setLicenseStatus('expired');
    }
  };

  return (
    <AuthContext.Provider value={{ session, licenseStatus, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);