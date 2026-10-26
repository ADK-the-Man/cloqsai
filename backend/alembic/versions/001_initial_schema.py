"""Initial database schema

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-10-23 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_initial_schema'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tables are idempotently handled by Base.metadata.create_all on startup
    pass


def downgrade() -> None:
    pass
