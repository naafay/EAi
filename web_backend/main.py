from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from datetime import datetime
import stripe
import os
import logging
import requests
import json

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
endpoint_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

class CheckoutSessionRequest(BaseModel):
    price_id: str
    customer_email: str

@app.post("/create-checkout-session")
async def create_checkout_session(req: CheckoutSessionRequest):
    try:
        logging.info(f"Creating checkout session for email: {req.customer_email}, price_id: {req.price_id}")
        checkout_session = stripe.checkout.Session.create(
            success_url="https://outprio.netlify.app/dashboard",
            cancel_url="https://outprio.netlify.app/dashboard",
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{"price": req.price_id, "quantity": 1}],
            customer_email=req.customer_email,
        )
        logging.info(f"Checkout session created: {checkout_session.url}")
        return {"url": checkout_session.url}
    except Exception as e:
        logging.error(f"Checkout session error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/cancel-subscription/{subscription_id}")
def cancel_subscription(subscription_id: str):
    try:
        logging.info(f"Attempting to cancel subscription: {subscription_id}")
        updated = stripe.Subscription.modify(subscription_id, cancel_at_period_end=True)
        logging.info(f"Subscription after cancellation request: {json.dumps(updated, indent=2)}")
        return {"status": "success", "message": "Subscription set to cancel at period end."}
    except Exception as e:
        logging.error(f"Cancel error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/resume-subscription/{subscription_id}")
def resume_subscription(subscription_id: str):
    try:
        logging.info(f"Attempting to resume subscription: {subscription_id}")
        sub = stripe.Subscription.retrieve(subscription_id)
        logging.info(f"Fetched subscription before resuming: {json.dumps(sub, indent=2)}")

        if not sub.cancel_at_period_end:
            logging.info("Subscription already active. No need to resume.")
            return {"status": "noop", "message": "Subscription is already active."}

        updated = stripe.Subscription.modify(subscription_id, cancel_at_period_end=False)
        logging.info(f"Subscription after resume request: {json.dumps(updated, indent=2)}")

        customer = stripe.Customer.retrieve(updated.customer)
        customer_email = customer.get("email")
        logging.info(f"Customer email associated with subscription: {customer_email}")

        if customer_email:
            current_period_end = updated["items"]["data"][0]["current_period_end"]
            subscription_type = updated["items"]["data"][0]["plan"]["interval"]

            payload = {
                "is_paid": True,
                "subscription_end": datetime.utcfromtimestamp(current_period_end).isoformat(),
                "subscription_type": subscription_type,
                "cancel_at_period_end": False,
            }
            headers = {
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
            }
            logging.info(f"Updating Supabase profile with: {payload}")
            max_retries = 3
            for attempt in range(max_retries):
                response = requests.patch(
                    f在此处输入代码"{SUPABASE_URL}/rest/v1/profiles?email=eq.{customer_email}",
                    json=payload,
                    headers=headers
                )
                if response.status_code == 200:
                    logging.info(f"Supabase update successful: {response.text}")
                    break
                logging.warning(f"Supabase update attempt {attempt + 1} failed: {response.status_code} {response.text}")
                if attempt == max_retries - 1:
                    logging.error("Max retries reached for Supabase update")
        return {"status": "success", "message": "Subscription resumed."}
    except Exception as e:
        logging.error(f"Resume error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
        logging.info(f"Received Stripe webhook event: {event['type']}")
    except stripe.error.SignatureVerificationError:
        logging.error("Invalid Stripe signature on webhook")
        raise HTTPException(status_code=400, detail="Invalid signature")

    update_headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        customer_email = session.get("customer_email")
        subscription_id = session.get("subscription")

        logging.info(f"Checkout completed for email: {customer_email}, subscription_id: {subscription_id}")

        if not (customer_email and subscription_id):
            return {"status": "error", "message": "Missing data"}

        subscription = stripe.Subscription.retrieve(subscription_id)
        items = subscription.get("items", {}).get("data", [])
        if not items:
            logging.error("No subscription items found in checkout session.")
            return {"status": "error", "message": "Missing items"}

        payload = {
            "is_paid": True,
            "subscription_id": subscription_id,
            "subscription_type": items[0]["plan"]["interval"],
            "subscription_start": datetime.utcfromtimestamp(items[0]["current_period_start"]).isoformat(),
            "subscription_end": datetime.utcfromtimestamp(items[0]["current_period_end"]).isoformat(),
            "cancel_at_period_end": subscription.get("cancel_at_period_end", False),
        }

        logging.info(f"Updating Supabase after checkout completion with: {payload}")
        max_retries = 3
        for attempt in range(max_retries):
            response = requests.patch(
                f"{SUPABASE_URL}/rest/v1/profiles?email=eq.{customer_email}",
                json=payload,
                headers=update_headers
            )
            if response.status_code == 200:
                logging.info(f"Supabase update successful: {response.text}")
                break
            logging.warning(f"Supabase update attempt {attempt + 1} failed: {response.status_code} {response.text}")
            if attempt == max_retries - 1:
                logging.error("Max retries reached for Supabase update")
        return {"status": "success"}

    elif event["type"] == "customer.subscription.updated":
        sub = event["data"]["object"]
        customer_id = sub["customer47"]
        customer = stripe.Customer.retrieve(customer_id)
        customer_email = customer.get("email")
        logging.info(f"Handling subscription update for customer email: {customer_email}")

        if not customer_email:
            logging.warning("Customer email not found in subscription update.")
            return {"status": "ignored"}

        items = sub.get("items", {}).get("data", [])
        if not items:
            logging.error("No subscription items found in subscription update.")
            return {"status": "error", "message": "Missing subscription items"}

        subscription_end = datetime.utcfromtimestamp(items[0]["current_period_end"]).isoformat()
        is_paid = sub["status"] == "active"  # Keep is_paid true for active subscriptions
        payload = {
            "subscription_end": subscription_end,
            "is_paid": is_paid,
            "subscription_type": items[0]["plan"]["interval"],
            "cancel_at_period_end": sub["cancel_at_period_end"],
        }

        logging.info(f"Updating Supabase after subscription update: {payload}")
        max_retries = 3
        for attempt in range(max_retries):
            response = requests.patch(
                f"{SUPABASE_URL}/rest/v1/profiles?email=eq.{customer_email}",
                json=payload,
                headers=update_headers
            )
            if response.status_code == 200:
                logging.info(f"Supabase update successful: {response.text}")
                break
            logging.warning(f"Supabase update attempt {attempt + 1} failed: {response.status_code} {response.text}")
            if attempt == max_retries - 1:
                logging.error("Max retries reached for Supabase update")
        return {"status": "success"}

    return {"status": "success"}

@app.get("/subscription-info/{subscription_id}")
def get_subscription_info(subscription_id: str):
    try:
        logging.info(f"Fetching subscription info for ID: {subscription_id}")
        sub = stripe.Subscription.retrieve(subscription_id)
        item = sub["items"]["data"][0]
        info = {
            "id": sub.id,
            "status": sub.status,
            "customer": sub.customer,
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
        logging.info(f"Subscription info: {info}")
        return info
    except Exception as e:
        logging.error(f"Error fetching subscription info: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/create-portal-session")
async def create_portal_session(req: dict):
    try:
        logging.info(f"Creating portal session for customer: {req.get('customer_id')}")
        session = stripe.billing_portal.Session.create(
            customer=req["customer_id"],
            return_url="https://outprio.netlify.app/dashboard",
        )
        logging.info(f"Portal session created: {session.url}")
        return {"url": session.url}
    except Exception as e:
        logging.error(f"Portal session error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upgrade-subscription")
async def upgrade_subscription(req: CheckoutSessionRequest):
    try:
        logging.info(f"Attempting to upgrade subscription for email: {req.customer_email}")
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

        session = stripe.checkout.Session.create(
            success_url="https://outprio.netlify.app/dashboard",
            cancel_url="https://outprio.netlify.app/dashboard",
            mode="subscription",
            payment_method_types=["card"],
            customer_email=user_email,
            line_items=[{"price": req.price_id, "quantity": 1}]
        )
        logging.info(f"Upgrade checkout session created: {session.url}")
        return {"url": session.url}
    except Exception as e:
        logging.error(f"❌ Upgrade error: {e}")
        raise HTTPException(status_code=500, detail=str(e))