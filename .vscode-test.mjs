import { defineConfig } from '@vscode/test-cli';

// VS Code 기준 버전(engines.vscode ^1.120.0)으로 확장 통합 테스트 실행.
// 작업 공간: 열려 있지 않은 파일로 정의 이동, .sk 작업 공간 자동 활성화 등을 확인하는 고정 파일들
export default defineConfig({
    files: 'out/test/**/*.test.js',
    version: '1.120.0',
    workspaceFolder: './src/test/fixtures/workspace',
    mocha: { ui: 'tdd', timeout: 30000 },
});
