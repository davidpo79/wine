-- Weekly check for the partner: unpaid orders, payments, checkouts from Meta, where people stopped, errors.
-- Read only. Paste into Railway → Postgres → Data/Query. Returns one JSON. Period: last 7 days.
WITH p AS (SELECT now() - interval '7 days' AS since)
SELECT json_build_object(
  'period_since', (SELECT since FROM p),

  -- Orders by status in the period (paid = paid/preparing/shipped/delivered)
  'orders_by_status', (SELECT json_object_agg(status, json_build_object('orders', n, 'eur', eur)) FROM (
      SELECT status::text, count(*) n, round(sum(total_cents)/100.0, 2) eur
      FROM orders, p WHERE created_at >= p.since GROUP BY status) s),

  -- The "pending" ones: every unpaid order with an e-mail (the admin counter), with what was tried to pay
  'unpaid_orders', (SELECT json_agg(x ORDER BY x.created_at DESC) FROM (
      SELECT o.id, o.created_at, round(o.total_cents/100.0, 2) AS eur, o.bundle_key, o.country, o.locale,
             o.customer_name, o.email, (o.phone IS NOT NULL) AS has_phone, (o.shipping_address IS NOT NULL) AS has_address,
             o.utm->>'utm_source' AS utm_source, o.utm->>'utm_campaign' AS utm_campaign, o.source,
             (SELECT json_agg(json_build_object('method', pay.method, 'status', pay.status, 'eur', round(pay.amount_cents/100.0, 2), 'at', pay.created_at, 'expires', pay.expires_at) ORDER BY pay.created_at)
                FROM payments pay WHERE pay.order_id = o.id) AS payment_attempts
      FROM orders o WHERE o.status = 'pending_payment' AND o.email IS NOT NULL) x),

  -- Payment attempts in the period: method x status (Multibanco = reference generated, waiting to be paid)
  'payments_by_method_status', (SELECT json_agg(r) FROM (
      SELECT method, status, count(*) n, round(sum(amount_cents)/100.0, 2) eur
      FROM payments, p WHERE created_at >= p.since GROUP BY method, status ORDER BY method, status) r),

  -- Paid orders by source
  'paid_by_source', (SELECT json_agg(r) FROM (
      SELECT coalesce(utm->>'utm_source', '(none)') AS utm_source, count(*) n, round(sum(total_cents)/100.0, 2) eur
      FROM orders, p WHERE paid_at >= p.since GROUP BY 1 ORDER BY n DESC) r),

  -- Site funnel (our own counter, every visit, consent or not), all sources and Meta ads only
  'funnel_all', (SELECT json_object_agg(event_name, n) FROM (
      SELECT event_name, count(DISTINCT event_id) n FROM tracking_events, p
      WHERE sent_to = 'internal' AND created_at >= p.since GROUP BY event_name) f),
  'funnel_meta_ads', (SELECT json_object_agg(event_name, n) FROM (
      SELECT event_name, count(DISTINCT event_id) n FROM tracking_events, p
      WHERE sent_to = 'internal' AND source ILIKE 'meta%' AND created_at >= p.since GROUP BY event_name) f),

  -- What actually reached Meta: pixel / CAPI per event and status (skipped = no marketing consent)
  'sent_to_meta', (SELECT json_agg(r) FROM (
      SELECT sent_to, event_name, status, count(*) n FROM tracking_events, p
      WHERE sent_to IN ('pixel', 'capi') AND event_name IN ('InitiateCheckout', 'AddPaymentInfo', 'Purchase') AND created_at >= p.since
      GROUP BY 1, 2, 3 ORDER BY 1, 2, 3) r),

  -- Checkout visits from Meta ads that did not buy: the last thing each one did
  'meta_checkout_last_step', (SELECT json_object_agg(last_step, n) FROM (
      SELECT last_step, count(*) n FROM (
        SELECT DISTINCT ON (j.session_id) j.session_id,
               j.name || coalesce(' · ' || (j.props->>'field'), '') AS last_step
        FROM journey_events j, p
        WHERE j.created_at >= p.since AND j.source ILIKE 'meta%'
          AND j.session_id IN (SELECT session_id FROM journey_events, p WHERE created_at >= p.since AND path LIKE '/checkout%')
          AND j.session_id NOT IN (SELECT session_id FROM journey_events, p WHERE created_at >= p.since AND path LIKE '/obrigado%')
        ORDER BY j.session_id, j.created_at DESC) t
      GROUP BY last_step ORDER BY n DESC) s),

  -- Errors seen by customers in the checkout: payment errors and field errors
  'payment_errors', (SELECT json_agg(r) FROM (
      SELECT props->>'stage' AS stage, props->>'method' AS method, props->>'status' AS http, props->>'code' AS code, props->>'msg' AS msg, count(*) n
      FROM journey_events, p WHERE name = 'payment_error' AND created_at >= p.since GROUP BY 1, 2, 3, 4, 5 ORDER BY n DESC) r),
  'pay_clicks', (SELECT json_object_agg(method, n) FROM (
      SELECT props->>'method' AS method, count(*) n FROM journey_events, p WHERE name = 'pay_click' AND created_at >= p.since GROUP BY 1) r),
  'field_errors', (SELECT json_agg(r) FROM (
      SELECT props->>'field' AS field, props->>'msg' AS msg, count(*) n
      FROM journey_events, p WHERE name = 'field_error' AND created_at >= p.since GROUP BY 1, 2 ORDER BY n DESC LIMIT 15) r)
) AS report;
