// @ts-check
import tseslint from 'typescript-eslint';

// 기존 .eslintrc.json 규칙을 그대로 옮김 (eslint 9+ flat config)
export default tseslint.config(
    { ignores: ['out/**', 'node_modules/**', '.vscode-test/**', '**/*.d.ts'] },
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 2022,
            sourceType: 'module',
        },
        plugins: { '@typescript-eslint': tseslint.plugin },
        rules: {
            '@typescript-eslint/naming-convention': 'warn',
            curly: 'warn',
            eqeqeq: 'warn',
            'no-throw-literal': 'warn',
            semi: 'warn',
        },
    },
);
