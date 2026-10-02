# chat — 남은 절 순서 후보 1건 (의도적 유지)

`three-body-braille.ts`의 내부 `class BrailleCanvas`가 공개 함수 `renderThreeBodyBrailleFrame`보다 앞에 있다. 클래스 선언은 호이스팅되지 않으므로(TDZ) 계약 원칙 6에 따라 옮기지 않았다. 공개 함수는 렌더 시점에만 클래스를 쓰므로 이동 자체는 안전할 수 있지만, 클래스 이동은 이번 작업 종류(내부 function 이동) 밖이다.
