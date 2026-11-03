# TODO

향후 개선이 필요한 항목을 **위험도(중요도) 순**으로 정리한 목록입니다. (최종 갱신: 2026-11-03)

| 등급 | 기준 |
|---|---|
| 🔴 높음 | 보안 취약점, 사용자 환경/다른 확장에 영향, 기능 고장 가능성 |
| 🟠 중간 | 잘못된 결과·문서 불일치, 유지보수 부담 |
| 🟢 낮음 | 코드 품질, 정리 작업 |

---

## 🔴 높음

### H1. 런타임 의존성 `axios` 고위험 취약점

- **현재 상태**: `npm audit --omit=dev` 결과 배포 패키지(vsix)에 포함되는 `axios`(1.0.0–1.19.0 범위)에 high 등급 취약점 존재. 게다가 `axios`를 쓰는 `syncWithServer()`/`syncAddonData()`는 호출되지 않는 죽은 코드임 (→ M1).
- **해야 할 일**:
  - [ ] 원격 동기화를 안 쓴다면 `axios` 의존성 자체를 제거 (가장 확실)
  - [ ] 쓸 계획이라면 `npm audit fix`로 패치 버전으로 업그레이드
- **참고**: devDependencies(eslint, mocha, vscode-test 등 구버전)에도 취약점 다수 → L3

### H2. 전역 `console.log` 가로채기

- **현재 상태**: `extension.ts`의 `activate()`에서 `console.log`/`console.info`를 전역으로 덮어씀. 같은 확장 호스트에서 돌아가는 **다른 확장의 로그까지 변형·누락**될 수 있으며, `deactivate()`에서 복원하지 않음.
- **해야 할 일**:
  - [ ] `vscode.window.createOutputChannel('VSkript')` 기반 전용 로거로 교체하고 전역 패치 제거
  - [ ] 미사용 `src/Vskript/patchLogger.ts`도 함께 삭제 (같은 방식의 패치 코드)

### H3. 자동완성(Completion) 복원본 검증

- **현재 상태**: 커밋 `a7c4ff1`에서 덮어써진 `SkriptCompletionItemProvider.ts`를 직전 버전(`a7c4ff1^`)으로 복원함. 컴파일은 되지만 **실제 자동완성 동작은 미확인**이며, 그 커밋에서 의도했던 변경("use DocumentSymbol")이 있었다면 누락된 상태.
- **해야 할 일**:
  - [ ] 확장 실행 후 자동완성(`{`, `@` 트리거, 함수 완성) 동작 확인
  - [ ] `a7c4ff1` 작성자에게 의도했던 변경 내용 확인 후 필요하면 재적용

---

## 🟠 중간

### M1. 진단(Diagnostics) 병합 로직 / 경쟁 조건

- **현재 상태**: `updateAllDiagnostics()`가 `refreshDiagnostics()`가 설정한 결과를 다시 읽어 버전 경고를 덧붙인 뒤 덮어씀. `setTimeout`으로 지연 실행되어 연속 호출 시 결과가 중복되거나 섞일 수 있음.
- **해야 할 일**:
  - [ ] 구문 진단과 버전 진단을 각각 배열로 계산한 뒤 한 번만 `set` 하도록 변경
  - [ ] 문서별 디바운스 적용

### M2. 버전 호환성 진단 데이터 소스 명확화 (README 불일치)

- **현재 상태**: README는 "Skript Hub 동기화 데이터 기반"이라고 설명하지만, 실제로는 `core_syntax.json`(로컬 번들 데이터)만 사용. `syncWithServer()`, `syncAddonData()`는 어디서도 호출되지 않음.
- **해야 할 일**:
  - [ ] README 설명을 "**내장된 로컬 구문 데이터베이스 기반**"으로 정정
  - [ ] 원격 동기화를 쓸 계획이라면 `activate()` 또는 별도 명령(Command)에 `syncWithServer()` 호출부 연결
  - [ ] 쓰지 않을 계획이라면 죽은 코드(`syncWithServer`, `syncAddonData`, `API_URL`) 제거 (→ H1과 함께 처리)

### M3. 스니펫 동작 확인

- **현재 상태**: `package.json`의 `contributes.snippets`에 등록 완료. 실제 동작은 미확인.
- **해야 할 일**:
  - [ ] 확장 실행 후 `_func`, `_funcr`, `_fx`, `_fxr` 등 prefix 테스트
  - [ ] 정상 동작 확인되면 README 기능(Features) 섹션에 "코드 스니펫" 항목 추가

---

## 🟢 낮음

### L1. 사용되지 않는 코드/리소스 정리

- **현재 상태**: 아래 파일들은 어디서도 import/참조되지 않음.
  - 코드: `src/Java.ts` (`patchLogger.ts`는 H2에서 처리)
  - 리소스: `assets/ko_dict.json`, `src/resource/addon_syntax.json`, `src/resource/lang/default.lang`
- **해야 할 일**:
  - [ ] 연결할지 삭제할지 결정 (`ko_dict.json`은 `vskript.language: ko` 설정과 연결 의도로 보임)

### L2. 테스트 / 린트

- **현재 상태**: `npm test`가 `out/test/runTest.js`를 실행하지만 테스트 코드가 없음. `npm run lint` 결과 오류 0, 경고 200건(대부분 `curly`, 125건은 `--fix`로 자동 수정 가능).
- **해야 할 일**:
  - [ ] 최소한의 확장 활성화 테스트 추가 또는 `test`/`pretest` 스크립트 정리
  - [ ] `eslint --fix`로 자동 수정 가능한 경고 정리

### L3. 개발 도구 의존성 노후화

- **현재 상태**: `eslint@7`, `@typescript-eslint@4`, `mocha@8`, `typescript@4`, `@types/node@12`, `vscode-test`(지원 종료, 후속은 `@vscode/test-electron`) 등 구버전이며 `npm audit`에 취약점 다수. 개발 환경에만 영향을 줌.
- **해야 할 일**:
  - [ ] `vscode-test` → `@vscode/test-electron` 교체
  - [ ] eslint/typescript 계열 메이저 업그레이드 (L2와 함께 진행 권장)

---

## 완료된 항목

- [x] **빌드 깨짐 수정**: 커밋 `a7c4ff1`에서 `SkriptCompletionItemProvider.ts`가 `SkriptDocumentSymbolProvider`와 거의 동일한 코드로 덮어써져 `tsc` 컴파일이 실패하던 문제 → 직전 버전으로 복원 (동작 검증은 H3)
- [x] **VS Code 버전 불일치 수정**: 기준을 1.120.0으로 통일 (`engines.vscode`는 `^1.120.0`, `@types/vscode`는 `~1.120.0`으로 고정 — `^`로 두면 1.144가 설치되어 vsce가 패키징을 거부함). VS Code 1.120 미만은 더 이상 지원하지 않음.
- [x] **스니펫 등록**: `package.json`의 `contributes.snippets`에 추가 (동작 검증은 M3)
- [x] `src/resource/lang/default copy.lang` 삭제 (`default.lang`과 완전히 동일한 사본)
- [x] 중복 devDependency `copyfile` 제거
