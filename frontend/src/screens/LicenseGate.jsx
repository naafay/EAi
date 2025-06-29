import React from 'react';

const LicenseGate = () => {
  return (
    <div className="license-gate">
      <h2>Your license has expired</h2>
      <p>Please purchase a license to continue using OutPrio.</p>
      <a href="https://your-stripe-checkout-link.com" target="_blank" rel="noreferrer">
        Go to Payment
      </a>
    </div>
  );
};

export default LicenseGate;