import codecs
import fcntl
import json
import os
import pty
import select
import signal
import struct
import subprocess
import sys
import termios
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "vendor"))
import pyte

root = Path.cwd()
out = root / ".www/evidence/2026-09-07-tracer-native-pty-terra"
state_path = out / "state.json"
for name in ["state.json", "events.jsonl", "steps.json", "terminal.ansi", "run-result.json"]:
    (out / name).unlink(missing_ok=True)
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 36, 80, 0, 0))
process = subprocess.Popen(
    ["bun", ".www/evidence/2026-09-07-tracer-native-pty-terra/native-pty-probe.ts"],
    stdin=slave, stdout=slave, stderr=slave, cwd=root,
    env={**os.environ, "TERM": "xterm-256color", "COLORTERM": "truecolor"}, start_new_session=True,
)
os.close(slave)
screen = pyte.Screen(80, 36)
stream = pyte.Stream(screen)
decoder = codecs.getincrementaldecoder("utf-8")("replace")
terminal = bytearray()
steps = []
blockers = []

def read_state():
    try:
        return json.loads(state_path.read_text())
    except Exception:
        return {}

def pump(seconds):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        ready, _, _ = select.select([master], [], [], min(.1, max(0, end - time.monotonic())))
        if not ready:
            continue
        try:
            data = os.read(master, 65536)
        except OSError:
            return
        if not data:
            return
        terminal.extend(data)
        stream.feed(decoder.decode(data))
        if b"\x1b[6n" in data:
            os.write(master, b"\x1b[1;1R")

def wait_for(predicate, seconds):
    end = time.monotonic() + seconds
    while time.monotonic() < end and process.poll() is None:
        pump(.1)
        if predicate(read_state()):
            return True
    return False

def is_source_screen():
    return any("Source ·" in row for row in screen.display)

def shot(name, extra=None):
    (out / (name + ".txt")).write_text("\n".join(screen.display))
    step = {"step": name, "state": read_state(), "columns": screen.columns, "lines": screen.lines, "sourceScreen": is_source_screen()}
    if extra:
        step.update(extra)
    steps.append(step)

def type_line(text):
    os.write(master, text.encode())
    pump(.25)
    # Slash completion consumes Enter to select its first candidate. Escape closes that
    # menu while the Workbench is ready, so the following Enter dispatches the complete command.
    if text.startswith("/"):
        os.write(master, b"\x1b")
        pump(.1)
    os.write(master, b"\r")

def selected_candidate(state):
    source = state.get("workFlow", {}).get("source") or {}
    turn_id = source.get("turnId")
    if not turn_id:
        return None
    allowed = set()
    for step in state.get("workFlow", {}).get("steps", []):
        association = step.get("association") or {}
        for item_source in association.get("sources", []):
            if item_source.get("turnId") == turn_id:
                allowed.update(item_source.get("activityIds", []))
                allowed.update(item_source.get("observationActivityIds", []))
    for activity in state.get("activities", []):
        refs = activity.get("nativeRefs", {})
        if activity.get("id") in allowed and refs.get("turnId") == turn_id and refs.get("itemId"):
            return activity
    return None

first_prompt = "도구 호출이나 파일 변경 없이, 계획 모드에서 간단한 문서 점검 작업의 두 단계 계획을 먼저 만들고 계획 완료라고만 답하세요."
second_prompt = "도구 호출이나 파일 변경 없이, 다른 간단한 문서 점검 작업의 두 단계 계획을 새로 만들고 계획 완료라고만 답하세요."

try:
    if not wait_for(lambda state: state.get("phase") == "ready" and any("Workbench ·" in row for row in screen.display), 75):
        raise RuntimeError("initial Workbench frame timeout")
    type_line("/mode plan")
    pump(1)
    shot("01-plan-mode-80")

    type_line("/trace not-an-activity")
    pump(1)
    shot("02-invalid-id-80", {"expectSourceScreen": False})
    if is_source_screen():
        blockers.append("invalid /trace moved to Source screen")
    for columns in [40, 120, 80]:
        screen.resize(36, columns)
        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", 36, columns, 0, 0))
        os.kill(process.pid, signal.SIGWINCH)
        pump(.7)
        shot("02-invalid-id-" + str(columns), {"expectSourceScreen": False})
        if is_source_screen():
            blockers.append("invalid /trace moved to Source screen at " + str(columns) + " columns")

    type_line(first_prompt)
    if not wait_for(lambda state: state.get("activeTurnId") is not None, 20):
        raise RuntimeError("first plan turn did not start")
    if not wait_for(lambda state: state.get("phase") == "ready" and state.get("threadId") and state.get("activeTurnId") is None, 90):
        raise RuntimeError("first plan turn completion timeout")
    pump(1)
    first_state = read_state()
    first_candidate = selected_candidate(first_state)
    shot("03-first-native-plan-80", {"candidate": first_candidate})
    if not first_state.get("workFlow", {}).get("source"):
        blockers.append("Native first turn produced no Plan source")
    if not first_candidate:
        blockers.append("Native first turn produced no item-bearing activity associated with current Plan")
    else:
        type_line("/trace " + first_candidate["id"])
        wait_for(lambda state: state.get("selectedActivityId") == first_candidate["id"], 10)
        pump(1)
        shot("04-trace-success-80", {"candidate": first_candidate, "expectSourceScreen": True})
        if not is_source_screen():
            blockers.append("accepted /trace did not show Source screen")
        for columns in [40, 120, 80]:
            screen.resize(36, columns)
            fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", 36, columns, 0, 0))
            os.kill(process.pid, signal.SIGWINCH)
            pump(.7)
            shot("05-trace-success-" + str(columns), {"candidate": first_candidate, "expectSourceScreen": True})
        os.write(master, b"\x1b")
        pump(.7)
        shot("06-back-to-workbench-80", {"expectSourceScreen": False})

        type_line(second_prompt)
        first_turn = first_state.get("workFlow", {}).get("source", {}).get("turnId")
        if not wait_for(lambda state: state.get("activeTurnId") is not None, 20):
            blockers.append("Native second plan turn did not start")
        elif not wait_for(lambda state: state.get("phase") == "ready" and state.get("activeTurnId") is None and state.get("workFlow", {}).get("source", {}).get("turnId") not in [None, first_turn], 90):
            blockers.append("Native second turn produced no distinct current Plan source; cross-turn rejection not exercised")
            pump(1)
            shot("07-second-native-plan-unavailable-80", {"firstCandidate": first_candidate})
        else:
            pump(1)
            shot("07-second-native-plan-80", {"firstCandidate": first_candidate})
            type_line("/trace " + first_candidate["id"])
            pump(1)
            shot("08-cross-turn-rejected-80", {"firstCandidate": first_candidate, "expectSourceScreen": False})
            if is_source_screen():
                blockers.append("cross-turn rejected /trace moved to Source screen")
except Exception as error:
    blockers.append("runner error: " + str(error))
    shot("failure-screen")
finally:
    try:
        os.write(master, b"\x04")
        pump(2)
        if process.poll() is None:
            process.wait(timeout=8)
    except Exception as error:
        blockers.append("shutdown: " + str(error))
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=10)
    terminal.extend(decoder.decode(b"", final=True).encode())
    (out / "terminal.ansi").write_bytes(terminal)
    steps.append({"step": "exit", "exitCode": process.returncode})
    (out / "steps.json").write_text(json.dumps(steps, ensure_ascii=False, indent=2))
    (out / "run-result.json").write_text(json.dumps({"blockers": blockers, "exitCode": process.returncode}, ensure_ascii=False, indent=2))
    os.close(master)

print(json.dumps({"blockers": blockers, "exitCode": process.returncode, "steps": [step["step"] for step in steps]}, ensure_ascii=False))
