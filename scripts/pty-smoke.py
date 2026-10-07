"""Run the offline WWW TUI inside a real Unix PTY and verify first paint."""

import errno
import os
import pty
import select
import signal
import subprocess
import sys
import time


def main():
    master, slave = pty.openpty()
    child = subprocess.Popen(
        ["bun", "scripts/www-ui-preview.ts"],
        stdin=slave,
        stdout=slave,
        stderr=slave,
        start_new_session=True,
        env={**os.environ, "TERM": "xterm-256color", "COLUMNS": "100", "LINES": "32"},
    )
    os.close(slave)
    output = bytearray()
    painted = False
    deadline = time.monotonic() + 15

    try:
        while time.monotonic() < deadline:
            ready, _, _ = select.select([master], [], [], 0.2)
            if ready:
                try:
                    chunk = os.read(master, 65536)
                except OSError as error:
                    if error.errno != errno.EIO:
                        raise
                    break
                if not chunk:
                    break
                output.extend(chunk)
                if b"DEMO DATA" in output:
                    painted = True
                    break
            if child.poll() is not None:
                break

        if not painted:
            raise AssertionError("WWW preview did not paint DEMO DATA inside a PTY")

        if child.poll() is not None:
            raise AssertionError(f"WWW preview exited unexpectedly with code {child.returncode}")
        print("PTY smoke passed: offline WWW first paint")
    except Exception:
        print(output.decode("utf-8", errors="replace")[-2000:], file=sys.stderr)
        raise
    finally:
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
        os.close(master)


if __name__ == "__main__":
    main()
