# TODO

향후 개선이 필요한 항목을 **위험도(중요도) 순**으로 정리한 목록입니다. (최종 갱신: 2026-11-03)

| 등급 | 기준 |
|---|---|
| 🔴 높음 | 보안 취약점, 사용자 환경/다른 확장에 영향, 기능 고장 가능성 |
| 🟠 중간 | 잘못된 결과·문서 불일치, 유지보수 부담 |
| 🟢 낮음 | 코드 품질, 정리 작업 |

---

## 🔴 높음

(없음)

---

## 🟠 중간

### M1. 진단(Diagnostics) 병합 로직 / 경쟁 조건

- **현재 상태**: `updateAllDiagnostics()`가 `refreshDiagnostics()`가 설정한 결과를 다시 읽어 버전 경고를 덧붙인 뒤 덮어씀. `setTimeout`으로 지연 실행되어 연속 호출 시 결과가 중복되거나 섞일 수 있음.
- **해야 할 일**:
  - [ ] 구문 진단과 버전 진단을 각각 배열로 계산한 뒤 한 번만 `set` 하도록 변경
  - [ ] 문서별 디바운스 적용

### M2. 버전 호환성 진단 활성화

- **현재 상태**: 진단의 버전 검사는 `enableSyntaxCheck = false`로 꺼져 있음. H1에서 검사 로직을 `SyntaxRegistry` 기준(현재 버전에 유효한 구문이 없고 다른 버전에는 있을 때 경고)으로 바꿔 두었고, 버전 결정은 파일 주석(`# version:` > `# mc:`) > 서버 환경 > 미상(미상이면 검사 안 함).
- **해야 할 일**:
  - [ ] 패턴 매칭 정확도 확인 후 검사 활성화 (가짜 경고 여부를 실제 스크립트로 확인; `findMatch`는 줄 단위 전체 매칭이라 표현식 중첩은 못 봄)
  - [x] README 설명을 실제 동작에 맞게 정정 (2026-11-03): "버전 호환성 진단" 대신 "구문별 버전 검사는 아직 꺼져 있음"으로 명시

### M3. 스니펫 동작 확인

- **현재 상태**: `package.json`의 `contributes.snippets`에 등록 완료. 실제 동작은 미확인.
- **해야 할 일**:
  - [ ] 확장 실행 후 `_func`, `_funcr`, `_fx`, `_fxr` 등 prefix 테스트
  - [ ] 정상 동작 확인되면 README 기능(Features) 섹션에 "코드 스니펫" 항목 추가

---

## 🟢 낮음

(없음)

---

## 완료된 항목

- [x] **H3. 자동완성/호버 실제 사용 환경 검증** (2026-11-03): 통합 테스트 `src/test/suite/environment.test.ts`로 자동화 — 임시 서버 폴더(`plugins/Skript.jar`, Skript 2.10.0) 감지 → GitHub에서 DataPack 다운로드 → 감지 버전으로 자동완성 필터 → `vskript.language: ko` 한국어 호버 (오프라인이면 건너뜀). 이 과정에서 버그 발견·수정: 감지가 진행 중일 때(예: 시작 직후 첫 DataPack 다운로드) "다시 감지" 명령이 **옛 설정으로 시작된 결과**를 돌려주던 문제 → 진행 중인 감지가 끝나면 바로 한 번 더 감지하고 그 결과로 완료
  - `a7c4ff1`("use DocumentSymbol") 분석: 아웃라인(`SkriptDocumentSymbolProvider.ts`)에 넣으려던 변경 2개가 자동완성 파일에 잘못 덮어써진 것으로 판단 → 아웃라인에 적용. ① 함수 매개변수 타입이 `[object Object]`로 표시되던 버그 수정(`p.type.text`) ② 수정 중인 문서도 아웃라인 캐시 재사용(모델은 350ms 디바운스 때 갱신되므로 결과 동일, 계산만 줄어듦). 아웃라인 테스트 추가
- [x] **H2. 전역 `console.log` 가로채기 제거** (2026-11-03): `activate()`의 전역 `console.log`/`console.info` 덮어쓰기와 미사용 `patchLogger.ts` 삭제. 새 `src/Vskript/Logger.ts`가 출력 패널의 "VSkript" 로그 채널(`LogOutputChannel`) 하나에 기록하며 `ServerEnvironment`도 같은 채널을 씀(같은 이름의 채널이 두 개 생기던 문제 해소). 타이핑·스캔마다 찍히던 기록은 debug 수준으로 내림(출력 패널에서 수준 변경 가능). 재발 방지: eslint `no-restricted-syntax`로 `console.* =` 대입을 **오류** 처리 → `npm test`(린트 포함)에서 실패. 런타임 테스트는 테스트 실행기가 console을 계속 다시 감싸서 함수 비교가 불가능해 쓰지 않음
- [x] **L3. 개발 도구 의존성 업그레이드** (2026-11-03): typescript 4 → 6.0(typescript-eslint가 `<6.1`까지 지원해 7.x는 보류), eslint 7 → 10 + typescript-eslint 8(`.eslintrc.json` → `eslint.config.mjs`), `vscode-test` → `@vscode/test-cli` + `@vscode/test-electron`, mocha 8 → 11, `@types/node` 12 → 22, `copyfiles` → `fs.cpSync`, 미사용 `glob`/`@types/glob` 제거. 런타임 의존성 취약점 0건. 남은 `npm audit` 17건은 전부 테스트 도구(mocha, @vscode/test-cli) 하위 의존성이며 상위 수정판 없음
- [x] **L2. 테스트 / 린트** (2026-11-03): `npm test` = 컴파일 → 린트 → VS Code 1.120 통합 테스트(단위 5 + 통합 4). VS Code 없이 빠르게 돌리는 `npm run test:unit`. 린트 경고 190 → 0 (`--fix`, `naming-convention`은 외부 JSON 필드명 snake_case·enum UPPER_CASE 허용, `eqeqeq`는 `== null` 허용, 나머지 지역 변수명 정리)
- [x] **L1. 미사용 코드/리소스 삭제** (2026-11-03): `src/Java.ts`(실제로는 `Class<T>` 타입 하나만 쓰여 `SkriptDocument.ts`로 이동), `language/Materials.ts`, `language/SkriptEffects.ts`, `assets/ko_dict.json`, `src/resource/addon_syntax.json`, `src/resource/lang/default.lang`
- [x] **저장되지 않은 문서 열기 오류 수정** (2026-11-03): untitled `.sk` 문서를 열면 디스크 스캔이 ENOENT 예외를 내던 문제 (통합 테스트에서 발견)
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
