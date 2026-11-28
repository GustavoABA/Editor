import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import updater
import release_monitor as monitor

def release():
    return {"schema":1,"channel":"stable","commit":"a"*40,"sequence":2,
            "dataSchema":"v1","rollbackSafe":True,
            "platforms":["linux/amd64","linux/arm64"],
            "images":{s:"ghcr.io/gustavoaba/editor-"+s+"@sha256:"+"b"*64 for s in monitor.SERVICES},
            "files":{s:"c"*64 for s in monitor.FILES}}

class UpdateTests(unittest.TestCase):
    def test_sequence_and_schema(self):
        new=release()
        updater.check_sequence(new,{"sequence":1,"dataSchema":"v1"})
        for previous in ({"sequence":2,"dataSchema":"v1"},{"sequence":1,"dataSchema":"v2"}):
            with self.assertRaises(ValueError):
                updater.check_sequence(new,previous)

    def test_profile_and_override(self):
        self.assertEqual(updater.selected(True),["web","mcp-http"])
        self.assertEqual(set(updater.selected(False)),set(updater.MAP))
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"override.json"
            updater.image_override(p,{"web":release()["images"]["web"]})
            self.assertEqual(updater.read(p)["services"]["web"]["image"],release()["images"]["web"])
            with self.assertRaises(ValueError):
                updater.image_override(p,{"db":"untrusted"})

    @unittest.skipUnless(shutil.which("openssl"),"OpenSSL CLI needed")
    def test_signature_and_topology(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            data=release()
            for path in data["files"]:
                f=root/path
                f.parent.mkdir(parents=True,exist_ok=True)
                f.write_text(path)
                data["files"][path]=hashlib.sha256(f.read_bytes()).hexdigest()
            manifest,signature,private,public=[root/n for n in ("manifest.json","manifest.sig","private.pem","public.pem")]
            manifest.write_text(json.dumps(data))
            def openssl(*args):
                subprocess.run(["openssl",*map(str,args)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            openssl("genpkey","-algorithm","RSA","-pkeyopt","rsa_keygen_bits:2048","-out",private)
            openssl("pkey","-in",private,"-pubout","-out",public)
            openssl("dgst","-sha256","-sign",private,"-out",signature,manifest)
            with patch.object(updater,"ROOT",root):
                self.assertEqual(updater.verify(manifest,signature,public)["sequence"],2)
                (root/"Caddyfile").write_text("changed")
                with self.assertRaises(ValueError):
                    updater.verify(manifest,signature,public)
                manifest.write_text(json.dumps({**data,"sequence":999}))
                with self.assertRaises(subprocess.CalledProcessError):
                    updater.verify(manifest,signature,public)

    def test_rollback_keeps_old_images_and_clears_journal(self):
        with tempfile.TemporaryDirectory() as d:
            state=Path(d)
            active,journal=state/"active.json",state/"transaction.json"
            rollback=state/"rollback-compose.json"
            updater.image_override(rollback,{"web":"cut-editor-rollback/web:old"})
            payload={"lite":True,"rollbackHash":updater.digest(rollback),"dataSchema":"v1",
                     "previous":{"sequence":1,"commit":"old","dataSchema":"v1","lite":True}}
            updater.write(journal,payload)
            with patch.multiple(updater,STATE=state,ACTIVE=active,JOURNAL=journal), patch.object(updater,"up") as up:
                updater.restore(payload)
                up.assert_called_once_with(True,rollback)
                self.assertFalse(journal.exists())
                self.assertEqual(updater.read(active)["commit"],"old")
                self.assertEqual(updater.active_override(True),state/"active-compose.json")
                with self.assertRaises(RuntimeError):
                    updater.active_override(False)

    def test_activity_blocks_activation(self):
        idle={"state":"no-observed-activity","recentSessions":0,"activeRenders":0}
        with patch.object(updater,"run",return_value=json.dumps(idle)):
            updater.require_no_observed_activity(["docker","compose"])
        for value in ({**idle,"state":"busy"},{**idle,"activeRenders":1},{**idle,"recentSessions":None},{"state":"unknown"}):
            with patch.object(updater,"run",return_value=json.dumps(value)), self.assertRaises(RuntimeError):
                updater.require_no_observed_activity(["docker","compose"])
        with patch.object(updater,"run",side_effect=subprocess.CalledProcessError(1,["docker"])), self.assertRaises(RuntimeError):
            updater.require_no_observed_activity(["docker","compose"])

    def test_failed_rollback_keeps_journal(self):
        with tempfile.TemporaryDirectory() as d:
            state=Path(d)
            journal=state/"transaction.json"
            rollback=state/"rollback-compose.json"
            updater.image_override(rollback,{"web":"cut-editor-rollback/web:old"})
            payload={"lite":True,"rollbackHash":updater.digest(rollback),"dataSchema":"v1"}
            updater.write(journal,payload)
            with patch.multiple(updater,STATE=state,JOURNAL=journal),patch.object(updater,"up",side_effect=RuntimeError("bad health")):
                with self.assertRaises(RuntimeError):
                    updater.restore(payload)
                self.assertTrue(journal.exists())

if __name__=="__main__":
    unittest.main()
