# TODO

향후 개선이 필요한 항목을 **위험도(중요도) 순**으로 정리한 목록입니다. (최종 갱신: 2026-11-03)

| 등급 | 기준 |
|---|---|
| 🔴 높음 | 보안 취약점, 사용자 환경/다른 확장에 영향, 기능 고장 가능성 |
| 🟠 중간 | 잘못된 결과·문서 불일치, 유지보수 부담 |
| 🟢 낮음 | 코드 품질, 정리 작업 |

---

## 🔴 높음

### H2. 전역 `console.log` 가로채기

- **현재 상태**: `extension.ts`의 `activate()`에서 `console.log`/`console.info`를 전역으로 덮어씀. 같은 확장 호스트에서 돌아가는 **다른 확장의 로그까지 변형·누락**될 수 있으며, `deactivate()`에서 복원하지 않음.
- **해야 할 일**:
  - [ ] `vscode.window.createOutputChannel('VSkript')` 기반 전용 로거로 교체하고 전역 패치 제거
  - [ ] 미사용 `src/Vskript/patchLogger.ts`도 함께 삭제 (같은 방식의 패치 코드)

### H3. 자동완성(Completion) 실제 동작 검증

- **현재 상태**: H1 작업으로 `SkriptCompletionItemProvider.ts`를 `SyntaxRegistry` 기반으로 다시 작성함 (커밋 `a7c4ff1` 복원본 문제는 해소). 컴파일·레지스트리 단위 확인은 했지만 **확장을 실행한 상태의 자동완성 동작은 미확인**.
- **해야 할 일**:
  - [ ] 확장 실행 후 자동완성(`{@` 옵션, 구문 제안, 버전별 제안 수 변화), 호버(`vskript.language: ko`일 때 번역 설명) 동작 확인
  - [ ] `a7c4ff1` 작성자에게 의도했던 변경("use DocumentSymbol") 확인 후 필요하면 재적용

---

## 🟠 중간

### M1. 진단(Diagnostics) 병합 로직 / 경쟁 조건

- **현재 상태**: `updateAllDiagnostics()`가 `refreshDiagnostics()`가 설정한 결과를 다시 읽어 버전 경고를 덧붙인 뒤 덮어씀. `setTimeout`으로 지연 실행되어 연속 호출 시 결과가 중복되거나 섞일 수 있음.
- **해야 할 일**:
  - [ ] 구문 진단과 버전 진단을 각각 배열로 계산한 뒤 한 번만 `set` 하도록 변경
  - [ ] 문서별 디바운스 적용

### M2. 버전 호환성 진단 실제 동작 (README 불일치)

- **현재 상태**: README는 "버전 호환성을 진단"한다고 설명하지만, 진단의 버전 검사는 `enableSyntaxCheck = false`로 꺼져 있음. H1에서 검사 로직을 `SyntaxRegistry` 기준(현재 버전에 유효한 구문이 없고 다른 버전에는 있을 때 경고)으로 바꿔 두었고, 버전 결정은 파일 주석(`# version:` > `# mc:`) > 서버 환경 > 미상(미상이면 검사 안 함).
- **해야 할 일**:
  - [ ] 패턴 매칭 정확도 확인 후 검사 활성화 (가짜 경고 여부를 실제 스크립트로 확인; `findMatch`는 줄 단위 전체 매칭이라 표현식 중첩은 못 봄)
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
  - [ ] 삭제 검토 (`ko_dict.json`의 역할은 DataPack의 `guide.description`이 대신함 — H1)

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

- [x] **H1. 내려받은 DataPack을 자동완성/호버/진단에 연결** (2026-11-03): `src/Vskript/syntax/`
  - `SyntaxRegistry`: 번들 `core_syntax.json` + DataPack을 하나로 합친 구문 저장소. Skript DataPack이 있으면 번들 core 대신 사용(번들은 오프라인·캐시 없음일 때 폴백). 자동완성·호버·진단은 이것만 봄 → `SkriptHubClient` 삭제(쓰이지 않던 `globalStorage/syntax_db.json` 쓰기도 제거)
  - 버전 필터(`SyntaxVersion`): `valid_from_addon_version_parsed`(+`valid_until_*`) 기준, 비교 규칙은 vskript-database `version.js`의 `compareVersions`와 동일. 설치 버전을 모르거나 시작 버전이 부정확(`before`/`or_earlier`/`unknown`)하면 숨기지 않음. Skript 버전 = 파일 주석 > 서버 환경, 애드온 버전 = 서버 환경
  - 호버: 옵션·함수 다음으로 구문 호버 추가. `vskript.language: ko`이고 번역이 있으면 `guide.description`(stale이면 표시), 아니면 원문. 현재 버전에서 못 쓰는 구문이면 경고 표시
  - `onDidChangeEnvironment` → 레지스트리 재로딩 → `onDidReload` → 진단 갱신
  - `SkriptPattern`: Skript 패턴(`[]`, `(|)`, `%%`, `<>`, `1¦`, `tag:`)을 정규식·자동완성 레이블로 변환
  - 자동완성에서 제거: `ko_dict` 읽기, 가짜 "온디맨드 애드온"(확장 설치 폴더에 mock JSON을 쓰던 코드)과 이에만 연결돼 있던 `# addons:` 주석. 구문 설명은 `resolveCompletionItem`에서 지연 생성
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
