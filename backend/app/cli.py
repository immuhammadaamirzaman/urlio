"""Operational CLI (run from ``backend/`` so ``.env`` is picked up).

Usage:
    python -m app.cli promote-admin admin@example.com
    python -m app.cli demote-admin admin@example.com
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy import select

from app.db.session import AsyncSessionLocal, dispose_engine
from app.models.user import User


async def _set_superuser(email: str, value: bool) -> int:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email.lower()))
        user = result.scalar_one_or_none()
        if user is None:
            print(f"error: no user with email {email!r}", file=sys.stderr)
            return 1
        if user.is_superuser == value:
            print(f"{user.email} is already {'a superuser' if value else 'a regular user'}")
            return 0
        user.is_superuser = value
        await session.commit()
        print(f"{user.email} {'promoted to superuser' if value else 'demoted to regular user'}")
        return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="app.cli", description="ShortlyX operational commands."
    )
    sub = parser.add_subparsers(dest="command", required=True)
    promote = sub.add_parser("promote-admin", help="grant superuser privileges")
    promote.add_argument("email")
    demote = sub.add_parser("demote-admin", help="revoke superuser privileges")
    demote.add_argument("email")
    args = parser.parse_args(argv)

    async def _run() -> int:
        try:
            return await _set_superuser(args.email, args.command == "promote-admin")
        finally:
            await dispose_engine()

    return asyncio.run(_run())


if __name__ == "__main__":
    raise SystemExit(main())
