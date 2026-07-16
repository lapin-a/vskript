# TODO

향후 개선이 필요한 항목을 정리한 목록입니다. (README 검증 과정에서 발견된 코드-설명 불일치 2건 포함)

## 1. 버전 호환성 진단 데이터 소스 명확화 / 실제 서버 동기화 구현

- **현재 상태**: `SkriptHubClient.ts`에 `syncWithServer()`, `syncAddonData()` 메서드가 구현되어 있으나 어디서도 호출되지 않음. 실제로는 `core_syntax.json`(로컬 번들 데이터)만 사용 중.
- **해야 할 일**:
  - [ ] README의 "버전 호환성 진단" 설명을 "Skript Hub 동기화 데이터 기반"이 아닌 "**내장된 로컬 구문 데이터베이스 기반**"으로 정정
  - [ ] 실제로 원격 동기화 기능을 사용할 계획이라면, `activate()` 또는 별도 명령(Command)에서 `syncWithServer()` 호출부 연결
  - [ ] 원격 동기화를 쓰지 않을 계획이라면, 죽은 코드(`syncWithServer`, `syncAddonData`, `API_URL`)와 `axios` 의존성 제거 검토

## 2. 코드 스니펫 기능 등록

- **현재 상태**: `snippets.code-snippets` 파일은 저장소에 존재하지만 `package.json`의 `contributes`에 `snippets` 항목이 없어 VSCode가 이를 인식하지 못함 (미동작 상태).
- **해야 할 일**:
  - [ ] `package.json`의 `contributes`에 아래와 같이 스니펫 등록
    ```json
    "snippets": [
      {
        "language": "vskript",
        "path": "./snippets.code-snippets"
      }
    ]
    ```
  - [ ] 등록 후 실제 동작 확인 (`_func`, `_funcr` 등 prefix 테스트)
  - [ ] 정상 동작 확인되면 README 기능(Features) 섹션에 "코드 스니펫" 항목 추가
