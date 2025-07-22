from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from datetime import datetime
import stripe
import os
import logging
import requests
import traceback

load_dotenv()

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

# Set logging format
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


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
        logging.error(f"Create checkout session error: {e}")
        logging.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/cancel-subscription/{subscription_id}")
def cancel_subscription(subscription_id: str):
    logging.info(f"Attempting to cancel subscription: {subscription_id}")
    try:
        sub = stripe.Subscription.retrieve(subscription_id)
        logging.info(f"Current subscription state before cancel: {sub}")

        stripe.Subscription.modify(subscription_id, cancel_at_period_end=True)
        logging.info(f"Subscription {subscription_id} marked to cancel at period end.")

        return {"status": "success", "message": "Subscription set to cancel at period end."}
    except Exception as e:
        logging.error(f"Cancel subscription error: {e}")
        logging.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/resume-subscription/{subscription_id}")
def resume_subscription(subscription_id: str):
    logging.info(f"Attempting to resume subscription: {subscription_id}")
    try:
        sub = stripe.Subscription.retrieve(subscription_id)
        logging.info(f"Fetched subscription state: {sub}")

        if not sub.cancel_at_period_end:
            logging.info(f"Subscription {subscription_id} is already active, skipping resume.")
            return {"status": "noop", "message": "Subscription is already active."}

        updated = stripe.Subscription.modify(subscription_id, cancel_at_period_end=False)
        logging.info(f"Subscription {subscription_id} resumed: {updated}")

        customer = stripe.Customer.retrieve(updated.customer)
        customer_email = customer.get("email")
        logging.info(f"Resumed subscription linked to customer: {customer_email}")

        if customer_email:
            payload = {
                "is_paid": True,
                "subscription_end": datetime.utcfromtimestamp(updated["current_period_end"]).isoformat(),
                "subscription_type": updated["items"]["data"][0]["plan"]["interval"],
            }
            headers = {
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
            }
            response = requests.patch(
                f"{SUPABASE_URL}/rest/v1/profiles?email=eq.{customer_email}",
                json=payload,
                headers=headers
            )
            logging.info(f"Supabase update response: {response.status_code} - {response.text}")

        return {"status": "success", "message": "Subscription resumed."}

    except Exception as e:
        logging.error(f"Resume subscription error: {e}")
        logging.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
    except stripe.error.SignatureVerificationError:
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

        if not (customer_email and subscription_id):
            return {"status": "error", "message": "Missing data"}

        try:
            subscription = stripe.Subscription.retrieve(subscription_id)
        except Exception as e:
            return {"status": "error", "message": "Failed to fetch subscription"}

        items = subscription.get("items", {}).get("data", [])
        if not items:
            return {"status": "error", "message": "Missing items"}

        subscription_start = datetime.utcfromtimestamp(items[0]["current_period_start"]).isoformat()
        subscription_end = datetime.utcfromtimestamp(items[0]["current_period_end"]).isoformat()
        subscription_type = items[0]["plan"]["interval"]

        payload = {
            "is_paid": True,
            "subscription_id": subscription_id,
            "subscription_type": subscription_type,
            "subscription_start": subscription_start,
            "subscription_end": subscription_end
        }

        requests.patch(
            f"{SUPABASE_URL}/rest/v1/profiles?email=eq.{customer_email}",
            json=payload,
            headers=update_headers
        )

    elif event["type"] == "customer.subscription.updated":
        sub = event["data"]["object"]
        customer_id = sub["customer"]

        customer = stripe.Customer.retrieve(customer_id)
        customer_email = customer.get("email")
        if not customer_email:
            return {"status": "ignored"}

        subscription_end = datetime.utcfromtimestamp(sub["current_period_end"]).isoformat()
        is_paid = sub["status"] == "active" and not sub["cancel_at_period_end"]

        payload = {
            "subscription_end": subscription_end,
            "is_paid": is_paid,
            "subscription_type": sub["items"]["data"][0]["plan"]["interval"],
        }

        requests.patch(
            f"{SUPABASE_URL}/rest/v1/profiles?email=eq.{customer_email}",
            json=payload,
            headers=update_headers
        )

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
        logging.error(f"Get subscription info error: {e}")
        logging.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/upgrade-subscription")
async def upgrade_subscription(req: CheckoutSessionRequest):
    try:
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
            line_items=[{
                "price": req.price_id,
                "quantity": 1
            }]
        )
        return {"url": session.url}
    except Exception as e:
        logging.error(f"Upgrade subscription error: {e}")
        logging.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
