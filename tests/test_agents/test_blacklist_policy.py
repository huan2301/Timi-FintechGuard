from src.app.services.blacklist_policy import (
    MIN_CONFIRMED_REPORTS,
    MIN_HIGH_ASSESSMENTS,
    MIN_INDEPENDENT_USERS,
)


def test_blacklist_policy_is_conservative():
    assert MIN_HIGH_ASSESSMENTS == 3
    assert MIN_INDEPENDENT_USERS == 2
    assert MIN_CONFIRMED_REPORTS == 2
