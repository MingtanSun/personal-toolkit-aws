import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FrontendAuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app_js = (ROOT / "frontend" / "app.js").read_text(encoding="utf-8")
        cls.index_html = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
        cls.config_example = (ROOT / "frontend" / "config.example.js").read_text(encoding="utf-8")

    def test_config_script_loads_before_app(self):
        self.assertIn('<script src="config.js"></script>', self.index_html)
        self.assertLess(
            self.index_html.index('src="config.js"'),
            self.index_html.index('src="app.js"'),
        )

    def test_cognito_pkce_flow_is_present(self):
        for snippet in (
            "code_challenge_method",
            "authorization_code",
            "code_verifier",
            "/oauth2/authorize",
            "/oauth2/token",
            "/logout",
        ):
            self.assertIn(snippet, self.app_js)

    def test_backend_api_requests_use_authenticated_fetch(self):
        forbidden = [
            'fetch(`${API_URL}',
            'fetch(API_URL + "/tasks"',
            'fetch(API_URL + "/news"',
            'fetch(API_URL + "/movies"',
        ]
        for snippet in forbidden:
            self.assertNotIn(snippet, self.app_js)
        self.assertIn("Authorization", self.app_js)
        self.assertIn("apiFetch", self.app_js)

    def test_example_config_documents_cognito_values(self):
        for key in (
            "COGNITO_DOMAIN",
            "COGNITO_CLIENT_ID",
            "COGNITO_REDIRECT_URI",
            "COGNITO_LOGOUT_URI",
        ):
            self.assertIn(key, self.config_example)


if __name__ == "__main__":
    unittest.main()
