# Figure-8 삼체문제와 WWW TUI 구현

## 결론

WWW는 환영 화면과 `/three-body` 실험실에서 동일질량 Figure-8 주기해를 실제로
수치 적분한다. 원 위의 좌표를 닫힌 식으로 이동시키는 장식 애니메이션이 아니다.
세 물체의 위치와 속도, 총 12개 상태값에 뉴턴 중력을 적용하고 Velocity Verlet으로
시간을 전진시킨 결과를 2×4 Unicode Braille framebuffer에 투영한다.

## 운동 방정식

물체 `i`의 위치와 속도를 `r_i`, `v_i`, 질량을 `m_i`라 하면 평면 뉴턴 중력계는
다음 비선형 상미분방정식이다.

```text
dr_i/dt = v_i
dv_i/dt = G * sum(j != i) m_j * (r_j - r_i) / |r_j - r_i|^3
```

구현은 `G = 1`, `m_1 = m_2 = m_3 = 1`의 무차원 단위를 쓴다. 여기서 `G=1`은
중력이 없거나 현실의 중력상수가 1이라는 뜻이 아니라, 질량·길이·시간 단위를
정규화해 중력상수를 식에서 1로 둔 계산 단위계라는 뜻이다.

## Figure-8 초기조건

```text
BODY    X             Y             VX             VY
A      -0.97000436    0.24308753    0.466203685    0.432365730
B       0.97000436   -0.24308753    0.466203685    0.432365730
C       0.00000000    0.00000000   -0.932407370   -0.864731460
```

총 운동량과 질량중심은 거의 0이며 세 물체는 약 `6.32591398` 시간 단위마다 같은
8자 경로를 서로 뒤따른다. 초기조건을 조금 바꾸면 이 주기성이 깨질 수 있으므로,
이 화면은 삼체문제의 비선형성과 초기조건 민감성을 확장해 관찰할 기반도 제공한다.

## 수치 적분

단순 Euler 방식은 장시간 실행에서 에너지가 빠르게 틀어져 주기궤도가 무너지기
쉽다. WWW는 `dt = 0.001`인 Velocity Verlet을 사용한다.

```text
v(t + dt/2) = v(t) + a(t) * dt/2
r(t + dt)   = r(t) + v(t + dt/2) * dt
a(t + dt)   = gravity(r(t + dt))
v(t + dt)   = v(t + dt/2) + a(t + dt) * dt/2
```

물리 엔진은 위치·속도 외에도 운동에너지, 위치에너지, 총에너지, 에너지 상대
드리프트, 선운동량, 각운동량, 질량중심을 계산한다. 자동 검증은 알려진 초기
에너지 약 `-1.28714199`와 한 주기 뒤 위치·속도 복귀, 상대 에너지 드리프트
`1e-6` 미만을 확인한다.

## TUI 구조

```text
Figure-8 preset
      ↓
Newton acceleration → Velocity Verlet → immutable snapshot
                                           ↓
                                  Braille projection 2×4
                                           ↓
                         welcome preview / THREE BODY LAB
```

- `core/domain/work/three-body-simulation.ts`는 터미널을 모르는 물리 엔진이다.
- `three-body-braille.ts`는 snapshot과 trail을 셀 좌표로 투영한다.
- `three-body-orbit.ts`는 첫 화면의 결정적 미리보기를 만든다.
- `three-body-lab.ts`는 `/three-body`의 전체 화면, 진단값, 조작을 소유한다.
- 실험실은 보일 때만 25 FPS 타이머를 켜고, 나가거나 종료할 때 정리한다.

조작은 `Space` 일시정지, `R` 초기화, `+/-` 속도, `T` 궤적 표시, `1` Figure-8
프리셋, `Q` 또는 `Esc` 복귀다. 물리 엔진이 UI와 분리되어 있으므로 향후 성능상
필요하면 Rust/WASM 등으로 교체해도 renderer와 shell 계약은 유지할 수 있다.

## “20가지 특수해”의 범위

“20가지”는 삼체문제의 해가 20개뿐이라는 뜻이 아니다. Philip Sharp의 20개
예시는 원형·공면 제한 삼체문제의 주기궤도 표이고, 동일질량 뉴턴 삼체계에도
Figure-8 외에 많은 주기궤도가 알려져 있다. 현재 제품은 검증되지 않은 20개
카탈로그를 표시하지 않고, 초기조건과 주기가 잘 알려진 Figure-8 하나를 정확히
구현한다. 추가 프리셋은 각 초기조건·질량·주기·출처를 함께 보관해야 한다.

## 근거 자료

- Chenciner and Montgomery, *A remarkable periodic solution of the three-body
  problem in the case of equal masses*, Annals of Mathematics 152 (2000).
  https://annals.math.princeton.edu/2000/152-3/p04
- Institute for Advanced Study, Piet Hut, *README file for N-body starter code* —
  Figure-8 초기조건을 포함한 N-body 예제.
  https://www.ias.edu/exids/piet-hut-readme-file-n-body-starter-code
- Philip W. Sharp, *Circular, co-planar, restricted three-body problem* — 제한
  삼체문제의 20개 주기궤도 예시.
  https://www.math.auckland.ac.nz/~sharp/ccr3b/ccr3b.html
