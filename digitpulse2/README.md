# DigitPulse 2 — Liquidity Intelligence V2

Standalone research dashboard for continuous Deriv synthetic-market observation.

## What is implemented
- 15-market universe: R_10/R_25/R_50/R_75/R_100, 1HZ10V/25V/50V/75V/100V, JD10/25/50/75/100.
- `active_symbols` validation plus 1000-tick `ticks_history` bootstrap and live `ticks` subscriptions.
- Request correlation via `req_id`; history data is read from `history.prices` and `history.times` rather than depending on `echo_req`.
- Bounded 1000-tick memory per market.
- Persistent in-session opportunity identities keyed by market + contract.
- Lifecycle memory with hysteresis: ABSENT → FORMING → BUILDING → MATURE → ABSORBING → EXHAUSTING → RIPE.
- Formation age, creation, persistence, maturity, pressure, absorption, exhaustion, release, danger and trajectory.
- Opportunity Radar ranks developing structures instead of simply ranking current market snapshots.
- Release Watch and Formation Ledger.
- Provenance drawer for each opportunity.
- Read-only public market-data architecture. No authentication, trading or DBot/T1/T2/T3 logic.

## Scientific boundary
“Liquidity” means observable statistical/psychological/structural opportunity formation inferred from tick sequences. It is not an order-book measurement and does not claim hidden trader intent or manipulation.

## Run
From the `digitpulse2` directory:

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```
