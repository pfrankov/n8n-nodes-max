module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/nodes', '<rootDir>/credentials'],
	testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
	transform: {
		'^.+\\.ts$': [
			'ts-jest',
			{
				tsconfig: {
					module: 'commonjs',
					target: 'es2019',
					lib: ['es2019', 'es2020'],
					moduleResolution: 'node',
					esModuleInterop: true,
					allowSyntheticDefaultImports: true,
					strict: true,
					skipLibCheck: true,
					types: ['jest', 'node'],
				},
			},
		],
	},
	collectCoverageFrom: [
		'credentials/**/*.ts',
		'nodes/**/*.ts',
		'!**/*.test.ts',
		'!**/tests/**',
		'!**/*.d.ts',
	],
	coverageThreshold: {
		global: {
			branches: 88.54,
			functions: 98.78,
			lines: 92.89,
			statements: 92.71,
		},
	},
	coverageReporters: ['text', 'lcov', 'html'],
	moduleFileExtensions: ['ts', 'js', 'json'],
	setupFilesAfterEnv: [],
	testTimeout: 10000,
	silent: true,
	testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
