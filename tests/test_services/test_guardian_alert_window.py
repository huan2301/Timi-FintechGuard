from src.app.services.guardian_alert_window import guardian_alert_elapsed_label


def test_guardian_alert_elapsed_label_is_short_and_user_facing() -> None:
    assert guardian_alert_elapsed_label(0) == "vừa xảy ra"
    assert guardian_alert_elapsed_label(17) == "17 phút trước"
    assert guardian_alert_elapsed_label(60) == "khoảng 1 giờ trước"
    assert guardian_alert_elapsed_label(143) == "khoảng 2 giờ trước"
