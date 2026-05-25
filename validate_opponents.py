import importlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_TSX_PATH = _SCRIPT_DIR / "node_modules" / ".bin" / "tsx"


def main() -> None:
    module_name = sys.argv[1] if len(sys.argv) > 1 else "opponets"
    mod = importlib.import_module(module_name)
    pool = mod.selected_opponents_pool

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(pool, f)
        temp_path = f.name

    try:
        result = subprocess.run(
            [
                str(_TSX_PATH),
                str(_SCRIPT_DIR / "src-js" / "validate-opponents.ts"),
                temp_path,
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )

        validation_results = json.loads(result.stdout.strip())

        valid_count = sum(1 for r in validation_results if r["valid"])
        invalid_count = len(validation_results) - valid_count

        print(f"Total opponents: {len(validation_results)}")
        print(f"Valid: {valid_count}")
        print(f"Invalid: {invalid_count}")

        if invalid_count > 0:
            print()
            print("Invalid opponents:")
            for r in validation_results:
                if not r["valid"]:
                    print(f"  {r['species']}:")
                    for err in r["errors"]:
                        print(f"    - {err}")
            sys.exit(1)
        else:
            print()
            print("All opponents have legal movesets!")

    except subprocess.TimeoutExpired:
        print("Validation timed out after 30 seconds", file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"Validation failed: {e}", file=sys.stderr)
        if e.stderr:
            print(e.stderr, file=sys.stderr)
        sys.exit(1)
    finally:
        os.unlink(temp_path)


if __name__ == "__main__":
    main()
