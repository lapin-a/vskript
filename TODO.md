# TODO

향후 개선이 필요한 항목을 **위험도(중요도) 순**으로 정리한 목록입니다. (최종 갱신: 2026-11-03)

| 등급 | 기준 |
|---|---|
| 🔴 높음 | 보안 취약점, 사용자 환경/다른 확장에 영향, 기능 고장 가능성 |
| 🟠 중간 | 잘못된 결과·문서 불일치, 유지보수 부담 |
| 🟢 낮음 | 코드 품질, 정리 작업 |

---

## 🔴 높음

### H1. 내려받은 DataPack을 자동완성/호버/진단에 연결

- **현재 상태**: 서버 환경 감지와 DataPack 다운로드·캐시는 동작하지만(`src/Vskript/env/`), 받은 데이터는 아직 **Skript 버전 결정에만** 쓰임. 자동완성·호버·진단은 여전히 번들 `core_syntax.json`을 각자 따로 읽음 (진단·자동완성·SkriptHubClient 3곳).
- **해야 할 일**:
  - [ ] `core_syntax.json`과 DataPack을 합친 단일 구문 저장소(레지스트리)를 만들고 세 곳이 그것만 보도록 정리
  - [ ] 버전 필터: `valid_from_addon_version_parsed`로 현재 Skript/애드온 버전에서 유효한 구문만 제안
  - [ ] 호버에 `guide.description`(한국어) 표시 (`vskript.language: ko`일 때)
  - [ ] `onDidChangeEnvironment` 이벤트로 데이터 갱신 시 재로딩
- **선행 조건**: vskript-database의 schema 2 DataPack이 GitHub에 push되어야 원격 다운로드가 동작함 (현재 원격은 schema 1 → 확장이 "지원하지 않는 형식"으로 거부하고 캐시/번들 데이터로 동작)

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

### M2. 버전 호환성 진단 실제 동작 (README 불일치)

- **현재 상태**: README는 "버전 호환성을 진단"한다고 설명하지만, `SkriptDiagnostics.ts`의 버전별 구문 검사는 `enableSyntaxCheck = false`로 꺼져 있고 `checkVersionCompatibility()`는 빈 배열만 반환. 버전 결정(파일 주석 > 서버 환경 > 기본 2.7)은 이제 동작함.
- **해야 할 일**:
  - [ ] H1(DataPack 연결) 후 버전 검사 활성화
  - [ ] 그 전까지 README 설명을 실제 동작에 맞게 정정

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

- [x] **서버 환경 감지 + DataPack 다운로드** (2026-11-03): `src/Vskript/env/`
  - `plugins` 폴더 자동 탐색(`vskript.serverPath`로 지정 가능) → jar 안의 `plugin.yml`/`paper-plugin.yml`에서 이름·버전 읽기 (실패 시 파일명 추정)
  - 설정 `vskript.skriptVersion`, `vskript.addons`(`이름@버전`)가 감지 결과를 덮어씀. 감지값과 다르면 **같은 불일치당 알림 1회** (내용이 바뀌면 다시 알림, 명령 실행 시 항상 알림)
  - vskript-database DataPack을 `content_hash` 비교로 바뀐 애드온만 내려받고 해시 검증 후 `globalStorageUri`에 캐시. 오프라인이면 캐시 사용
  - 상태 표시줄(Skript 버전·애드온 수·불일치 표시), 명령 `VSkript: 서버 환경 보기` / `서버 환경 다시 감지 및 구문 데이터 동기화`, jar 변경·설정 변경 시 자동 재감지
  - 진단의 Skript 버전 = 파일 주석 > 서버 환경 > 기본 2.7 (기존: 주석 > 2.7)
- [x] **`axios` 제거** (2026-11-03): 호출되지 않던 `syncWithServer`/`syncAddonData`와 함께 삭제. 다운로드는 내장 `fetch` 사용. 런타임 의존성 취약점 0건

- [x] **빌드 깨짐 수정**: 커밋 `a7c4ff1`에서 `SkriptCompletionItemProvider.ts`가 `SkriptDocumentSymbolProvider`와 거의 동일한 코드로 덮어써져 `tsc` 컴파일이 실패하던 문제 → 직전 버전으로 복원 (동작 검증은 H3)
- [x] **VS Code 버전 불일치 수정**: 기준을 1.120.0으로 통일 (`engines.vscode`는 `^1.120.0`, `@types/vscode`는 `~1.120.0`으로 고정 — `^`로 두면 1.144가 설치되어 vsce가 패키징을 거부함). VS Code 1.120 미만은 더 이상 지원하지 않음.
- [x] **스니펫 등록**: `package.json`의 `contributes.snippets`에 추가 (동작 검증은 M3)
- [x] `src/resource/lang/default copy.lang` 삭제 (`default.lang`과 완전히 동일한 사본)
- [x] 중복 devDependency `copyfile` 제거
