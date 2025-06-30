Inside renderSubscriptionDetails():

<button
  onClick={async () => {
    const confirmed = confirm("Are you sure you want to cancel your subscription?");
    if (confirmed) {
      const res = await fetch(`${BACKEND_URL}/cancel-subscription/${profile.subscription_id}`, {
        method: 'POST'
      });
      const data = await res.json();
      alert(data.message || 'Cancelled');
      window.location.reload();
    }
  }}
  className="bg-red-600 text-white px-3 py-1 rounded"
>
  Cancel Subscription
</button>

{subscriptionInfo?.cancel_at_period_end && (
  <button
    onClick={async () => {
      const confirmed = confirm("Do you want to resume your subscription?");
      if (confirmed) {
        const res = await fetch(`${BACKEND_URL}/resume-subscription/${profile.subscription_id}`, {
          method: 'POST'
        });
        const data = await res.json();
        alert(data.message || 'Resumed');
        window.location.reload();
      }
    }}
    className="bg-green-600 text-white px-3 py-1 rounded ml-2"
  >
    Resume Subscription
  </button>
)}
