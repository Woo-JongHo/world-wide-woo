import codecs
import fcntl
import hashlib
import json
import os
import pty
import select
import signal
import struct
import subprocess
import termios
import time
from pathlib import Path

import pyte


archive = Path(__file__).resolve().parent
root = archive.parents[2]
probe = archive / "2026-09-07-native-pty-probe.ts"


def create_output_dir() -> Path:
    for ordinal in range(1, 1000):
        candidate = archive / f"replay-{ordinal:03d}"
        try:
            candidate.mkdir()
            return candidate
        except FileExistsError:
            continue
    raise RuntimeError("unique replay directory exhausted")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


out = create_output_dir()
statepath = out / "2026-09-07-native-pty-state.json"
executed_head = subprocess.check_output(
    ["git", "rev-parse", "HEAD"], cwd=root, text=True
).strip()
fingerprint_paths = [
    probe,
    Path(__file__).resolve(),
    root / "src/infrastructure/executors/codex-app-server.ts",
    root / "src/application/project-workbench.ts",
    root / "src/application/ports/executor-port.ts",
    root / "src/domain/project-activity.ts",
    root / "src/domain/workbench.ts",
    root / "src/domain/redaction.ts",
    root / "src/presentation/tui/workbench-shell.ts",
    root / "src/presentation/tui/workbench-views.ts",
]
fingerprint_lines = [f"executedHead  {executed_head}"]
for path in fingerprint_paths:
    fingerprint_lines.append(f"{sha256(path)}  {path.relative_to(root)}")
(out / "source-fingerprints.txt").write_text(
    "\n".join(fingerprint_lines) + "\n", encoding="utf-8"
)

master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 36, 80, 0, 0))
process = subprocess.Popen(
    ["bun", str(probe)],
    stdin=slave,
    stdout=slave,
    stderr=slave,
    cwd=root,
    env={
        **os.environ,
        "TERM": "xterm-256color",
        "COLORTERM": "truecolor",
        "WOO_EVIDENCE_OUTPUT_DIR": str(out),
    },
    start_new_session=True,
)
os.close(slave)
screen = pyte.Screen(80, 36)
stream = pyte.Stream(screen)
decoder = codecs.getincrementaldecoder("utf-8")("replace")
record = bytearray()
steps = []
failure = None


def state():
    try:
        return json.loads(statepath.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def pump(seconds):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        ready, _, _ = select.select(
            [master], [], [], min(0.1, max(0, end - time.monotonic()))
        )
        if not ready:
            continue
        try:
            chunk = os.read(master, 65536)
        except OSError:
            return
        if not chunk:
            return
        record.extend(chunk)
        stream.feed(decoder.decode(chunk))
        if b"\x1b[6n" in chunk:
            os.write(master, b"\x1b[1;1R")


def wait_for(predicate, seconds):
    end = time.monotonic() + seconds
    while time.monotonic() < end and process.poll() is None:
        pump(0.1)
        if predicate(state()):
            return True
    return False


def shot(name):
    (out / f"{name}.txt").write_text("\n".join(screen.display), encoding="utf-8")
    steps.append(
        {
            "step": name,
            "state": state(),
            "columns": screen.columns,
            "lines": screen.lines,
        }
    )


def type_line(text):
    os.write(master, text.encode())
    pump(0.15)
    os.write(master, b"\r")


try:
    assert wait_for(lambda value: value.get("phase") == "ready", 25), "initial ready timeout"
    pump(2)
    shot("01-ready-80")
    type_line("도구 없이 다음 한 줄만 답하세요: 안녕하세요 👋 연결 확인")
    assert wait_for(
        lambda value: value.get("activeTurnId") is None
        and any(message.get("role") == "assistant" for message in value.get("chat", [])),
        45,
    ), "first response timeout"
    pump(0.5)
    completed_state = state()
    completed_users = [
        message for message in completed_state.get("chat", []) if message.get("role") == "user"
    ]
    completed_assistants = [
        message
        for message in completed_state.get("chat", [])
        if message.get("role") == "assistant"
    ]
    assert len(completed_users) == 1, "normal turn did not preserve exactly one user message"
    assert len(completed_assistants) == 1, "normal turn did not preserve exactly one assistant message"
    assert completed_assistants[0].get("status") == "completed", "normal assistant was not completed"
    assert completed_assistants[0].get("content") == "안녕하세요 👋 연결 확인", "normal assistant body mismatch"
    shot("02-completed-80")
    type_line("/source not-an-activity")
    pump(0.6)
    assert state().get("selectedActivityId") is None, "invalid Source changed selection"
    assert "Activity" in "\n".join(screen.display), "missing Source error notice"
    shot("02-invalid-source")
    target = completed_assistants[0]["activityId"]
    type_line("/source " + target)
    assert wait_for(lambda value: value.get("selectedActivityId") == target, 8), "Source target not selected"
    pump(0.6)
    shot("02-valid-source")
    os.write(master, b"\x1b")
    pump(0.6)
    shot("02-source-return")

    for columns in [40, 120, 80]:
        screen.resize(36, columns)
        fcntl.ioctl(
            master, termios.TIOCSWINSZ, struct.pack("HHHH", 36, columns, 0, 0)
        )
        os.kill(process.pid, signal.SIGWINCH)
        pump(0.5)
        assert "안녕하세요 👋 연결 확인" in "\n".join(screen.display), (
            f"normal assistant body missing at {columns} columns"
        )
        shot(f"03-resize-{columns}")
    type_line(
        "도구를 사용하지 말고 번호를 붙여 한글 예문을 1000줄 연속 작성하세요. "
        "서론 없이 즉시 1번부터 시작하세요."
    )
    assert wait_for(lambda value: value.get("draft") is True, 45), "streaming timeout"
    shot("04-streaming-80")
    os.write(master, b"\x1b")
    assert wait_for(
        lambda value: value.get("activeTurnId") is None, 20
    ), "cancel timeout"
    pump(0.5)
    cancelled_state = state()
    cancelled_assistants = [
        message
        for message in cancelled_state.get("chat", [])
        if message.get("role") == "assistant" and message.get("status") == "cancelled"
    ]
    assert len(cancelled_assistants) == 1, "cancelled assistant projection missing or duplicated"
    assert cancelled_assistants[0].get("partial") is True, "cancelled assistant did not retain partial state"
    assert str(cancelled_assistants[0].get("content", "")).strip(), "cancelled assistant body was empty"
    cancelled_screen = "\n".join(screen.display)
    assert "중단됨" in cancelled_screen, "cancelled terminal label missing"
    assert "최종 답변 본문을 받지 못했습니다." not in cancelled_screen, "false missing-final notice rendered"
    assert "부분 응답 · 최종 본문 미수신" not in cancelled_screen, "cancelled response rendered as incomplete"
    shot("05-cancelled-80")
    os.write(master, b"\x04")
    pump(2)
    if process.poll() is None:
        process.wait(timeout=8)
    assert process.returncode == 0, f"probe exit code was {process.returncode}"
    events = [
        json.loads(line)
        for line in (out / "2026-09-07-native-pty-events.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    terminal_statuses = [
        event.get("turnStatus") for event in events if event.get("method") == "turn/completed"
    ]
    assert terminal_statuses == ["completed", "interrupted"], "Native terminal status sequence mismatch"
    user_messages = [event for event in events if event.get("itemType") == "userMessage"]
    assert len(user_messages) == 2, "Native userMessage observations missing or duplicated"
    assert all(event.get("textType") == "undefined" for event in user_messages), "Native userMessage text shape changed"
    assert all(event.get("contentTypes") == ["text"] for event in user_messages), "Native userMessage content shape changed"
    steps.append({"step": "exit", "exitCode": process.returncode})
except Exception as error:
    failure = str(error)
    steps.append({"step": "error", "error": str(error), "state": state()})
    shot("failure-screen")
finally:
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=10)
    (out / "terminal.ansi").write_bytes(record)
    (out / "steps.json").write_text(
        json.dumps(steps, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    os.close(master)

print(
    json.dumps(
        {
            "executedHead": executed_head,
            "steps": [
                {
                    "step": step["step"],
                    "error": step.get("error"),
                    "phase": step.get("state", {}).get("phase"),
                    "chat": [
                        (message.get("role"), message.get("status"))
                        for message in step.get("state", {}).get("chat", [])
                    ],
                    "exitCode": step.get("exitCode"),
                }
                for step in steps
            ],
            "artifacts": str(out),
        },
        ensure_ascii=False,
    )
)
if failure:
    raise SystemExit(1)
