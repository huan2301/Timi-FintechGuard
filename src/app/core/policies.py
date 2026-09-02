"""Fixed backend policies that are not deployment-time configuration."""

from datetime import timedelta

# Transfers are executed only by the backend. This cap is intentionally a code
# policy so a deployment environment variable cannot silently weaken it.
MAX_DAILY_OUTGOING_VND = 100_000_000

# New-device verification policy. Keep the challenge JWT and durable database
# record on the same lifetime.
DEVICE_LOGIN_CHALLENGE_TTL = timedelta(minutes=10)
DEVICE_LOGIN_RESEND_COOLDOWN = timedelta(seconds=60)
DEVICE_LOGIN_MAX_ATTEMPTS = 5

# A browser that completes device verification and coarse-location confirmation
# can sign in again without repeating either step during this window.
TRUSTED_LOGIN_DEVICE_TTL = timedelta(days=30)
