"""Contract tests for the local ONNX Passive Liveness service."""

import numpy as np


def _frames(count: int = 3) -> tuple[list[np.ndarray], list[tuple[int, int, int, int]]]:
    base = np.random.default_rng(42).integers(70, 185, (256, 256, 3), dtype=np.uint8)
    frames = []
    for index in range(count):
        frame = base.copy()
        # Simulate natural camera variation without assuming a synthetic image
        # represents a real human face.
        frame[20 + index : 28 + index, 20:28] = 120 + index
        frames.append(frame)
    return frames, [(30, 30, 200, 200)] * count


def test_passive_liveness_model_returns_bounded_scores():
    from src.app.services.passive_liveness import passive_liveness_check

    frames, boxes = _frames(1)
    result = passive_liveness_check(frames[0], boxes[0])

    assert isinstance(result["is_live"], bool)
    assert 0.0 <= result["confidence"] <= 1.0
    assert 0.0 <= result["indicators"]["live_score"] <= 1.0
    assert 0.0 <= result["indicators"]["spoof_class_0_score"] <= 1.0
    assert 0.0 <= result["indicators"]["spoof_class_2_score"] <= 1.0


def test_minifasnet_label_one_is_the_live_face_class(monkeypatch):
    """Guard the upstream label contract that previously rejected all users."""
    from src.app.services import passive_liveness

    class FakeNetwork:
        def setInput(self, _blob):  # noqa: N802 - OpenCV method name
            pass

        def forward(self):
            # Class 1 is deliberately dominant. Both ensemble members return
            # the same output, just as MiniFASNet's upstream test expects.
            return np.array([[0.0, 9.0, 0.0]], dtype=np.float32)

    monkeypatch.setattr(
        passive_liveness,
        "_models",
        lambda: ((FakeNetwork(), 2.7), (FakeNetwork(), 4.0)),
    )
    result = passive_liveness.passive_liveness_check(
        np.full((256, 256, 3), 128, dtype=np.uint8),
        (64, 64, 128, 128),
    )

    assert result["is_live"] is True
    assert result["confidence"] > 0.99


def test_minifasnet_receives_unnormalized_bgr_pixels(monkeypatch):
    """Guard the upstream 0..255 input contract for both ONNX exports."""
    from src.app.services import passive_liveness

    received_blobs: list[np.ndarray] = []

    class InspectingNetwork:
        def setInput(self, blob):  # noqa: N802 - OpenCV method name
            received_blobs.append(np.asarray(blob).copy())

        def forward(self):
            return np.array([[0.0, 9.0, 0.0]], dtype=np.float32)

    monkeypatch.setattr(
        passive_liveness,
        "_models",
        lambda: ((InspectingNetwork(), 2.7), (InspectingNetwork(), 4.0)),
    )
    passive_liveness.passive_liveness_check(
        np.full((256, 256, 3), (32, 96, 224), dtype=np.uint8),
        (64, 64, 128, 128),
    )

    assert len(received_blobs) == 2
    for blob in received_blobs:
        assert blob.dtype == np.float32
        assert float(blob.max()) == 224.0
        assert float(blob.min()) == 32.0


def test_real_class_argmax_does_not_require_binary_065_score(monkeypatch):
    """A three-class real winner below 0.65 must not be falsely rejected."""
    from src.app.services import passive_liveness

    class ModerateRealNetwork:
        def setInput(self, _blob):  # noqa: N802 - OpenCV method name
            pass

        def forward(self):
            # Softmax is approximately [0.30, 0.45, 0.25]. Label 1 clearly
            # wins, matching the upstream MiniFASNet decision contract.
            return np.array([[0.0, 0.4, -0.2]], dtype=np.float32)

    monkeypatch.setattr(
        passive_liveness,
        "_models",
        lambda: ((ModerateRealNetwork(), 2.7), (ModerateRealNetwork(), 4.0)),
    )
    result = passive_liveness.passive_liveness_check(
        np.full((256, 256, 3), 128, dtype=np.uint8),
        (64, 64, 128, 128),
    )

    assert 0.36 <= result["confidence"] < 0.65
    assert result["is_live"] is True


def test_multiframe_liveness_rejects_literal_duplicate_frames():
    from src.app.services.passive_liveness import multiframe_liveness_check

    frames, boxes = _frames(1)
    result = multiframe_liveness_check([frames[0], frames[0], frames[0]], boxes * 3)

    assert result["duplicate_detected"] is True
    assert result["is_live"] is False


def test_multiframe_liveness_accepts_distinct_capture_burst_contract():
    from src.app.services.passive_liveness import multiframe_liveness_check

    frames, boxes = _frames()
    result = multiframe_liveness_check(frames, boxes)

    assert result["duplicate_detected"] is False
    assert "frame_count" in result["indicators"]
    assert result["indicators"]["frame_count"] == 3


def test_multiframe_liveness_requires_short_burst_not_single_image():
    from src.app.services.passive_liveness import multiframe_liveness_check

    frames, boxes = _frames(1)
    result = multiframe_liveness_check(frames, boxes)

    assert result["is_live"] is False
    assert result["indicators"]["error"] == "insufficient_frames"
