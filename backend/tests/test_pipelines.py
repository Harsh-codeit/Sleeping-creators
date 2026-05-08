"""Pipeline API tests - CRUD, run, pause, resume, delete"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def client_id():
    """Get TechFlow Inc client ID"""
    resp = requests.get(f"{BASE_URL}/api/clients")
    assert resp.status_code == 200
    clients = resp.json()
    techflow = next((c for c in clients if "TechFlow" in c.get("name", "")), None)
    assert techflow, "TechFlow Inc client not found"
    return techflow["id"]

@pytest.fixture(scope="module")
def created_pipeline(client_id):
    """Create a test pipeline and return it"""
    payload = {
        "name": "TEST_Pipeline",
        "content_type": "carousel",
        "carousel_template": "floating_card",
        "carousel_slide_count": 5,
        "carousel_topics": ["marketing tips"],
        "platforms": ["instagram"],
        "schedule_type": "interval",
        "interval_hours": 4,
        "require_approval": False
    }
    resp = requests.post(f"{BASE_URL}/api/clients/{client_id}/pipelines", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    yield data
    # Cleanup
    requests.delete(f"{BASE_URL}/api/clients/{client_id}/pipelines/{data['id']}")

class TestPipelineCRUD:
    """Pipeline CRUD operations"""

    def test_list_pipelines(self, client_id):
        resp = requests.get(f"{BASE_URL}/api/clients/{client_id}/pipelines")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: GET /pipelines returned {len(data)} pipelines")

    def test_create_pipeline(self, client_id):
        payload = {
            "name": "TEST_Create_Pipeline",
            "content_type": "carousel",
            "carousel_template": "floating_card",
            "carousel_slide_count": 5,
            "carousel_topics": ["marketing tips"],
            "platforms": ["instagram"],
            "schedule_type": "interval",
            "interval_hours": 4,
            "require_approval": False
        }
        resp = requests.post(f"{BASE_URL}/api/clients/{client_id}/pipelines", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "TEST_Create_Pipeline"
        assert data["status"] == "active"
        assert data["content_type"] == "carousel"
        assert data["total_runs"] == 0
        assert "id" in data
        assert "next_run_at" in data
        print(f"PASS: Created pipeline {data['id']}")
        # Cleanup
        requests.delete(f"{BASE_URL}/api/clients/{client_id}/pipelines/{data['id']}")

    def test_create_pipeline_invalid_client(self):
        resp = requests.post(f"{BASE_URL}/api/clients/nonexistent/pipelines", json={"name": "Test"})
        assert resp.status_code == 404
        print("PASS: Invalid client returns 404")

    def test_pause_pipeline(self, client_id, created_pipeline):
        pid = created_pipeline["id"]
        resp = requests.post(f"{BASE_URL}/api/clients/{client_id}/pipelines/{pid}/pause")
        assert resp.status_code == 200
        assert resp.json()["status"] == "paused"
        print(f"PASS: Pipeline paused")

    def test_resume_pipeline(self, client_id, created_pipeline):
        pid = created_pipeline["id"]
        resp = requests.post(f"{BASE_URL}/api/clients/{client_id}/pipelines/{pid}/resume")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "active"
        assert "next_run_at" in data
        print(f"PASS: Pipeline resumed, next_run_at={data['next_run_at']}")

    def test_update_pipeline(self, client_id, created_pipeline):
        pid = created_pipeline["id"]
        resp = requests.put(f"{BASE_URL}/api/clients/{client_id}/pipelines/{pid}", json={"name": "TEST_Updated_Pipeline"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "TEST_Updated_Pipeline"
        print(f"PASS: Pipeline updated")

    def test_run_pipeline_now(self, client_id, created_pipeline):
        """This calls Claude AI to generate content - may take time"""
        pid = created_pipeline["id"]
        resp = requests.post(f"{BASE_URL}/api/clients/{client_id}/pipelines/{pid}/run", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert "posts_created" in data
        assert "message" in data
        print(f"PASS: Pipeline run: {data['message']}")

    def test_run_increments_total_runs(self, client_id, created_pipeline):
        """After run, total_runs should be incremented"""
        pid = created_pipeline["id"]
        pipelines = requests.get(f"{BASE_URL}/api/clients/{client_id}/pipelines").json()
        pipeline = next((p for p in pipelines if p["id"] == pid), None)
        assert pipeline is not None
        assert pipeline["total_runs"] >= 1
        assert pipeline["last_run_at"] is not None
        print(f"PASS: total_runs={pipeline['total_runs']}, last_run_at={pipeline['last_run_at']}")

    def test_pipeline_creates_posts(self, client_id, created_pipeline):
        """Posts created by pipeline should have pipeline_id set"""
        pid = created_pipeline["id"]
        resp = requests.get(f"{BASE_URL}/api/posts?client_id={client_id}")
        assert resp.status_code == 200
        posts = resp.json()
        pipeline_posts = [p for p in posts if p.get("pipeline_id") == pid]
        print(f"Pipeline posts found: {len(pipeline_posts)}")
        # content_type should be carousel
        for p in pipeline_posts:
            assert p.get("content_type") == "carousel"
        print(f"PASS: Found {len(pipeline_posts)} posts from pipeline")

    def test_delete_pipeline(self, client_id):
        """Create and delete a pipeline"""
        payload = {"name": "TEST_Delete_Me", "platforms": ["instagram"], "content_type": "carousel"}
        create_resp = requests.post(f"{BASE_URL}/api/clients/{client_id}/pipelines", json=payload)
        assert create_resp.status_code == 201
        pid = create_resp.json()["id"]

        del_resp = requests.delete(f"{BASE_URL}/api/clients/{client_id}/pipelines/{pid}")
        assert del_resp.status_code == 200

        # Verify pipeline no longer in list
        list_resp = requests.get(f"{BASE_URL}/api/clients/{client_id}/pipelines")
        pipeline_ids = [p["id"] for p in list_resp.json()]
        assert pid not in pipeline_ids
        print("PASS: Pipeline deleted and not in list")

    def test_specific_times_schedule(self, client_id):
        """Test creating pipeline with specific_times schedule"""
        payload = {
            "name": "TEST_SpecificTimes",
            "platforms": ["instagram"],
            "content_type": "carousel",
            "schedule_type": "specific_times",
            "specific_times": ["09:00", "14:00"]
        }
        resp = requests.post(f"{BASE_URL}/api/clients/{client_id}/pipelines", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert data["schedule_type"] == "specific_times"
        assert "14:00" in data["specific_times"]
        print(f"PASS: specific_times pipeline created, next_run={data.get('next_run_at')}")
        # Cleanup
        requests.delete(f"{BASE_URL}/api/clients/{client_id}/pipelines/{data['id']}")
