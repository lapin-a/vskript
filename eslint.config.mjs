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
            '@typescript-eslint/naming-convention': ['warn',
                { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
                { selector: 'variable', format: ['camelCase', 'UPPER_CASE'], leadingUnderscore: 'allow' },
                { selector: 'import', format: ['camelCase', 'PascalCase'] },
                { selector: 'typeLike', format: ['PascalCase'] },
                { selector: 'enumMember', format: ['UPPER_CASE', 'PascalCase'] },
                // DataPack / plugin.yml 등 외부 JSON 필드명은 원본(snake_case)을 그대로 쓴다
                { selector: ['objectLiteralProperty', 'typeProperty'], format: ['camelCase', 'snake_case', 'UPPER_CASE'] },
                // 따옴표로 감싼 속성 이름은 검사하지 않음 ("on load:" 같은 데이터 키)
                { selector: ['objectLiteralProperty', 'typeProperty'], modifiers: ['requiresQuotes'], format: null },
            ],
            curly: 'warn',
            // `x == null`(null·undefined 동시 검사)은 허용
            eqeqeq: ['warn', 'always', { null: 'ignore' }],
            'no-throw-literal': 'warn',
            semi: 'warn',
        },
    },
);
