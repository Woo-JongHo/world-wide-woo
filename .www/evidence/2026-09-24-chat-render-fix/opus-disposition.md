# Opus 감사 지적 판정 및 후속 증거

- A1: 수락. frozen activity append마다 과거 payload 전체를 재귀 검사하던 비용을 성공한 전체 검증 후에만 WeakSet에 등록하는 transactional node memo로 보완한다. 새 배열 index 순회와 summary의 선형 pass는 유지한다.
- A2: 제공자료 부족. 생산 journal coordinator immutable(structuredClone)->deepFreeze, durable projection Object.freeze([...visibleActivities]) 경로를 확인했다. 임의 Date/Map/class/mutable caller는 캐시하지 않는 보수적 계약을 유지한다.
- A3: 제공자료 부족. installed tui의 invalidate는 cell-size 변경 등이며 매 frame 호출이 아니다. 생산 레이아웃 3회 invalidate 0회 회귀 추가.
- A4/A5: 수락. benchmark는 primary exception과 cleanup exception을 모두 보존한다. Artifact half pair는 unknown-field 오류 대신 pair 오류 하나를 낸다.
- A6/C2: utils 반례 없음. code-unit 범위와 -1 fallback, Box Drawing width1, ANSI wrap의 보수적 경로 주석 보강. 동작 변경 없음.
- B1: 감사 입력 이후 clean GREEN을 확보했다. CPU 30~47ms는 long-draft 최소 harness 표본이며 warm16ms 기준과 직접 비교하지 않는다. process CPU는 모든 thread의 합이며 wall 독점 계산 시간이 아니다. 후속 최종 benchmark에 streaming+input 동시 경로를 추가하고 같은50/100ms gate를 적용한다.
- B2/D3: cold/unseen-width/append/journal-bump는 게시된 이슈 범위에서 진단 측정이다. clean append p95 4.45ms, journal-bump .231ms, warm repeatedresize1.544ms를 기록했으며 이후 변경분은 다시 측정한다. 이 수치에 명시되지 않은 수락 기준을 소급 창작하지 않는다.
- B3: ready idleWrites0는 ready만 뜻한다. 추가 working snapshot subscription +37KB draft+input 경로는 별도 지표/수락 gate. working 애니메이션을 idle0로 위장하지 않는다.
- B4: 실제 CMux offline production shell QA 성공, 기존 live www 재시작은 별도 작업 중단 선택 대기. 실제provider/pixel/end-to-end 해결은 주장하지 않는다.
- B5: 전체 전후 speedup 주장은 하지 않는다. 개별 utils 원본oracle 대조와 최종절대gate 수락을 구분한다. source hash를 채운 최종 report와 전후 manifest를 보존한다.
- D6: 기존 encoded patch 삭제는 앞선 patch rename이며 이번 새경로와 lockfile 설정은 frozen install로 실제적용 성공했다. 설치본만 고치고 패치가 없는 상태가 아니다. clean clone은 방대한 동시 dirty 변경을 포함하지 못하므로 frozen patch 재설치와 설치본 확인을 근거로 사용한다.
- C3/C4: 가능한 미세비용이며 정확성 반례가 아니다. 임의범위 fastpath 확장과 캐시 순서 변경은 추가실측 없이 늘리지 않는다.
- C7: optional issue 필드는 기존4절 bytes를 바꾸지 않고 명시제공시6절로만 렌더한다. CLI/request/publication/adapter 소비자와 열린content JSONschema를 확인했다. 기존Candidate digest와 readback은 그대로다.
