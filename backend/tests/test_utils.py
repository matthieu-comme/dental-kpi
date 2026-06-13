from app.utils import hash_pin, check_pin


def test_hash_pin_returns_bcrypt_hash():
    h = hash_pin("123456")
    assert isinstance(h, str)
    assert h.startswith("$2b$")


def test_hash_pin_is_not_deterministic():
    h1 = hash_pin("123456")
    h2 = hash_pin("123456")
    assert h1 != h2


def test_check_pin_correct_returns_true():
    h = hash_pin("123456")
    assert check_pin("123456", h) is True


def test_check_pin_wrong_returns_false():
    h = hash_pin("123456")
    assert check_pin("000000", h) is False


def test_check_pin_empty_returns_false():
    h = hash_pin("123456")
    assert check_pin("", h) is False


def test_check_pin_case_sensitive():
    h = hash_pin("AbCdEf")
    assert check_pin("AbCdEf", h) is True
    assert check_pin("abcdef", h) is False
