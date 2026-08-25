# Timi Video Demo Script (target: 4 minutes 30 seconds)

This is the recording script for the required video deliverable. Do not record
real credentials, personal data, API keys, or an unredacted database URL.

## Shot list

1. **0:00–0:25 — Problem**
   - State that social-engineering calls and risky transfers can cause users to
     disclose OTP/PIN or send money to a suspicious recipient.

2. **0:25–1:20 — Safe transfer**
   - Log in with a demo account.
   - Open Transfer, resolve the recipient, enter a small demo amount, and show
     the risk assessment and explainability panel.

3. **1:20–2:20 — Suspicious transfer**
   - Use the prepared scam-note case from `eval/manual_cases.md`.
   - Show the warning, risk signals, human confirmation step, and blocked/paused
     action. Do not complete a real transfer.

4. **2:20–3:35 — Scam Guardian call**
   - Start the Guardian flow with a synthetic script.
   - Show transcript consent, the alert level, signals, recommendation, and the
     fail-closed behavior when the agent is unavailable.

5. **3:35–4:05 — Evidence**
   - Show `eval/results/report.md`, the 32-case baseline summary, and the test
     command output.

6. **4:05–4:30 — Architecture and impact**
   - Show the architecture diagram, mention deterministic risk boundaries,
     backend-only provider keys, CI/CD, and the next optimization target:
     Guardian latency.

## Acceptance checklist

- [ ] MP4 is no longer than 5 minutes.
- [ ] No real secrets, tokens, account numbers, or private user data appear.
- [ ] Both transfer-risk and Guardian flows are visible.
- [ ] Evaluation evidence and CI status are shown on screen.
- [ ] Final file is uploaded to the team’s approved Drive/YouTube location and
      linked from `presentation/README.md`.

