import hashlib
from pathlib import Path
import tempfile
import unittest
import backup
import updater

class BackupTests(unittest.TestCase):
    def test_receipt_and_corruption(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            volumes={s:"volume-"+s+".tar" for s in backup.REQUIRED}
            names=set(volumes.values())|{"config-env","config-docker-compose.yml","config-Caddyfile","config-compose.lite.yml"}
            files={}
            for name in names:
                p=root/name
                p.write_bytes(name.encode())
                files[name]=hashlib.sha256(p.read_bytes()).hexdigest()
            receipt=root/"receipt.json"
            updater.write(receipt,{"schema":1,"complete":True,"files":files,"volumes":volumes,"project":"test"})
            self.assertEqual(backup.verify_receipt(receipt)["project"],"test")
            (root/"config-env").write_text("corrupted")
            with self.assertRaises(ValueError):
                backup.verify_receipt(receipt)

    def test_path_traversal(self):
        for value in ("../secret","/tmp/foo","a/b","..","-flag"):
            with self.assertRaises(ValueError):
                backup.safe_name(value)

if __name__=="__main__":
    unittest.main()
