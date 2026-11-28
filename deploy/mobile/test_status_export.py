import json
from pathlib import Path
import tempfile
import unittest
import status_export

class StatusExportTests(unittest.TestCase):
    def test_only_sanitized_fields_exported(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            state=root/"private"
            state.mkdir()
            (state/"active.json").write_text(json.dumps({"commit":"a"*40,"lite":True,"secret":"do-not-leak","overrideHash":"private"}))
            (state/"staged.json").write_text(json.dumps({"commit":"b"*40,"images":{"web":"private-registry"}}))
            (state/"transaction.json").write_text("secret")
            public=root/"public"
            data=status_export.export(state,{"status":"check-failed","error":"private","checkedAt":"2026-11-27T00:00:00Z"},public)
            self.assertEqual(data["profile"],"lite")
            self.assertTrue(data["recoveryRequired"])
            self.assertFalse(data["autoInstall"])
            payload=(public/"status.json").read_text()
            for secret in ("do-not-leak","private-registry","overrideHash","secret"):
                self.assertNotIn(secret,payload)
            self.assertEqual((public/"status.json").stat().st_mode & 0o777,0o644)
            self.assertEqual(status_export.export(state,directory=public)["monitor"]["status"],"check-failed")

    def test_empty_state_is_not_success(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            data=status_export.export(root/"missing",directory=root/"public")
            self.assertIsNone(data["activeCommit"])
            self.assertEqual(data["monitor"]["status"],"not-checked")

if __name__=="__main__":
    unittest.main()
