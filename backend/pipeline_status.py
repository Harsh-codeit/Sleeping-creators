"""Pure pipeline-status rollup for the Clients view.

Given one client's pipelines, compute a single health badge value plus the
soonest upcoming active run. Pure (no db/network) so it is unit-testable in
isolation — server.py imports and calls it inside list_clients.
"""
from __future__ import annotations


def rollup_pipeline_status(pipelines: list[dict]) -> tuple[str, str | None]:
    """Return (status, next_run) for one client's pipelines.

    status precedence:
      - "error"  if any pipeline status == "error"
      - "active" else if any pipeline status == "active"
      - "paused" else if the client has any pipelines
      - "none"   if the client has no pipelines

    next_run: the smallest non-empty ``next_run_at`` among ACTIVE pipelines, or
    None. ``next_run_at`` values are ISO-8601 UTC strings, which sort
    chronologically as plain strings, so ``min`` is correct without parsing.
    """
    if not pipelines:
        return "none", None

    statuses = {(p.get("status") or "").lower() for p in pipelines}
    if "error" in statuses:
        status = "error"
    elif "active" in statuses:
        status = "active"
    else:
        status = "paused"

    active_runs = [
        p.get("next_run_at")
        for p in pipelines
        if (p.get("status") or "").lower() == "active" and p.get("next_run_at")
    ]
    next_run = min(active_runs) if active_runs else None
    return status, next_run
