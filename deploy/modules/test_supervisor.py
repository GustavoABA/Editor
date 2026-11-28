import unittest
from unittest.mock import patch
from pathlib import Path
import tempfile
import json
import supervisor
import provision

D="sha256:"+"a"*64
class SupervisorTests(unittest.TestCase):
    def test_normalizes_docker_hub_names(self):
        self.assertEqual(supervisor.pinned_image("postgres:15",["postgres@"+D,"docker.io/library/postgres@"+D]),"docker.io/library/postgres@"+D)
        self.assertEqual(supervisor.pinned_image("evoapicloud/evolution-api:v2.3.7",["docker.io/evoapicloud/evolution-api@"+D]),"docker.io/evoapicloud/evolution-api@"+D)
    def test_rejects_unrelated_or_ambiguous_digest(self):
        for digests in (["other/postgres@"+D],["postgres:latest"],["postgres@"+D,"postgres@sha256:"+"b"*64]):
            with self.assertRaises(RuntimeError): supervisor.pinned_image("postgres:15",digests)
    def test_provision_known_paths(self):
        body=provision.render("cut-editor-modules.service",provision.ROOT)
        self.assertIn(str(provision.ROOT)+"/deploy/modules/supervisor.py",body)
        with self.assertRaises(ValueError): provision.render("../other",provision.ROOT)
        with self.assertRaises(ValueError): provision.render("cut-editor-modules.service",Path("/tmp/with space"))
    def test_worker_runs_after_install_request_processed(self):
        with tempfile.TemporaryDirectory() as d:
            state=Path(d)
            env=state/"evolution.env"
            env.touch()
            rid="a"*36
            (state/"last-request.json").write_text(json.dumps({"id":rid}))
            with patch.multiple(supervisor,STATE=state,ENV=env), patch.object(supervisor.updater,"JOURNAL",state/"journal"), patch.object(supervisor.updater,"lock"), patch.object(supervisor,"heartbeat"), patch.object(supervisor,"web",return_value=json.dumps({"id":rid,"action":"install"})), patch.object(supervisor,"process_media") as media, patch.object(supervisor,"install") as install:
                supervisor.tick()
                media.assert_called_once()
                install.assert_not_called()
if __name__=="__main__":
    unittest.main()
