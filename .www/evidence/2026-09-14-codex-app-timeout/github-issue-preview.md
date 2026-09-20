# Codex App이 실행되지 않은 환경에서 Native App Server 연결이 타임아웃된다

## 문제

Codex App을 실행하지 않은 상태에서 WWW 테스트를 실행하면 Native App Server 연결이 타임아웃되고, Codex App을 실행한 뒤에는 같은 테스트가 진행된다.

## 확인 및 재현

- 사용자 테스트에서 Codex App 미실행 상태의 타임아웃과 실행 상태의 정상 진행이 관찰됐다.
- WWW의 기본 Codex 실행 경로는 CodexAppServer.connect()를 호출해 codex app-server --stdio 자식 프로세스를 시작한다.
- 연결 직후 initialize 응답을 기본 30초 안에 받지 못하면 Codex App Server 요청 타임아웃으로 종료된다.
- 제한된 실행 환경에서 실제 runtime-tool-canary를 실행하면 ~/.codex SQLite state 초기화 실패로 App Server가 종료된다.
- 제한 밖에서 같은 runtime-tool-canary를 실행하면 calls=1, hostAcceptedToolResult=true, nativeTurnTerminated=true로 완료된다.
- 현재 재현 결과만으로는 Codex App 실행 여부가 직접 원인인지, 실행 환경의 상태·권한·PATH 차이가 원인인지 확정되지 않았다.
