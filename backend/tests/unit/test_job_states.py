import pytest
from jobs.job_states import JobState, can_transition


def test_job_state_transitions():
    assert can_transition(JobState.PENDING, JobState.VALIDATING)
    assert can_transition(JobState.VALIDATING, JobState.CONNECTING)
    assert can_transition(JobState.CONNECTING, JobState.CONFIGURING)
    assert can_transition(JobState.CONFIGURING, JobState.CALCULATING)
    assert can_transition(JobState.CALCULATING, JobState.EXPORTING)
    assert can_transition(JobState.EXPORTING, JobState.VERIFYING)
    assert can_transition(JobState.VERIFYING, JobState.COMPLETED)
    # Disallow invalid backward jumps
    assert not can_transition(JobState.COMPLETED, JobState.PENDING)
    # Allow retrying failed jobs
    assert can_transition(JobState.FAILED, JobState.PENDING)
