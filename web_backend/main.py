from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from datetime import datetime
import stripe
import os
import logging
import requests

load_dotenv()

app = FastAPI()

# Enable CORS for your Netlify frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Replace "*" with "https://yourdomain.netlify.app" for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Stripe setup
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
endpoint_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

# Supabase config
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# ========== MODELS ==========
class CheckoutSessionRequest(BaseModel):
    price_id: str
    customer_email: str

# ========== ROUTES ==========

@app.post("/create-checkout-session")
async def create_checkout_session(req: CheckoutSessionRequest):
    try:
        checkout_session = stripe.checkout.Session.create(
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
        return {"url": checkout_session.url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        customer_email = session.get("customer_email")
        subscription_id = session.get("subscription")

        if not (customer_email and subscription_id):
            logging.error("❌ Missing customer_email or subscription_id in session")
            return {"status": "error", "message": "Missing data"}

        # Retrieve full subscription details
        try:
            subscription = stripe.Subscription.retrieve(subscription_id)
        except Exception as e:
            logging.error(f"❌ Stripe subscription fetch error: {e}")
            return {"status": "error", "message": "Failed to fetch subscription"}

        # Extract timestamps from nested structure
        items = subscription.get("items", {}).get("data", [])
        if not items or not items[0].get("current_period_start") or not items[0].get("current_period_end"):
            logging.error("❌ Missing timestamps in subscription.items")
            logging.error(subscription)
            return {"status": "error", "message": "Missing timestamps in subscription.items"}

        subscription_start = datetime.utcfromtimestamp(items[0]["current_period_start"]).isoformat()
        subscription_end = datetime.utcfromtimestamp(items[0]["current_period_end"]).isoformat()
        subscription_type = items[0]["plan"]["interval"]

        # Update Supabase
        supabase_url = f"{SUPABASE_URL}/rest/v1/profiles"
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        payload = {
            "is_paid": True,
            "subscription_id": subscription_id,
            "subscription_type": subscription_type,
            "subscription_start": subscription_start,
            "subscription_end": subscription_end
        }

        response = requests.patch(
            f"{supabase_url}?email=eq.{customer_email}",
            json=payload,
            headers=headers
        )

        if response.status_code >= 300:
            logging.error(f"❌ Supabase update failed: {response.text}")
        else:
            logging.info("✅ Supabase updated successfully")

    return {"status": "success"}


@app.get("/subscription-info/{subscription_id}")
def get_subscription_info(subscription_id: str):
    try:
        sub = stripe.Subscription.retrieve(subscription_id)
        item = sub["items"]["data"][0]
        return {
            "id": sub.id,
            "status": sub.status,
            "start_date": item["current_period_start"],
            "current_period_start": item["current_period_start"],
            "current_period_end": item["current_period_end"],
            "cancel_at_period_end": sub.cancel_at_period_end,
            "plan": {
                "interval": item["plan"]["interval"],
                "amount": item["plan"]["amount"] / 100,
                "currency": item["plan"]["currency"]
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
