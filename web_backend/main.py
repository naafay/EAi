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

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


class CheckoutSessionRequest(BaseModel):
    price_id: str
    customer_email: str


@app.post("/create-checkout-session")
async def create_checkout_session(req: CheckoutSessionRequest):
    try:
        checkout_session = stripe.checkout.Session.create(
            success_url="https://outprio.netlify.app/dashboard",
            cancel_url="https://outprio.netlify.app/dashboard",
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{"price": req.price_id, "quantity": 1}],
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

        try:
            subscription = stripe.Subscription.retrieve(subscription_id)
        except Exception as e:
            logging.error(f"❌ Stripe subscription fetch error: {e}")
            return {"status": "error", "message": "Failed to fetch subscription"}

        items = subscription.get("items", {}).get("data", [])
        if not items or not items[0].get("current_period_start") or not items[0].get("current_period_end"):
            logging.error("❌ Missing timestamps in subscription.items")
            return {"status": "error", "message": "Missing timestamps"}

        subscription_start = datetime.utcfromtimestamp(items[0]["current_period_start"]).isoformat()
        subscription_end = datetime.utcfromtimestamp(items[0]["current_period_end"]).isoformat()
        subscription_type = items[0]["plan"]["interval"]

        # Step 1: Get existing user from Supabase to compare old subscription
        supabase_query_url = f"{SUPABASE_URL}/rest/v1/profiles?email=eq.{customer_email}"
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"
        }
        user_response = requests.get(supabase_query_url, headers=headers)
        user_data = user_response.json()[0] if user_response.ok and user_response.json() else {}
        old_sub_id = user_data.get("subscription_id")

        # Step 2: Cancel old subscription if it's different
        if old_sub_id and old_sub_id != subscription_id:
            try:
                stripe.Subscription.modify(old_sub_id, cancel_at_period_end=True)
                logging.info(f"🔄 Canceled old subscription: {old_sub_id}")
            except Exception as e:
                logging.error(f"⚠️ Failed to cancel old subscription: {e}")

        # Step 3: Update Supabase
        supabase_update_url = f"{SUPABASE_URL}/rest/v1/profiles"
        update_headers = {
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
            f"{supabase_update_url}?email=eq.{customer_email}",
            json=payload,
            headers=update_headers
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


@app.post("/cancel-subscription/{subscription_id}")
def cancel_subscription(subscription_id: str):
    try:
        stripe.Subscription.modify(subscription_id, cancel_at_period_end=True)
        return {"status": "success", "message": "Subscription set to cancel at period end."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/resume-subscription/{subscription_id}")
def resume_subscription(subscription_id: str):
    try:
        stripe.Subscription.modify(subscription_id, cancel_at_period_end=False)
        return {"status": "success", "message": "Subscription resumed."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/upgrade-subscription")
async def upgrade_subscription(req: CheckoutSessionRequest):
    try:
        # Step 1: Get user's existing subscription
        user_email = req.customer_email
        supabase_url = f"{SUPABASE_URL}/rest/v1/profiles?email=eq.{user_email}"
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"
        }
        user_response = requests.get(supabase_url, headers=headers)
        user_data = user_response.json()[0]
        current_sub_id = user_data.get("subscription_id")

        if not current_sub_id:
            raise Exception("No existing subscription to upgrade.")

        # Step 2: Create new checkout session for annual plan
        session = stripe.checkout.Session.create(
            success_url="https://outprio.netlify.app/dashboard",
            cancel_url="https://outprio.netlify.app/dashboard",
            mode="subscription",
            payment_method_types=["card"],
            customer_email=user_email,
            line_items=[{
                "price": req.price_id,
                "quantity": 1
            }]
        )
        return {"url": session.url}
    except Exception as e:
        logging.error(f"❌ Upgrade error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
