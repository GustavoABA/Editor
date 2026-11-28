import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("host", Path(__file__).with_name("host.py"))
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)

class HostTests(unittest.TestCase):
    def test_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            self.assertTrue(host.create_env("192.168.1.10", path))
            first = path.read_text()
            self.assertFalse(host.create_env("192.168.1.11", path))
            self.assertEqual(first, path.read_text())
            self.assertEqual(host.configured_host(path), "192.168.1.10")
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_lan_validation(self):
        self.assertEqual(host.lan_host("192.168.1.2"), "192.168.1.2")
        for invalid in ("127.0.0.1", "0.0.0.0", "https://example.com", "ff02::1"):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                host.lan_host(invalid)

    def test_secrets(self):
        a, b = host.env_values("192.168.1.3"), host.env_values("192.168.1.3")
        for key in ("BETTER_AUTH_SECRET", "UPSTASH_REDIS_REST_TOKEN", "OPENCUT_LAN_SYNC_TOKEN"):
            self.assertEqual(len(a[key]), 64)
            self.assertNotEqual(a[key], b[key])
        self.assertEqual(a["NEXT_PUBLIC_SITE_URL"], "https://192.168.1.3")

if __name__ == "__main__":
    unittest.main()
