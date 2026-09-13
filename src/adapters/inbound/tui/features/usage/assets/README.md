# Provider 로고

공식 배포 ZIP 또는 서비스 favicon을 내려받아 32×32 PNG로 축소했다. 원본 URL은 `sources.json`에 있다. 상표는 각 소유자에게 귀속된다. OpenAI는 dark terminal에서 식별되는 white monoblossom 변형이다.

HUD는 각 PNG를 가로 2칸·세로 1줄에 표시한다. 로컬 파일과 인코딩을 캐시하므로 실행 중 네트워크 요청은 없다. 현재 pi-tui의 이미지 캐시는 한 행당 하나의 이미지만 처리하므로, 여러 로고 행은 raw Kitty 명령과 고정 image ID를 사용한다. 이미지 행 변경 시 작은 PNG를 재전송하며, 호스트가 배치를 지우고 다시 그린다. 종료 시 이미지 데이터를 정리한다. 미지원 환경과 파일 로딩 실패는 이름으로 대체한다.

`PI_IMAGE_PROTOCOL=none`으로 이미지 표시를 끌 수 있다. iTerm2 프로토콜은 현재 fullscreen 호스트가 비활성화한다. Ghostty 실제 화면 확인은 이 세션의 컴퓨터 제어 도구에서 차단됐으며, PNG 검사와 호스트 출력·리사이즈·종료 테스트로 검증 범위를 제한한다.
