# 최종 진단 감사 (read-only, 제품 수정 없음)

## 1. 근거 해석에서 지지되지 않는 주장

**(a) "같은 6,236-record prefix 재실행"** — 최초 실행은 `--records` 없이 live append-only journal 전체를 읽었고 digest도 기록하지 않았다. 원본 www가 계속 append 중이므로 최초 corpus가 6,236이었다는 보장이 없다. 두 실행의 입력 동일성은 **미확립**이며, 여기에 소스 before/after manifest 부재(보고서도 인정)와 부하 미통제가 겹친다. 즉 RED→GREEN 차이를 설명할 수 있는 독립 변수가 최소 3개인데, 보고서는 "공유 시스템 경쟁 가설을 지지한다"로 한 쪽을 선택했다. 지지 가능한 최대 진술은 **"세 가설을 구분할 수 없다"**이다.

**(b) "공개 scroll 메서드는 shell routing과 같다"** — 검증되지 않았고, 오히려 형제 산출물이 반증한다. `completed-shell-scroll.json`은 실제 키 라우팅으로 page-up p95 47.88ms, page-down 41.55ms, end 30.81ms다. 같은 32ms 신호 기준으로 **RED**인데 본문 표·판정에 없다. 전체 verdict "GREEN"을 이 상태로 내보내면 선택적 보고다.

**(c) "count graph를 매 scroll마다 다시 만든 흔적 없음"** — harness가 단일 frozen snapshot을 전 구간 재사용하므로 `durableGraphBuilds: 0`은 설계상 필연이다. 무효화 경로를 한 번도 실행하지 않았다.

## 2. 재현 seam의 핵심 결손

새 증상은 **"응답 완료 직후 표시"**다. 그런데 어느 harness도 *전환*을 재현하지 않는다. replay는 완료 snapshot만, shell은 `activeTurnId:null`로 시작한다. 스트리밍 snapshot → 완료 snapshot 교체 시점의 무효화·rebuild가 공백이다. 또한 `projectChat`/`projectWorkFlow`는 frame 밖(`snapshotProjectionIncludedInFrames:false`)이다.

동시에 pinned 실행의 cold 값이 이 증상과 가장 부합하는데 지표에서 배제되어 있다: wide coldEnd 483ms 중 `exactCountBuildMs` 377ms, `renderedBlocks` 888, boundary 파일의 `transcriptSetupMs` 563ms. `maxStageP95`는 coldEnd를 제외하도록 정의되어 **사용자가 말한 국면을 판정에서 빼고 GREEN을 냈다**.

## 3. 구체적 harness 오류

- **p95가 사실상 max**: `percentile`는 n=10에서 index 9, n=3에서 index 2를 준다. home/end/warm의 p95=p99=max다. firstEarlier는 n=1인데 `maxStageP95`에 p95로 합산된다. 32ms 게이트는 소표본 최댓값 게이트다.
- **뷰포트 순서 confound**: 항상 150×44 → 80×24를 같은 프로세스에서 실행한다. JIT/heap warm-up이 compact에 유리하므로 "wide sidebar 비용" 비교는 순서 교대 없이는 성립하지 않는다.
- **두 harness가 다른 대상을 잰다**: replay는 최빈 threadId, shell은 첫 activity의 threadId를 고른다. reduced-motion도 shell에만 설정된다.
- **digest 정의 2종**: replay는 trailing newline 포함, shell은 미포함. 동등성을 사람이 확인해야 하는 seam이다.
- **shell에 상태 검증 없음**: scrollTop을 기록·단언하지 않아 "키가 삼켜져서 빨랐다"와 "빨랐다"를 구분할 수 없다. 또 `MemoryTerminal.write`의 `slice(-65536)`가 측정 구간 안에서 매 write마다 비용을 더한다.
- **`cpuMs` 귀속**: `process.cpuUsage()`는 전 스레드 합이다(cold wide cpu 741ms > wall 483ms). 최초 실행의 wall 115.66 / cpu 32.47 대비는 off-CPU 대기 증거로 유효하지만, "CPU 작업량"으로 읽으면 안 된다.
- **부하 증거가 일화적**: load 13은 인접 관찰일 뿐 실행별 페어링 기록이 없다. JSON에 loadavg/RSS/GC를 실행 시점에 남겨야 한다.
- replay의 `freeze`는 자식 재귀 후 동결이라 순환 참조에 취약하다(현 JSON 입력에선 무해).

## 4. 과소 보고

boundary 파일의 `toLocaleTimeString` 500회 25.3ms vs 공유 Intl formatter 0.60ms(≈42배)는 본문에 전혀 언급되지 않았다. cold 867 block 경로의 유력한 단서다.

## 5. 권고

공개 판정을 GREEN으로 확정하지 말고 **미결(indistinguishable)**로 두고, 다음 harness 수정을 다음 단계에 둔다: 완료 전환 프레임 측정, cold/projection을 지표에 포함, 실행별 digest·소스 SHA·loadavg 기록, 뷰포트 순서 교대, shell에 scrollTop 단언, 반복 실행 중앙값. 진행 중 작업은 중단하지 않으며 WOO915는 In Progress로 유지한다. 실제 pixel latency는 인증하지 않는다.