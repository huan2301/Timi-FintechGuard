"""Local passive face liveness using a checksum-pinned MiniFASNet ONNX model.

This service protects against presentation attacks such as printed photos and
screen/video replay. It intentionally does *not* claim to guarantee capture
integrity: a web browser cannot reliably prove that a hostile client has not
injected a camera stream. The API therefore uses a short burst of distinct
frames, a fresh server request, and server-side model inference, but higher
assurance needs device attestation or a specialised liveness provider.
"""

from __future__ import annotations

import hashlib
import logging
import threading
from collections.abc import Sequence
from functools import lru_cache
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

from src.app.config import get_settings

_LOGGER = logging.getLogger(__name__)
_INFERENCE_LOCK = threading.Lock()


class PassiveLivenessUnavailableError(RuntimeError):
    """The local anti-spoofing model is absent, invalid, or cannot be loaded."""


def _get_cv2():
    try:
        import cv2
    except ImportError as exc:  # pragma: no cover - exercised by deployment
        raise PassiveLivenessUnavailableError(
            "OpenCV chưa được cài đặt cho Passive Liveness."
        ) from exc
    return cv2


def _resolve_model_path(configured_path: str) -> Path:
    path = Path(configured_path)
    return path if path.is_absolute() else get_settings().project_root / path


def _model_specs() -> tuple[tuple[Path, str, float], ...]:
    """Return the official MiniFASNet ensemble and its detector crop scales."""
    settings = get_settings()
    return (
        (
            _resolve_model_path(settings.face_liveness_model_path),
            settings.face_liveness_model_sha256,
            2.7,
        ),
        (
            _resolve_model_path(settings.face_liveness_v1se_model_path),
            settings.face_liveness_v1se_model_sha256,
            4.0,
        ),
    )


@lru_cache(maxsize=2)
def _load_model(path_string: str, expected_hash: str):
    """Load one checksum-pinned ONNX classifier once per worker."""
    path = Path(path_string)
    if not path.is_file():
        raise PassiveLivenessUnavailableError(
            "Thiếu model Passive Liveness trên máy chủ."
        )

    actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual_hash.lower() != expected_hash.lower():
        raise PassiveLivenessUnavailableError(
            "Model Passive Liveness không hợp lệ hoặc đã bị thay đổi."
        )

    try:
        return _get_cv2().dnn.readNetFromONNX(str(path))
    except Exception as exc:  # pragma: no cover - depends on OpenCV runtime
        raise PassiveLivenessUnavailableError(
            "Không thể khởi tạo model Passive Liveness."
        ) from exc


def _models() -> tuple[tuple[object, float], ...]:
    """Load MiniFASNet-V2 and V1SE, as used by the upstream ensemble."""
    return tuple(
        (_load_model(str(path), expected_hash), crop_scale)
        for path, expected_hash, crop_scale in _model_specs()
    )


def warm_passive_liveness_model() -> None:
    """Validate and preload both local anti-spoofing classifiers."""
    _models()


def _frame_to_rgb(frame_data: bytes | np.ndarray) -> np.ndarray:
    if isinstance(frame_data, bytes):
        with Image.open(BytesIO(frame_data)) as image:
            return np.asarray(image.convert("RGB"))

    image = np.asarray(frame_data)
    if image.ndim == 2:
        return np.stack((image, image, image), axis=-1).astype(np.uint8)
    if image.ndim != 3 or image.shape[2] < 3:
        raise ValueError("Khung hình Passive Liveness không hợp lệ.")
    return np.ascontiguousarray(np.clip(image[:, :, :3], 0, 255).astype(np.uint8))


def _expanded_face_crop(
    image_rgb: np.ndarray,
    face_box: Sequence[float],
    crop_scale: float = 2.7,
) -> np.ndarray:
    """Match the upstream MiniFASNet crop preprocessing for one model scale."""
    if len(face_box) < 4:
        raise ValueError("Không có vùng khuôn mặt để kiểm tra liveness.")
    x, y, width, height = (float(value) for value in face_box[:4])
    if not np.all(np.isfinite((x, y, width, height))) or width <= 0 or height <= 0:
        raise ValueError("Vùng khuôn mặt không hợp lệ.")

    image_height, image_width = image_rgb.shape[:2]
    # This is the upstream CropImage._get_new_box calculation. It expands the
    # detector box in both dimensions, then shifts (rather than pads) crops at
    # the image edges. A square crop based on the largest face side changes the
    # face scale substantially and can make a real webcam frame look spoofed.
    scale = min(
        (image_height - 1) / height,
        (image_width - 1) / width,
        crop_scale,
    )
    expanded_width = width * scale
    expanded_height = height * scale
    center_x = x + width / 2
    center_y = y + height / 2
    left = center_x - expanded_width / 2
    top = center_y - expanded_height / 2
    right = center_x + expanded_width / 2
    bottom = center_y + expanded_height / 2
    if left < 0:
        right -= left
        left = 0
    if top < 0:
        bottom -= top
        top = 0
    if right > image_width - 1:
        left -= right - image_width + 1
        right = image_width - 1
    if bottom > image_height - 1:
        top -= bottom - image_height + 1
        bottom = image_height - 1
    left = max(0, int(left))
    top = max(0, int(top))
    right = min(image_width, int(right) + 1)
    bottom = min(image_height, int(bottom) + 1)
    crop = image_rgb[top:bottom, left:right]
    if crop.shape[0] < 24 or crop.shape[1] < 24:
        raise ValueError("Khuôn mặt quá nhỏ để kiểm tra liveness.")
    return np.ascontiguousarray(crop)


def _softmax(values: np.ndarray) -> np.ndarray:
    shifted = values - np.max(values)
    exp_values = np.exp(shifted)
    return exp_values / np.sum(exp_values)


def _infer(image_rgb: np.ndarray, face_box: Sequence[float]) -> dict[str, float]:
    cv2 = _get_cv2()
    probability_sum = np.zeros(3, dtype=np.float64)
    with _INFERENCE_LOCK:
        for network, crop_scale in _models():
            crop_rgb = _expanded_face_crop(image_rgb, face_box, crop_scale)
            crop_bgr = cv2.cvtColor(crop_rgb, cv2.COLOR_RGB2BGR)
            blob = cv2.dnn.blobFromImage(
                crop_bgr,
                # These ONNX exports retain the upstream MiniFASNet input
                # contract: float32 BGR pixels in the original 0..255 range.
                # Normalising here forces both classifiers toward spoof class
                # 2, including for genuine captures.
                scalefactor=1.0,
                size=(80, 80),
                swapRB=False,
                crop=False,
            )
            network.setInput(blob)
            logits = np.asarray(network.forward(), dtype=np.float64).reshape(-1)
            if logits.size != 3 or not np.all(np.isfinite(logits)):
                raise PassiveLivenessUnavailableError(
                    "Model Passive Liveness trả về dữ liệu không hợp lệ."
                )
            # The upstream implementation adds per-model softmax predictions,
            # rather than trusting a single camera-sensitive classifier.
            probability_sum += _softmax(logits)
    probabilities = probability_sum / len(_models())
    # MiniFASNet's upstream test application treats only label 1 as a real
    # face; labels 0 and 2 are spoof classes. Do not change this order based
    # on an ONNX model-card description: doing so rejects genuine captures.
    return {
        "live_score": float(probabilities[1]),
        "spoof_class_0_score": float(probabilities[0]),
        "spoof_class_2_score": float(probabilities[2]),
    }


def passive_liveness_check(image_rgb: np.ndarray, face_box: Sequence[float]) -> dict:
    """Classify one detected face as live or a presentation attack."""
    try:
        scores = _infer(_frame_to_rgb(image_rgb), face_box)
        threshold = get_settings().face_liveness_live_threshold
        strongest_spoof_score = max(
            scores["spoof_class_0_score"],
            scores["spoof_class_2_score"],
        )
        # Upstream MiniFASNet decides by argmax: label 1 must beat both spoof
        # labels. Keep only a small ambiguity floor for near-uniform outputs;
        # a 0.65 binary-style threshold is invalid for this three-class model
        # and caused genuine webcam captures to be rejected.
        is_live = (
            scores["live_score"] >= threshold
            and scores["live_score"] > strongest_spoof_score
        )
        return {
            "is_live": is_live,
            "confidence": scores["live_score"],
            "indicators": {
                **scores,
                "strongest_spoof_score": strongest_spoof_score,
                "threshold": threshold,
            },
        }
    except PassiveLivenessUnavailableError:
        raise
    except Exception as exc:
        _LOGGER.exception("Passive liveness analysis failed.")
        raise PassiveLivenessUnavailableError(
            "Không thể phân tích Passive Liveness."
        ) from exc


def _fingerprint(face_rgb: np.ndarray) -> str:
    """Detect literal repeated frames without treating a still real user as spoof."""
    cv2 = _get_cv2()
    thumbnail = cv2.resize(face_rgb, (32, 32), interpolation=cv2.INTER_AREA)
    return hashlib.sha256(thumbnail.tobytes()).hexdigest()


def multiframe_liveness_check(
    frames: list[bytes | np.ndarray],
    face_boxes: list[Sequence[float]],
) -> dict:
    """Run passive liveness across a short capture burst.

    This enforces a configurable *small* minimum (default three), rather than
    assuming a fixed 8–15-frame capture. A strict majority must classify as
    live, so one frame affected by focus hunting cannot reject a genuine user;
    literal duplicate frames are still rejected as replay evidence.
    """
    settings = get_settings()
    if len(frames) < settings.face_liveness_min_frames:
        return {
            "is_live": False,
            "confidence": 0.0,
            "duplicate_detected": False,
            "indicators": {"error": "insufficient_frames"},
        }
    if len(frames) > settings.face_liveness_max_frames or len(face_boxes) != len(frames):
        return {
            "is_live": False,
            "confidence": 0.0,
            "duplicate_detected": False,
            "indicators": {"error": "invalid_capture_burst"},
        }

    results: list[dict] = []
    fingerprints: list[str] = []
    try:
        for frame, face_box in zip(frames, face_boxes, strict=True):
            image_rgb = _frame_to_rgb(frame)
            face_rgb = _expanded_face_crop(image_rgb, face_box)
            fingerprints.append(_fingerprint(face_rgb))
            results.append(passive_liveness_check(image_rgb, face_box))
    except PassiveLivenessUnavailableError:
        raise
    except Exception as exc:
        _LOGGER.exception("Passive liveness burst analysis failed.")
        raise PassiveLivenessUnavailableError(
            "Không thể kiểm tra chuỗi ảnh Passive Liveness."
        ) from exc

    duplicate_detected = len(set(fingerprints)) != len(fingerprints)
    confidences = [float(result["confidence"]) for result in results]
    live_frame_count = sum(bool(result["is_live"]) for result in results)
    required_live_frames = len(results) // 2 + 1
    return {
        "is_live": live_frame_count >= required_live_frames and not duplicate_detected,
        "confidence": float(np.mean(confidences)),
        "duplicate_detected": duplicate_detected,
        "indicators": {
            "frame_count": len(results),
            "live_frame_count": live_frame_count,
            "required_live_frames": required_live_frames,
            "min_live_score": float(min(confidences)),
            "average_live_score": float(np.mean(confidences)),
            "frame_results": results,
        },
    }
