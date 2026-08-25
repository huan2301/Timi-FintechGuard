from src.app.services.url_blacklist import normalize_url_host


def test_normalize_url_host_matches_every_path_on_a_host() -> None:
    assert normalize_url_host("https://www.Example.com./a/path?x=1") == "example.com"
    assert normalize_url_host("example.com/login") == "example.com"


def test_normalize_url_host_rejects_non_web_schemes_and_invalid_values() -> None:
    assert normalize_url_host("javascript:alert(1)") is None
    assert normalize_url_host("https://") is None
    assert normalize_url_host("not a url") is None
