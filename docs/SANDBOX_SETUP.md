# PayPal Sandbox Setup Guide

This document records the exact steps to configure sandbox accounts for Pawl. No credentials or secrets are stored in this document.

## 1. Sandbox App Setup

1. Log in to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard).
2. Toggle the dashboard environment switch to **Sandbox** (never Live).
3. Navigate to **Apps & Credentials** → **Sandbox** and click **Create App**.
4. Set App Type to **Merchant** and name it `pawl-guard-sandbox`.
5. Copy the generated **Client ID** and **Secret** to `.env.local`:
   ```bash
   PAYPAL_ENV=sandbox
   PAYPAL_CLIENT_ID=<YOUR_SANDBOX_CLIENT_ID>
   PAYPAL_CLIENT_SECRET=<YOUR_SANDBOX_CLIENT_SECRET>
   ```

## 2. Sandbox Accounts

1. Navigate to **Testing Tools** → **Sandbox Accounts**.
2. Identify the default business account (Merchant) associated with your sandbox app.
3. Create two Personal (Buyer) accounts:
   - **Buyer A**: Country: US, Currency: USD, with funded PayPal balance.
   - **Buyer B**: Country: US, Currency: USD, with funded PayPal balance.
4. Record their email addresses in `.env.local`:
   ```bash
   PAYPAL_BUYER_A_EMAIL=<BUYER_A_EMAIL>
   PAYPAL_BUYER_B_EMAIL=<BUYER_B_EMAIL>
   ```

## 3. Security Requirements

- `PAYPAL_ENV` MUST be set to `sandbox`. The application startup check enforces this and refuses to start if set to any other value or missing.
- Never commit `.env.local`. Ensure `.env.local` is present in `.gitignore`.
