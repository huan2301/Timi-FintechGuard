# Patch guide: `scam_guardian_agent.py` (Phase 1)

Apply these changes on top of current `tuananh-dev-rieng` file.
Do **not** replace the whole file blindly — merge carefully.

## 1. Default prompt version → 0.3

```python
_PROMPT_VERSION = os.getenv("GUARDIAN_PROMPT_VERSION", "0.3")
```

## 2. Smarter conversation context (replace `_conversation_payload`)

```python
def _conversation_payload(
    state: GuardianConversationState,
    latest_text: str,
) -> dict[str, Any]:
    """Bound context: keep latest turns + any high-signal earlier turns."""
    HIGH_MARKERS = (
        "otp", "anydesk", "teamviewer", "công an", "cong an",
        "tài khoản an toàn", "tai khoan an toan", "chuyển tiền",
        "chuyen tien", "khóa tài khoản", "khoa tai khoan",
        "không được nói", "khong duoc noi", "mã pin", "mat khau",
    )
    segments_raw = list(state.segments)
    # Always keep last 10
    tail = segments_raw[-10:]
    head_candidates = segments_raw[:-10]
    important = []
    for speaker, text in head_candidates:
        low = text.lower()
        if any(m in low for m in HIGH_MARKERS):
            important.append((speaker, text))
    # Cap important early turns
    important = important[-6:]
    ordered = important + tail
    # Dedupe consecutive identical
    segments = []
    prev = None
    for speaker, text in ordered:
        item = {"speaker": speaker, "text": text[:500]}
        key = (speaker, item["text"])
        if key != prev:
            segments.append(item)
            prev = key
    return {
        "latest_transcript": latest_text[:1500],
        "conversation": segments[-16:],
        "task": "Return the next agent-owned risk decision as strict JSON only.",
    }
```

## 3. max_completion_tokens + JSON retry

In `analyze_with_guardian_agent`, change create() call:

```python
max_completion_tokens=900,  # was 500
response_format={"type": "json_object"},
```

Wrap the API call + parse in a retry loop (max 2 attempts):

```python
def analyze_with_guardian_agent(
    state: GuardianConversationState,
    latest_text: str,
    *,
    return_confidence: bool = False,
) -> GuardianRiskResult | tuple[GuardianRiskResult, float]:
    ...
    last_err: Exception | None = None
    for attempt in range(2):
        try:
            response = OpenAI(...).chat.completions.create(
                model=settings.guardian_agent_model,
                messages=[...],
                temperature=0,
                max_completion_tokens=900,
                response_format={"type": "json_object"},
            )
            decision = _parse_json(_response_text(response))
            conf = getattr(decision, "decision_confidence", None)
            if conf is None:
                conf = 0.7
            result = GuardianRiskResult(...)
            if return_confidence:
                return result, float(conf)
            return result
        except GuardianAgentUnavailableError as exc:
            last_err = exc
            msg = str(exc).lower()
            if attempt == 0 and (
                "json" in msg or "schema" in msg or "validate" in msg or "rỗng" in msg
            ):
                logger.warning("Guardian JSON fail attempt 1, retrying once")
                continue
            raise
        except Exception as exc:
            ...
            raise GuardianAgentUnavailableError(...) from exc
    raise last_err or GuardianAgentUnavailableError("Agent failed after retry")
```

## 4. Normalize `decision_confidence`

In `_normalize_decision_payload`, after building the dict:

```python
raw_conf = first("decision_confidence", "confidence", "decisionConfidence")
try:
    conf = float(raw_conf) if raw_conf is not None else 0.7
except (TypeError, ValueError):
    conf = 0.7
conf = max(0.0, min(1.0, conf))
# attach for parser — either add field to GuardianAgentDecision or return side-channel
```

Update `GuardianAgentDecision` schema (`src/app/schemas/guardian.py`):

```python
decision_confidence: float = Field(default=0.7, ge=0, le=1)
```

And in `_parse_json` / model_validate, keep the field.

## 5. Load max_tokens from prompt YAML if present

```python
def _load_prompt_config(version: str = "0.3") -> tuple[str, int]:
    ...
    max_tok = int((data or {}).get("max_completion_tokens") or 900)
    return prompt.strip(), max_tok
```

---

After patching, set:

```bash
export GUARDIAN_PROMPT_VERSION=0.3
```
