"""
Estimate job execution states and validation logic.
"""
from enum import Enum


class JobState(str, Enum):
    PENDING = "pending"
    VALIDATING = "validating"
    CONNECTING = "connecting"
    CONFIGURING = "configuring"
    CALCULATING = "calculating"
    EXPORTING = "exporting"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    COMPLETED_WITH_WARNINGS = "completed_with_warnings"
    FAILED = "failed"


# Allowed forward progression in happy path
ALLOWED_TRANSITIONS = {
    JobState.PENDING: [JobState.VALIDATING, JobState.FAILED],
    JobState.VALIDATING: [JobState.CONNECTING, JobState.FAILED],
    JobState.CONNECTING: [JobState.CONFIGURING, JobState.FAILED],
    JobState.CONFIGURING: [JobState.CALCULATING, JobState.FAILED],
    JobState.CALCULATING: [JobState.EXPORTING, JobState.FAILED],
    JobState.EXPORTING: [JobState.VERIFYING, JobState.FAILED],
    JobState.VERIFYING: [JobState.COMPLETED, JobState.COMPLETED_WITH_WARNINGS, JobState.FAILED],
    JobState.COMPLETED: [],
    JobState.COMPLETED_WITH_WARNINGS: [],
    JobState.FAILED: [JobState.PENDING],  # Allows retrying
}


def can_transition(current: str, target: str) -> bool:
    try:
        curr_enum = JobState(current)
        target_enum = JobState(target)
        return target_enum in ALLOWED_TRANSITIONS.get(curr_enum, [])
    except ValueError:
        return False
