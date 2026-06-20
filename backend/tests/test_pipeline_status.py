from pipeline_status import rollup_pipeline_status


def test_no_pipelines_is_none():
    assert rollup_pipeline_status([]) == ("none", None)


def test_single_active_returns_its_next_run():
    pipelines = [{"status": "active", "next_run_at": "2026-06-20T14:00:00+00:00"}]
    assert rollup_pipeline_status(pipelines) == ("active", "2026-06-20T14:00:00+00:00")


def test_error_wins_over_active():
    pipelines = [
        {"status": "error", "next_run_at": None},
        {"status": "active", "next_run_at": "2026-06-20T14:00:00+00:00"},
    ]
    status, next_run = rollup_pipeline_status(pipelines)
    assert status == "error"
    assert next_run == "2026-06-20T14:00:00+00:00"


def test_all_paused_returns_paused():
    pipelines = [{"status": "paused", "next_run_at": None}, {"status": "paused"}]
    assert rollup_pipeline_status(pipelines) == ("paused", None)


def test_active_picks_soonest_next_run():
    pipelines = [
        {"status": "active", "next_run_at": "2026-06-20T18:00:00+00:00"},
        {"status": "active", "next_run_at": "2026-06-20T09:00:00+00:00"},
    ]
    assert rollup_pipeline_status(pipelines) == ("active", "2026-06-20T09:00:00+00:00")


def test_active_without_next_run_is_none_next():
    assert rollup_pipeline_status([{"status": "active"}]) == ("active", None)


def test_unknown_status_with_pipelines_is_paused():
    assert rollup_pipeline_status([{"status": ""}]) == ("paused", None)
