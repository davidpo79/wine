---
description: Daily sales + Meta ads report with proposed actions (read only, never applies changes)
---
Produce the daily report for vinho.prendadenatal.com (brief section 11). Read only: never change budgets, statuses or ads.

1. Run `npm run report:daily -- --json` against production (`railway run --environment production npm run report:daily -- --json` if not running locally with the production DATABASE_URL). Summarize orders, revenue, AOV by bundle, pending Multibanco, the funnel and days left until the 30/11 cutoff.
2. Using the Meta Ads MCP (read only), for the campaign `WP_B2C_Natal26_Trilogia2160_Sales` fetch per ad, for today, yesterday, last 3 days and since launch: spend, impressions, CTR, purchases (offsite_conversion.fb_pixel_purchase), CPA, purchase value and ROAS.
3. Reconcile Meta purchases with paid orders that have utm_source=meta (from Postgres) and flag big gaps.
4. Apply the rules from brief section 10 and PROPOSE actions only, each one requiring David's approval:
   - Target CPA €18, break-even ~€35, kill threshold €36 spent with no purchase.
   - Day 3 to 5: an ad with spend ≥ 2x target CPA (€36) and 0 purchases → propose pause.
   - Winners (CPA < €18 with ≥ 3 purchases) → propose +20% budget, at most once per 48h per entity (check the account activity log for the last budget change).
5. Output: a short table per ad, then a numbered list of proposed actions with the reason. End with: "Nenhuma alteração foi aplicada. Responda com os números das ações que aprova."
