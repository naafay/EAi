from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import stripe
import os
from dotenv import load_dotenv
import httpx

load_dotenv()

app = FastAPI()

# Allow CORS for Netlify frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Replace * with Netlify domain for stricter security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Stripe & Supabase configuration
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
endpoint_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
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

        if customer_email and subscription_id:
            # Update Supabase via REST API
            async with httpx.AsyncClient() as client:
                update_url = f"{SUPABASE_URL}/rest/v1/profiles?email=eq.{customer_email}"
                headers = {
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=representation"
                }
                update_body = {
                    "is_paid": True,
                    "subscription_id": subscription_id
                }
                await client.patch(update_url, headers=headers, json=update_body)

    return {"status": "success"}


@app.get("/subscription-info/{subscription_id}")
def get_subscription_info(subscription_id: str):
    try:
        sub = stripe.Subscription.retrieve(subscription_id)
        return {
            "id": sub.id,
            "status": sub.status,
            "start_date": sub.start_date,
            "current_period_start": sub.current_period_start,
            "current_period_end": sub.current_period_end,
            "cancel_at_period_end": sub.cancel_at_period_end,
            "plan": {
                "interval": sub.plan.interval,
                "amount": sub.plan.amount / 100,
                "currency": sub.plan.currency
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
