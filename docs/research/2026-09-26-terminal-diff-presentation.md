# 터미널 변경 결과의 줄 단위 Diff 표현 조사

## 질문

WWW의 완료 보고가 `CHANGE file +N -N` 통계만 보여주는 대신 실제 변경 행을 `+`와 `-`로 보여주려면 어떤 공개 구현을 따르는가?

## 확인한 공개 구현

OpenAI Codex CLI의 공개 `diff_render.rs`는 파일별 경로와 추가·삭제 합계를 먼저 표시하고, 그 아래에 unified diff를 논리 행 단위로 렌더한다. 삽입·삭제·문맥 행은 각각 `+`, `-`, 공백 gutter를 유지하며 터미널 폭에 맞춰 감싼다. 여러 파일은 파일 단위 블록으로 분리하고 preview 행 수를 제한할 수 있다.

- Source: [openai/codex · diff_render.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/diff_render.rs)
- 확인일: 2026-09-26
- 주요 경계: `create_diff_preview_with_links`, `render_changes_block`, `render_change_with_preview`, `render_wrapped_diff_line`

## WWW 적용 결정

WWW의 `file-change` activity에는 이미 Native가 전달한 unified diff가 있으므로 완료 시점에 Git을 다시 조회하지 않는다. 기존 파일 헤더와 `+N/-N` 집계는 유지하되, 각 파일 바로 아래에 원본 diff의 `@@`, `-`, `+`, 문맥 행을 붙인다.

초기 적용은 다음과 같이 제한한다.

- `---`와 `+++` 파일 헤더는 중복 경로 노출을 막기 위해 제외한다.
- 한 파일의 preview는 최대 12행으로 제한하고 나머지는 생략 행으로 표시한다.
- Operation Report에서는 추가 행을 초록색, 삭제 행을 빨간색, hunk·문맥을 muted 색으로 표시한다.
- 좁은 터미널에서는 기존 ANSI-aware wrapping을 사용한다.

이 결정은 Codex의 파일 블록·gutter·bounded preview 원칙을 따르되, 현재 WWW가 보유하지 않는 정확한 old/new line number와 syntax highlighting은 발명하지 않는다.
