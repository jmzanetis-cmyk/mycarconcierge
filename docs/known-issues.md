# Known Issues

Tracked here: bugs confirmed but deferred. Each entry has a one-line description and where to look.

---

## agent-matchmaker.js — bgc column name mismatch on profiles SELECT

`agent-matchmaker.js:121` queries `bgc_employees_total, bgc_employees_compliant` from `profiles`, but the migration (`supabase/migrations/20260422_bgc_employee_compliance.sql:68-69`) created those columns as `bgc_total_employees, bgc_compliant_employees` — causing `loadProviders()` to silently return null provider context to the LLM on every matchmaker run.
