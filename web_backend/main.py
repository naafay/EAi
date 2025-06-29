from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import stripe
import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Replace with Netlify domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # Use service role for server-side updates
stripe_webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

# ---------- MODELS ----------
class CheckoutSessionRequest(BaseModel):
    price_id: str
    customer_email: str

# ---------- ENDPOINTS ----------
@app.post("/create-checkout-session")
async def create_checkout_session(req: CheckoutSessionRequest):
    try:
        session = stripe.checkout.Session.create(
            success_url="https://outprio.netlify.app/dashboard",
            cancel_url="https://outprio.netlify.app/dashboard",
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{
                "price": req.price_id,
                "quantity": 1,
            }],
            customer_email=req.customer_email,
        )
        return {"url": session.url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, stripe_webhook_secret
        )
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        email = session.get('customer_email')

        if email:
            # Update Supabase profile for this user
            supabase_response = requests.patch(
                f"{supabase_url}/rest/v1/profiles?email=eq.{email}",
                headers={
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal"
                },
                data=json.dumps({
                    "is_paid": True
                })
            )

            if supabase_response.status_code not in [200, 204]:
                print("❌ Supabase update failed:", supabase_response.text)

    return {"status": "success"}


# ✅ Health check route for Render and browser testing
@app.get("/")
def root():
    return {"message": "Stripe backend is live!"}
