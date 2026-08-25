"""Lightweight local face matching using OpenCV Zoo SFace and YuNet."""

from __future__ import annotations

import base64
import hashlib
import io
import logging
import os
import threading
import urllib.request
from functools import lru_cache

from fastapi import HTTPException, status

from src.app.config import get_settings

_SFACE_URL = "https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"
_YUNET_URL = "https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
_MODEL_SHA256 = {
    "face_detection_yunet_2023mar.onnx": "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    "face_recognition_sface_2021dec.onnx": "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
}
_MODEL_INFERENCE_LOCK = threading.Lock()
_LOGGER = logging.getLogger(__name__)


def _download_model(url: str, filename: str) -> str:
    configured_directory = get_settings().face_model_dir
    directory = (
        configured_directory
        if os.path.isabs(configured_directory)
        else os.path.join(str(get_settings().project_root), configured_directory)
    )
    os.makedirs(directory, exist_ok=True)
    path = os.path.join(directory, filename)
    expected_hash = _MODEL_SHA256.get(filename)
    if expected_hash is None:
        raise HTTPException(status_code=503, detail="Model face OpenCV không nằm trong danh sách tin cậy.")

    def is_verified_model(candidate: str) -> bool:
        if not os.path.isfile(candidate) or os.path.getsize(candidate) < 100_000:
            return False
        digest = hashlib.sha256()
        with open(candidate, "rb") as model_file:
            for chunk in iter(lambda: model_file.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest() == expected_hash

    if is_verified_model(path):
        return path
    if not get_settings().face_model_allow_download:
        raise HTTPException(status_code=503, detail="Model face OpenCV chưa có hoặc không hợp lệ.")

    temporary = f"{path}.part"
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "FintechGuard/1.0"})
        with urllib.request.urlopen(request, timeout=45) as response, open(temporary, "wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        if not is_verified_model(temporary):
            raise ValueError(f"SHA-256 mismatch for {filename}")
        os.replace(temporary, path)
    except Exception as exc:
        try:
            os.remove(temporary)
        except OSError:
            pass
        raise HTTPException(status_code=503, detail="Chưa tải được model face OpenCV. Hãy thử lại sau.") from exc
    return path

def _image_bytes(data_url: str) -> bytes:
    try:
        encoded = data_url.split(",", 1)[1] if "," in data_url else data_url
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, IndexError) as exc:
        raise HTTPException(status_code=422, detail="Ảnh khuôn mặt không hợp lệ") from exc
    if not raw or len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="Ảnh khuôn mặt phải có dung lượng tối đa 5 MB")
    return raw


@lru_cache(maxsize=1)
def _model():
    try:
        import cv2
    except ImportError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Face AI chưa được cài đặt. Chạy pip install -r requirements.txt.") from exc
    try:
        recognizer = cv2.FaceRecognizerSF.create(_download_model(_SFACE_URL, "face_recognition_sface_2021dec.onnx"), "")
        detector = cv2.FaceDetectorYN.create(_download_model(_YUNET_URL, "face_detection_yunet_2023mar.onnx"), "", (320, 320), 0.65, 0.3, 5000)
    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise
        _LOGGER.exception("OpenCV face models could not be initialized from %s", get_settings().face_model_dir)
        raise HTTPException(status_code=503, detail="Không thể khởi tạo model face OpenCV.") from exc
    return cv2, detector, recognizer


def _embedding(raw: bytes):
    try:
        from PIL import Image
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Face AI chưa được cài đặt") from exc
    model, detector, recognizer = _model()
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Không thể đọc ảnh khuôn mặt") from exc
    image = _crop_primary_face(image)
    frame = model.cvtColor(__import__("numpy").asarray(image), model.COLOR_RGB2BGR)
    with _MODEL_INFERENCE_LOCK:
        detector.setInputSize((frame.shape[1], frame.shape[0]))
        _, faces = detector.detect(frame)
    if faces is None or len(faces) == 0:
        raise HTTPException(status_code=422, detail="Không thể căn chỉnh khuôn mặt. Hãy nhìn thẳng camera và giữ yên.")
    face = max(faces, key=lambda item: float(item[2]) * float(item[3]))
    with _MODEL_INFERENCE_LOCK:
        aligned = recognizer.alignCrop(frame, face)
        feature = recognizer.feature(aligned)
    return feature / max(float((feature ** 2).sum() ** 0.5), 1e-8)


@lru_cache(maxsize=1)
def _face_detector():
    """Return OpenCV's local Haar detector for fast quality checks."""
    try:
        import cv2
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face detector chưa được cài đặt. Chạy pip install -r requirements.txt.",
        ) from exc
    detector = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    if detector.empty():
        raise HTTPException(status_code=503, detail="Không thể khởi tạo bộ nhận diện khuôn mặt")
    return cv2, detector


@lru_cache(maxsize=1)
def _feature_detectors():
    """Load OpenCV's bundled eye cascade for a fast obstruction hint."""
    cv2, _ = _face_detector()
    data_path = cv2.data.haarcascades
    eyes = cv2.CascadeClassifier(data_path + "haarcascade_eye.xml")
    if eyes.empty():
        return None
    return cv2, eyes


def _obstruction_rule(image, face_box) -> str:
    """Reject frames where the eyes or mouth area is hidden by an object."""
    import numpy as np

    x, y, width, height = map(int, face_box)
    face = np.asarray(image)[y : y + height, x : x + width]
    if face.size == 0:
        return "obstructed_face"
    # A dedicated obstruction model is outside this local flow. Do not reject
    # prescription glasses or normal camera compression based on Haar guesses.
    return "ready"


def _crop_primary_face(image):
    """Keep only one clear, largest face so enrollment and checks use identical input."""
    import numpy as np

    cv2, detector, _ = _model()
    rgb = np.asarray(image)
    frame = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    with _MODEL_INFERENCE_LOCK:
        detector.setInputSize((frame.shape[1], frame.shape[0]))
        _, detected = detector.detect(frame)
    faces = [] if detected is None else [face[:4] for face in detected]
    if len(faces) == 0:
        raise HTTPException(
            status_code=422,
            detail="Không nhìn thấy khuôn mặt. Hãy đưa mặt vào giữa khung hình, đến gần hơn và chọn nơi đủ sáng.",
        )
    # Ignore distant background faces, but reject photos containing two people
    # standing equally close to the camera.
    ordered_faces = sorted(faces, key=lambda face: int(face[2]) * int(face[3]), reverse=True)
    if len(ordered_faces) > 1:
        primary_area = int(ordered_faces[0][2]) * int(ordered_faces[0][3])
        second_area = int(ordered_faces[1][2]) * int(ordered_faces[1][3])
        if second_area >= primary_area * 0.55:
            raise HTTPException(
                status_code=422,
                detail="Ảnh có nhiều khuôn mặt. Chỉ để khuôn mặt của bạn trong khung hình rồi thử lại.",
            )

    x, y, width, height = map(int, ordered_faces[0])
    image_width, image_height = image.size
    face_center_x = (x + width / 2) / image_width
    face_center_y = (y + height / 2) / image_height
    # Webcam crops vary considerably across laptop/phone cameras. Keep enough
    # margin for a reliable embedding without forcing a pixel-perfect center.
    if not 0.20 <= face_center_x <= 0.80 or not 0.18 <= face_center_y <= 0.82:
        if face_center_x < 0.20:
            detail = "Khuôn mặt đang lệch sang trái. Hãy dịch mặt sang phải một chút."
        elif face_center_x > 0.80:
            detail = "Khuôn mặt đang lệch sang phải. Hãy dịch mặt sang trái một chút."
        elif face_center_y < 0.24:
            detail = "Khuôn mặt đang quá cao. Hãy hạ camera hoặc đưa mặt xuống một chút."
        else:
            detail = "Khuôn mặt đang quá thấp. Hãy nâng camera hoặc đưa mặt lên một chút."
        raise HTTPException(status_code=422, detail=detail)
    if x < image_width * 0.01 or y < image_height * 0.01 or x + width > image_width * 0.99 or y + height > image_height * 0.99:
        if x < image_width * 0.01:
            detail = "Phần mặt bên trái đang sát mép hoặc ra khỏi khung. Hãy dịch mặt sang phải."
        elif x + width > image_width * 0.99:
            detail = "Phần mặt bên phải đang sát mép hoặc ra khỏi khung. Hãy dịch mặt sang trái."
        elif y < image_height * 0.02:
            detail = "Phần trán đang sát mép trên. Hãy hạ mặt hoặc điều chỉnh camera xuống."
        else:
            detail = "Phần cằm đang sát mép dưới. Hãy nâng mặt hoặc điều chỉnh camera lên."
        raise HTTPException(status_code=422, detail=detail)
    if width < image_width * 0.18 or height < image_height * 0.18:
        raise HTTPException(
            status_code=422,
            detail="Khuôn mặt chưa đủ gần. Hãy đưa mặt lại gần camera hơn.",
        )
    if width > image_width * 0.84 or height > image_height * 0.84:
        raise HTTPException(
            status_code=422,
            detail="Khuôn mặt đang quá gần camera. Hãy lùi ra xa một chút để thấy trọn khuôn mặt.",
        )
    if _obstruction_rule(image, ordered_faces[0]) != "ready":
        raise HTTPException(
            status_code=422,
            detail="Vui lòng loại bỏ các vật cản khỏi khuôn mặt trước khi quét.",
        )
    face_region = np.asarray(image)[y : y + height, x : x + width]
    gray = cv2.cvtColor(face_region, cv2.COLOR_RGB2GRAY)
    brightness = float(gray.mean())
    if brightness < 45 or brightness > 225:
        raise HTTPException(
            status_code=422,
            detail="Ảnh chưa đủ sáng hoặc bị chói sáng. Hãy đến nơi ánh sáng đều hơn.",
        )
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if sharpness < 15:
        raise HTTPException(
            status_code=422,
            detail="Khuôn mặt đang bị mờ. Hãy giữ camera và khuôn mặt yên khi chụp.",
        )
    # A small margin preserves chin, forehead and face contour, but excludes background.
    margin = int(max(width, height) * 0.18)
    left = max(0, x - margin)
    top = max(0, y - margin)
    right = min(image.width, x + width + margin)
    bottom = min(image.height, y + height + margin)
    return image.crop((left, top, right, bottom))


def _normalize_face_lighting(image):
    """Apply a small, deterministic exposure correction before inference."""
    import numpy as np
    from PIL import ImageEnhance

    pixels = np.asarray(image.convert("L"), dtype=np.float32)
    mean = float(pixels.mean())
    gain = max(0.8, min(1.35, 128.0 / max(mean, 1.0)))
    corrected = ImageEnhance.Brightness(image).enhance(gain)
    return ImageEnhance.Contrast(corrected).enhance(1.08)


def warm_face_model() -> None:
    """Load the lightweight OpenCV models before the first face request."""
    _model()
    _face_detector()


def embedding_from_data_url(data_url: str) -> list[float]:
    """Produce a normalized SFace embedding suitable for encrypted DB storage."""
    return _embedding(_image_bytes(data_url)).squeeze(0).tolist()


def face_quality_rule_from_data_url(data_url: str) -> str:
    """Return quality using YuNet, with Haar fallback while models download."""
    try:
        __import__("cv2")
    except ModuleNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face AI chưa được cài đặt. Hãy chạy pip install -r requirements.txt bằng đúng Python environment.",
        ) from exc
    import numpy as np
    from PIL import Image

    raw = _image_bytes(data_url)
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=422, detail="invalid_image") from exc
    rgb = np.asarray(image)
    try:
        cv2_module, detector, _ = _model()
        frame = cv2_module.cvtColor(rgb, cv2_module.COLOR_RGB2BGR)
        with _MODEL_INFERENCE_LOCK:
            detector.setInputSize((frame.shape[1], frame.shape[0]))
            _, detected = detector.detect(frame)
        faces = [] if detected is None else [face[:4] for face in detected]
    except HTTPException as exc:
        if exc.status_code != status.HTTP_503_SERVICE_UNAVAILABLE:
            raise
        # Quality feedback must not freeze while the optional DNN files are
        # downloading. Final enrollment/verification still requires SFace.
        cv2_module, haar_detector = _face_detector()
        gray = cv2_module.cvtColor(rgb, cv2_module.COLOR_RGB2GRAY)
        faces = haar_detector.detectMultiScale(
            gray, scaleFactor=1.08, minNeighbors=4, minSize=(20, 20)
        )
    if len(faces) == 0:
        return "no_face"
    ordered = sorted(faces, key=lambda face: int(face[2]) * int(face[3]), reverse=True)
    if len(ordered) > 1:
        first_area = int(ordered[0][2]) * int(ordered[0][3])
        second_area = int(ordered[1][2]) * int(ordered[1][3])
        if second_area >= first_area * 0.55:
            return "multiple_faces"
    x, y, width, height = map(int, ordered[0])
    image_width, image_height = image.size
    center_x = (x + width / 2) / image_width
    center_y = (y + height / 2) / image_height
    if not 0.20 <= center_x <= 0.80 or not 0.18 <= center_y <= 0.82:
        if center_x < 0.20:
            return "off_center_left"
        if center_x > 0.80:
            return "off_center_right"
        if center_y < 0.24:
            return "off_center_top"
        return "off_center_bottom"
    if x < image_width * 0.01 or y < image_height * 0.01 or x + width > image_width * 0.99 or y + height > image_height * 0.99:
        if x < image_width * 0.01:
            return "off_center_left"
        if x + width > image_width * 0.99:
            return "off_center_right"
        if y < image_height * 0.02:
            return "off_center_top"
        return "off_center_bottom"
    if width < image_width * 0.18 or height < image_height * 0.18:
        return "too_far"
    if width > image_width * 0.84 or height > image_height * 0.84:
        return "too_near"
    obstruction = _obstruction_rule(image, ordered[0])
    if obstruction != "ready":
        return obstruction
    face_gray = cv2_module.cvtColor(rgb[y : y + height, x : x + width], cv2_module.COLOR_RGB2GRAY)
    if float(face_gray.mean()) < 45 or float(face_gray.mean()) > 225:
        return "lighting"
    if float(cv2_module.Laplacian(face_gray, cv2_module.CV_64F).var()) < 15:
        return "blurry"
    return "ready"


def face_pose_from_data_url(data_url: str) -> str | None:
    """Estimate left/right head pose from YuNet's facial landmarks."""
    import numpy as np
    from PIL import Image

    try:
        image = Image.open(io.BytesIO(_image_bytes(data_url))).convert("RGB")
        cv2_module, detector, _ = _model()
        frame = cv2_module.cvtColor(np.asarray(image), cv2_module.COLOR_RGB2BGR)
        with _MODEL_INFERENCE_LOCK:
            detector.setInputSize((frame.shape[1], frame.shape[0]))
            _, detected = detector.detect(frame)
        if detected is None or len(detected) == 0:
            return None
        face = max(detected, key=lambda item: float(item[2]) * float(item[3]))
        landmarks = np.asarray(face[4:14], dtype=np.float32).reshape(5, 2)
        eye_center_x = float((landmarks[0, 0] + landmarks[1, 0]) / 2.0)
        nose_x = float(landmarks[2, 0])
        yaw = (nose_x - eye_center_x) / max(float(face[2]), 1.0)
        if yaw < -0.075:
            return "left"
        if yaw > 0.075:
            return "right"
        return "center"
    except Exception:
        return None


def validate_face_quality_from_data_url(data_url: str) -> None:
    rule = face_quality_rule_from_data_url(data_url)
    if rule != "ready":
        raise HTTPException(status_code=422, detail=f"FACE_QUALITY:{rule}")


def aggregate_embeddings(embeddings: list[list[float]] | list[tuple[float, ...]]):
    """Average several accepted frames into a stable reference embedding."""
    import numpy as np

    if not embeddings:
        raise HTTPException(status_code=422, detail="Không có dữ liệu khuôn mặt để tổng hợp.")
    matrix = np.asarray(embeddings, dtype=np.float32)
    if matrix.ndim != 2:
        raise HTTPException(status_code=422, detail="Dữ liệu embedding khuôn mặt không hợp lệ.")
    mean = matrix.mean(axis=0)
    norm = float(np.linalg.norm(mean))
    if norm < 1e-8:
        raise HTTPException(status_code=422, detail="Embedding trung bình của khuôn mặt không hợp lệ.")
    return mean / norm


def validate_multiframe_liveness(image_data_urls: list[str]) -> dict:
    """Validate a short camera burst before Face Match or enrollment.

    Quality, face detection and passive anti-spoofing all execute server-side.
    A caller cannot turn liveness into a client-side/UI-only check by posting a
    single cropped photo directly to the verification endpoint.
    """
    import numpy as np
    from PIL import Image

    from src.app.services.passive_liveness import (
        PassiveLivenessUnavailableError,
        multiframe_liveness_check,
        warm_passive_liveness_model,
    )

    settings = get_settings()
    if not image_data_urls:
        raise HTTPException(status_code=422, detail="Không có ảnh khuôn mặt để kiểm tra.")
    if len(image_data_urls) < settings.face_liveness_min_frames:
        raise HTTPException(
            status_code=422,
            detail="Cần thu thêm một vài khung hình từ camera để kiểm tra người thật.",
        )
    if len(image_data_urls) > settings.face_liveness_max_frames:
        raise HTTPException(status_code=422, detail="Số lượng khung hình khuôn mặt không hợp lệ.")

    try:
        warm_passive_liveness_model()
    except PassiveLivenessUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model Passive Liveness chưa sẵn sàng trên máy chủ.",
        ) from exc

    frames: list[np.ndarray] = []
    face_boxes: list[tuple[int, int, int, int]] = []
    for data_url in image_data_urls:
        try:
            image = Image.open(io.BytesIO(_image_bytes(data_url))).convert("RGB")
            rgb = np.asarray(image)
            cv2, detector, _ = _model()
            frame = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            with _MODEL_INFERENCE_LOCK:
                detector.setInputSize((frame.shape[1], frame.shape[0]))
                _, detected = detector.detect(frame)
            faces = [] if detected is None else [face[:4] for face in detected]
            if not faces:
                raise ValueError("missing_face")
            ordered_faces = sorted(
                faces,
                key=lambda item: float(item[2]) * float(item[3]),
                reverse=True,
            )
            if len(ordered_faces) > 1:
                primary_area = float(ordered_faces[0][2]) * float(ordered_faces[0][3])
                second_area = float(ordered_faces[1][2]) * float(ordered_faces[1][3])
                if second_area >= primary_area * 0.55:
                    raise ValueError("multiple_primary_faces")
            face = ordered_faces[0]
            frames.append(rgb)
            face_boxes.append(tuple(map(int, face)))
        except HTTPException:
            raise
        except Exception as exc:
            _LOGGER.info("Rejected invalid liveness capture frame: %s", exc)
            raise HTTPException(
                status_code=422,
                detail="Có khung hình không nhìn rõ đúng một khuôn mặt. Hãy thử lại với ánh sáng tốt hơn.",
            ) from exc

    try:
        result = multiframe_liveness_check(frames, face_boxes)
    except PassiveLivenessUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model Passive Liveness chưa sẵn sàng trên máy chủ.",
        ) from exc

    if not result["is_live"]:
        frame_results = result.get("indicators", {}).get("frame_results", [])
        live_scores = [
            round(float(frame.get("indicators", {}).get("live_score", 0.0)), 4)
            for frame in frame_results
        ]
        strongest_spoof_scores = [
            round(float(frame.get("indicators", {}).get("strongest_spoof_score", 0.0)), 4)
            for frame in frame_results
        ]
        _LOGGER.warning(
            "Passive liveness rejected capture: duplicate=%s frames=%s live=%s spoof=%s",
            result.get("duplicate_detected", False),
            result.get("indicators", {}).get("frame_count", 0),
            live_scores,
            strongest_spoof_scores,
        )
        raise HTTPException(
            status_code=422,
            detail="Không xác minh được người thật. Không dùng ảnh, màn hình hoặc video ghi sẵn trước camera.",
        )
    return result


def similarity_from_embedding(*, enrollment_embedding: list[float], selfie_data_url: str) -> float:
    import numpy as np
    reference = np.asarray(enrollment_embedding, dtype=np.float32)
    reference = reference / max(float(np.linalg.norm(reference)), 1e-8)
    selfie = _embedding(_image_bytes(selfie_data_url))
    return float((reference * selfie).sum())


def similarity_from_embeddings(*, enrollment_embedding: list[float], selfie_data_urls: list[str]) -> float:
    """Compare a stable aggregate of the accepted capture burst to enrollment."""
    import numpy as np

    reference = np.asarray(enrollment_embedding, dtype=np.float32)
    reference = reference / max(float(np.linalg.norm(reference)), 1e-8)
    candidate = aggregate_embeddings(
        [embedding_from_data_url(data_url) for data_url in selfie_data_urls]
    )
    return float((reference * candidate).sum())


def compare_avatar_to_selfie(*, avatar_url: str, selfie_data_url: str) -> float:
    """Return cosine similarity in [0, 1] without persisting the selfie."""
    try:
        request = urllib.request.Request(avatar_url, headers={"User-Agent": "FintechGuard/1.0"})
        with urllib.request.urlopen(request, timeout=8) as response:
            reference = response.read(5 * 1024 * 1024 + 1)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Không thể tải ảnh khuôn mặt đã đăng ký") from exc
    if len(reference) > 5 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="Ảnh khuôn mặt đã đăng ký quá lớn")
    reference_embedding = _embedding(reference)
    selfie_embedding = _embedding(_image_bytes(selfie_data_url))
    return float((reference_embedding * selfie_embedding).sum())
