"""Pseudonymous login/transaction telemetry and privacy-safe persistence helpers."""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from src.app.config import get_settings
from src.app.models.transaction_risk_context import TransactionRiskContext
from src.app.schemas.risk import RiskClientContextIn


@dataclass(frozen=True)
class RiskTelemetry:
    """Only derived values are carried beyond the HTTP request boundary."""

    device_hash: str | None
    ip_hash: str | None
    geo_lat_e2: int | None
    geo_lon_e2: int | None
    geo_accuracy_m: int | None
    observed_at: datetime

    @property
    def has_location(self) -> bool:
        return self.geo_lat_e2 is not None and self.geo_lon_e2 is not None

    @property
    def has_any_value(self) -> bool:
        return bool(self.device_hash or self.ip_hash or self.has_location)


def _pseudonymize(value: str) -> str:
    """Create a stable, keyed pseudonym without retaining the source value."""
    settings = get_settings()
    secret = settings.risk_telemetry_hash_key or settings.jwt_secret_key
    return hmac.new(secret.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).hexdigest()


def device_hash_from_id(device_id: str) -> str:
    """Return the stable keyed pseudonym used to bind a login to one browser."""
    return _pseudonymize(device_id)


def build_risk_telemetry(
    client_context: RiskClientContextIn | None,
    *,
    client_ip: str | None,
) -> RiskTelemetry:
    """Normalize untrusted client input before rules use or persist it."""
    latitude = client_context.geo_latitude if client_context is not None else None
    longitude = client_context.geo_longitude if client_context is not None else None
    accuracy = client_context.geo_accuracy_m if client_context is not None else None
    return RiskTelemetry(
        device_hash=(
            device_hash_from_id(client_context.device_id)
            if client_context is not None and client_context.device_id
            else None
        ),
        # Do not trust X-Forwarded-For here. A deployment may opt into trusted
        # proxy handling separately; this value is always the ASGI peer address.
        ip_hash=_pseudonymize(client_ip) if client_ip else None,
        geo_lat_e2=round(latitude * 100) if latitude is not None else None,
        geo_lon_e2=round(longitude * 100) if longitude is not None else None,
        geo_accuracy_m=round(accuracy) if accuracy is not None else None,
        observed_at=datetime.now(UTC),
    )


def persist_risk_telemetry(
    db: Session,
    *,
    user_id: object,
    transaction_id: object | None,
    telemetry: RiskTelemetry | None,
    event_type: str = "transaction_assessment",
) -> None:
    """Queue a context record in the same transaction as its source event."""
    if telemetry is None or not telemetry.has_any_value:
        return
    db.add(
        TransactionRiskContext(
            user_id=user_id,
            transaction_id=transaction_id,
            event_type=event_type,
            device_hash=telemetry.device_hash,
            ip_hash=telemetry.ip_hash,
            geo_lat_e2=telemetry.geo_lat_e2,
            geo_lon_e2=telemetry.geo_lon_e2,
            geo_accuracy_m=telemetry.geo_accuracy_m,
            created_at=telemetry.observed_at,
        )
    )
