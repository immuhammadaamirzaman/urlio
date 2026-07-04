"""ORM models. Importing this package registers every table on ``Base.metadata``."""

from app.models.admin_audit import AdminAudit
from app.models.click import Click
from app.models.link import Link
from app.models.user import User

__all__ = ["User", "Link", "Click", "AdminAudit"]
