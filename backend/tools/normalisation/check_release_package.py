"""Check packaged evidence integrity; never connect to a database or deploy."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PACKAGE = ROOT / 'docs/releases/native-player-reads-2026-10-16'


def check(package, root):
    manifest = json.loads((package / 'manifest.json').read_text())
    errors = []
    for relative, expected in manifest['sha256'].items():
        path = (root / relative).resolve()
        if not path.is_relative_to(root.resolve()):
            errors.append(f'Outside repository: {relative}')
            continue
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            errors.append(f'Missing or changed input: {relative}')
    evidence = json.loads((root / manifest['release_evidence']).read_text())
    if not evidence['passed'] or len(evidence['api_cases']) != 20 or evidence['sql_errors']:
        errors.append('Clone comparison did not pass all 20 cases')
    readiness = json.loads((package / 'readiness.json').read_text())
    pending = [name for name, gate in readiness['gates'].items()
               if not all(gate.get(key) for key in ('passed', 'evidence', 'operator', 'timestamp'))]
    budget = readiness['performance']
    if not all(budget.get(key) for key in ('p95_seconds', 'max_regression_percent', 'concurrency', 'duration_minutes', 'soak_minutes', 'approved_by')):
        pending.append('approved_performance_budget')
    return {'package_integrity_passed': not errors, 'errors': errors,
            'production_ready': not errors and not pending, 'pending_gates': pending}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-ready', action='store_true')
    args = parser.parse_args()
    result = check(PACKAGE, ROOT)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result['package_integrity_passed'] and
                     (not args.require_ready or result['production_ready']) else 1)
