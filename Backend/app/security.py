import binascii
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt

# Secret should be overridden via env var in any real deployment.
SECRET_KEY = os.environ.get("SSCMS_SECRET_KEY", "sscms-dev-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 12

PBKDF2_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${binascii.hexlify(salt).decode()}${binascii.hexlify(derived).decode()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations, salt_hex, hash_hex = password_hash.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        salt = binascii.unhexlify(salt_hex)
        expected = binascii.unhexlify(hash_hex)
        derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
        return hmac.compare_digest(derived, expected)
    except (ValueError, AttributeError):
        return False


def create_access_token(subject: str, extra_claims: Optional[dict] = None) -> str:
    to_encode = {"sub": subject}
    if extra_claims:
        to_encode.update(extra_claims)
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
