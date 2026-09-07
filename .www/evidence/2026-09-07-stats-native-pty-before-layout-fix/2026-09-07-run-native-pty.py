import os,pty,subprocess,fcntl,termios,struct,time,select,json,signal,codecs
from pathlib import Path
import pyte
root=Path.cwd(); out=root/'.www/scratchpad/2026-09-07-native-pty';out.mkdir(exist_ok=True)
statepath=root/'.www/scratchpad/2026-09-07-native-pty-state.json';statepath.unlink(missing_ok=True)
master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',36,80,0,0))
p=subprocess.Popen(['bun','.www/scratchpad/2026-09-07-native-pty-probe.ts'],stdin=slave,stdout=slave,stderr=slave,cwd=root,env={**os.environ,'TERM':'xterm-256color','COLORTERM':'truecolor'},start_new_session=True);os.close(slave)
screen=pyte.Screen(80,36);stream=pyte.Stream(screen);decoder=codecs.getincrementaldecoder('utf-8')('replace');record=bytearray();steps=[]
def state():
 try:return json.loads(statepath.read_text())
 except:return {}
def pump(seconds):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  ready,_,_=select.select([master],[],[],min(.1,max(0,end-time.monotonic())))
  if not ready:continue
  try:b=os.read(master,65536)
  except OSError:return
  if not b:return
  record.extend(b);stream.feed(decoder.decode(b))
  if b'\x1b[6n' in b:os.write(master,b'\x1b[1;1R')
def wait_for(predicate,seconds):
 end=time.monotonic()+seconds
 while time.monotonic()<end and p.poll() is None:
  pump(.1)
  if predicate(state()):return True
 return False
def shot(name):
 (out/(name+'.txt')).write_text('\n'.join(screen.display))
 steps.append({'step':name,'state':state(),'columns':screen.columns,'lines':screen.lines})
def type_line(text):os.write(master,text.encode());pump(.15);os.write(master,b'\r')
try:
 assert wait_for(lambda s:s.get('phase')=='ready',25),'initial ready timeout'
 pump(2);type_line('/stats');pump(1);shot('01-empty-stats-80');os.write(master,b'\x1b');pump(.5)
 type_line("도구 없이 다음 한 줄만 답하세요: 안녕하세요 👋 연결 확인")
 assert wait_for(lambda s:s.get('activeTurnId') is None and any(m.get('role')=='assistant' for m in s.get('chat',[])),45),'first response timeout'
 type_line('/stats');pump(1);shot('02-completed-stats-80')
 for cols in [40,120,80]:
  screen.resize(36,cols);fcntl.ioctl(master,termios.TIOCSWINSZ,struct.pack('HHHH',36,cols,0,0));os.kill(p.pid,signal.SIGWINCH);pump(.5);shot('03-resize-'+str(cols))
 os.write(master,b'\x1b');pump(.5)
 type_line('도구를 사용하지 말고 번호를 붙여 한글 예문을 1000줄 연속 작성하세요. 서론 없이 즉시 1번부터 시작하세요.')
 assert wait_for(lambda s:s.get('draft') is True,45),'streaming timeout'
 shot('04-streaming-80');os.write(master,b'\x1b')
 assert wait_for(lambda s:s.get('activeTurnId') is None,20),'cancel timeout'
 type_line('/stats');pump(1);shot('05-cancelled-stats-80');os.write(master,b'\x1b');pump(.5)
 os.write(master,b'\x04');pump(2)
 if p.poll() is None:p.wait(timeout=8)
 steps.append({'step':'exit','exitCode':p.returncode})
except Exception as e:
 steps.append({'step':'error','error':str(e),'state':state()});shot('failure-screen')
finally:
 if p.poll() is None:p.terminate();p.wait(timeout=10)
 (out/'terminal.ansi').write_bytes(record);(out/'steps.json').write_text(json.dumps(steps,ensure_ascii=False,indent=2));os.close(master)
print(json.dumps({'steps':[{'step':s['step'],'error':s.get('error'),'phase':s.get('state',{}).get('phase'),'chat':[(m.get('role'),m.get('status')) for m in s.get('state',{}).get('chat',[])],'exitCode':s.get('exitCode')} for s in steps],'artifacts':str(out)},ensure_ascii=False))
