"""Tests for Instagram OAuth endpoints and client APIs"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
CLIENT_ID = "342be63d-53a8-480b-b3d8-75255d16daf5"  # TechFlow Inc

class TestInstagramEndpoints:
    """Instagram OAuth endpoint tests"""

    def test_instagram_connect_returns_auth_url(self):
        """GET /api/instagram/connect/{client_id} should return valid auth_url"""
        resp = requests.get(f"{BASE_URL}/api/instagram/connect/{CLIENT_ID}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "auth_url" in data, f"Missing auth_url in response: {data}"
        assert data["auth_url"].startswith("https://api.instagram.com/oauth/authorize"), \
            f"auth_url doesn't start with expected URL: {data['auth_url']}"
        print(f"PASS: auth_url = {data['auth_url'][:80]}...")

    def test_instagram_status_not_connected(self):
        """GET /api/instagram/status/{client_id} returns connected:false for unconnected client"""
        resp = requests.get(f"{BASE_URL}/api/instagram/status/{CLIENT_ID}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "connected" in data, f"Missing 'connected' field: {data}"
        print(f"PASS: connected = {data['connected']}, data = {data}")

    def test_instagram_disconnect_works(self):
        """DELETE /api/instagram/disconnect/{client_id} should work without error"""
        resp = requests.delete(f"{BASE_URL}/api/instagram/disconnect/{CLIENT_ID}")
        assert resp.status_code in [200, 204], f"Expected 200/204, got {resp.status_code}: {resp.text}"
        print(f"PASS: disconnect status = {resp.status_code}")

    def test_instagram_connect_invalid_client(self):
        """Should return 404 for non-existent client"""
        resp = requests.get(f"{BASE_URL}/api/instagram/connect/nonexistent-id")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("PASS: 404 for invalid client")

    def test_instagram_status_invalid_client(self):
        """Should return 404 for non-existent client"""
        resp = requests.get(f"{BASE_URL}/api/instagram/status/nonexistent-id")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("PASS: 404 for invalid client status")

class TestClientsAPI:
    """Basic clients API smoke test"""

    def test_clients_list(self):
        resp = requests.get(f"{BASE_URL}/api/clients")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: {len(data)} clients returned")

    def test_specific_client(self):
        resp = requests.get(f"{BASE_URL}/api/clients/{CLIENT_ID}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == CLIENT_ID
        print(f"PASS: client name = {data.get('name')}")
