import unittest
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from main import app


class AssistanceApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    def test_health_and_readiness(self) -> None:
        self.assertEqual(self.client.get("/health").status_code, 200)
        self.assertEqual(self.client.get("/ready").json()["model_version"], "rules-1")

    def test_missing_documents_are_reported(self) -> None:
        response = self.client.post(
            "/v1/assist",
            json={
                "application_id": "app-1",
                "application_type": "residential_allocation",
                "description": "A sufficiently detailed application description.",
                "document_names": ["identity_document"],
                "required_documents": ["identity_document", "proof_of_residence"],
            },
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["category"], "needs_review")
        self.assertIn("Missing document: proof_of_residence", body["reasons"])
        self.assertTrue(body["deterministic"])

    def test_priority_score_increases_for_older_complete_application(self) -> None:
        response = self.client.post(
            "/v1/assist",
            json={
                "application_id": "app-2",
                "application_type": "lease_renewal",
                "description": "A sufficiently detailed application description.",
                "document_names": ["identity_document"],
                "required_documents": ["identity_document"],
                "submitted_at": (
                    datetime.now(timezone.utc) - timedelta(days=30)
                ).isoformat(),
                "land_board_workload": 50,
            },
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["category"], "complete")
        self.assertGreater(body["priority_score"], 0.5)


if __name__ == "__main__":
    unittest.main()
