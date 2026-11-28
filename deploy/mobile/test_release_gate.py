import hashlib
from pathlib import Path
import tempfile
import unittest
import release_gate as gate
import release_monitor as monitor

SHA="a"*40
def evidence():
    return [{"id":i+1,"name":name,"head_sha":SHA,"head_branch":"main","event":"push","status":"completed","conclusion":"success"} for i,name in enumerate(sorted(gate.REQUIRED_CI))]

class ReleaseGateTests(unittest.TestCase):
    def test_exact_commit_ci(self):
        gate.validate_ci(evidence(),SHA)
        for patch in ({"head_sha":"b"*40},{"event":"pull_request"},{"conclusion":"failure"},{"status":"in_progress"}):
            rows=evidence()
            rows[0].update(patch)
            with self.assertRaises(ValueError): gate.validate_ci(rows,SHA)
        rows=evidence()
        rows.append({**rows[0],"id":999,"conclusion":"failure"})
        with self.assertRaises(ValueError): gate.validate_ci(rows,SHA)

    def test_external_pins(self):
        config={"services":{s:{"image":s+"@sha256:"+"b"*64} for s in gate.EXTERNAL}}
        gate.verify_external_pins(config)
        config["services"]["db"]["image"]="postgres:17"
        with self.assertRaises(ValueError): gate.verify_external_pins(config)

    def test_manifest_requires_approval_and_matching_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            hashes={}
            for name in monitor.FILES:
                p=root/name
                p.parent.mkdir(parents=True,exist_ok=True)
                p.write_text(name)
                hashes[name]=hashlib.sha256(p.read_bytes()).hexdigest()
            data={"schema":1,"channel":"candidate","commit":SHA,
                  "platforms":["linux/amd64","linux/arm64"],
                  "images":{s:"ghcr.io/gustavoaba/editor-"+s+"@sha256:"+"b"*64 for s in monitor.SERVICES},"files":hashes}
            with self.assertRaises(ValueError): gate.make_manifest(data,SHA,root,2,"v1",False)
            self.assertEqual(gate.make_manifest(data,SHA,root,2,"v1",True)["channel"],"stable")
            (root/"Caddyfile").write_text("different")
            with self.assertRaises(ValueError): gate.validate_candidate(data,SHA,root)

if __name__=="__main__":
    unittest.main()
