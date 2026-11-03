import { defineConfig } from '@vscode/test-cli';

// VS Code 기준 버전(engines.vscode ^1.120.0)으로 확장 통합 테스트 실행
export default defineConfig({
    files: 'out/test/**/*.test.js',
    version: '1.120.0',
    mocha: { ui: 'tdd', timeout: 30000 },
});
