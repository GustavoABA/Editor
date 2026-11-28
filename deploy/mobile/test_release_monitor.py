import unittest
from unittest.mock import Mock
from urllib.error import HTTPError
import release_monitor as monitor

def manifest():
    return {"schema":1,"channel":"stable","commit":"a"*40,
            "platforms":["linux/amd64","linux/arm64"],
            "images":{s:"ghcr.io/gustavoaba/editor-"+s+"@sha256:"+"b"*64 for s in monitor.SERVICES},
            "files":{p:"c"*64 for p in monitor.FILES}}

class MonitorTests(unittest.TestCase):
    def test_discovery_never_installs(self):
        fetch = Mock(side_effect=[{"tag_name":"v1.0","assets":[{"name":monitor.ASSET}]},manifest()])
        result = monitor.discover(fetch)
        self.assertEqual(result["status"],"stable-manifest-discovered-unverified")
        self.assertFalse(result["autoInstall"])
        self.assertEqual(fetch.call_count,2)

    def test_candidate_rejected(self):
        data=manifest()
        data["channel"]="candidate"
        with self.assertRaises(ValueError): monitor.validate_manifest(data)

    def test_unpinned_image_and_wrong_registry_rejected(self):
        for image in ("ghcr.io/gustavoaba/editor-web:latest","ghcr.io/other/web@sha256:"+"a"*64):
            data=manifest()
            data["images"]["web"]=image
            with self.assertRaises(ValueError): monitor.validate_manifest(data)

    def test_missing_release_and_manifest(self):
        fetch=Mock(side_effect=HTTPError(monitor.API,404,"not found",{},None))
        self.assertEqual(monitor.discover(fetch)["status"],"no-public-stable-release")
        self.assertEqual(monitor.discover(lambda _: {"tag_name":"v1","assets":[]})["status"],"no-stable-manifest")

    def test_prerelease_and_invalid_tag(self):
        self.assertEqual(monitor.discover(lambda _: {"prerelease":True})["status"],"no-public-stable-release")
        with self.assertRaises(ValueError): monitor.discover(lambda _: {"tag_name":"../other"})

if __name__ == "__main__":
    unittest.main()
