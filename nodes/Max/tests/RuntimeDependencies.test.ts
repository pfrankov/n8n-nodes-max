import { readFileSync, readdirSync } from 'fs';
import { builtinModules } from 'module';
import { join, relative, resolve } from 'path';
import ts from 'typescript';

interface PackageManifest {
	dependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
}

const projectRoot = resolve(__dirname, '../../..');
const sourceRoots = [resolve(projectRoot, 'nodes'), resolve(projectRoot, 'credentials')];
const ignoredDirectories = new Set(['tests', '__tests__']);
const manifest = JSON.parse(
	readFileSync(resolve(projectRoot, 'package.json'), 'utf8'),
) as PackageManifest;
const declaredRuntimePackages = new Set([
	...Object.keys(manifest.dependencies ?? {}),
	...Object.keys(manifest.optionalDependencies ?? {}),
	...Object.keys(manifest.peerDependencies ?? {}),
]);

function findRuntimeSourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true })
		.flatMap((entry) => {
			const entryPath = join(directory, entry.name);

			if (entry.isDirectory()) {
				return ignoredDirectories.has(entry.name) ? [] : findRuntimeSourceFiles(entryPath);
			}

			return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')
				? [entryPath]
				: [];
		})
		.sort();
}

function importClauseHasRuntimeBindings(importClause: ts.ImportClause | undefined): boolean {
	if (!importClause) {
		return true;
	}

	if (importClause.isTypeOnly) {
		return false;
	}

	if (importClause.name) {
		return true;
	}

	const namedBindings = importClause.namedBindings;
	if (!namedBindings) {
		return false;
	}

	if (ts.isNamespaceImport(namedBindings)) {
		return true;
	}

	return namedBindings.elements.some((element) => !element.isTypeOnly);
}

function exportDeclarationHasRuntimeBindings(declaration: ts.ExportDeclaration): boolean {
	if (declaration.isTypeOnly) {
		return false;
	}

	if (!declaration.exportClause || ts.isNamespaceExport(declaration.exportClause)) {
		return true;
	}

	return declaration.exportClause.elements.some((element) => !element.isTypeOnly);
}

function collectRuntimeModuleSpecifiers(filePath: string): string[] {
	const sourceFile = ts.createSourceFile(
		filePath,
		readFileSync(filePath, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const moduleSpecifiers = new Set<string>();

	const addStringLiteral = (expression: ts.Expression | undefined) => {
		if (expression && ts.isStringLiteralLike(expression)) {
			moduleSpecifiers.add(expression.text);
		}
	};

	const visit = (node: ts.Node) => {
		if (ts.isImportDeclaration(node) && importClauseHasRuntimeBindings(node.importClause)) {
			addStringLiteral(node.moduleSpecifier);
		} else if (
			ts.isExportDeclaration(node) &&
			exportDeclarationHasRuntimeBindings(node)
		) {
			addStringLiteral(node.moduleSpecifier);
		} else if (
			ts.isImportEqualsDeclaration(node) &&
			!node.isTypeOnly &&
			ts.isExternalModuleReference(node.moduleReference)
		) {
			addStringLiteral(node.moduleReference.expression);
		} else if (ts.isCallExpression(node)) {
			const isRequireCall = ts.isIdentifier(node.expression) && node.expression.text === 'require';
			const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;

			if (isRequireCall || isDynamicImport) {
				addStringLiteral(node.arguments[0]);
			}
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return [...moduleSpecifiers].sort();
}

function getPackageName(moduleSpecifier: string): string {
	const parts = moduleSpecifier.split('/');

	if (moduleSpecifier.startsWith('@') && parts.length >= 2) {
		return `${parts[0]}/${parts[1]}`;
	}

	return parts[0] ?? moduleSpecifier;
}

function isNodeBuiltin(moduleSpecifier: string): boolean {
	const normalizedSpecifier = moduleSpecifier.startsWith('node:')
		? moduleSpecifier.slice('node:'.length)
		: moduleSpecifier;
	const rootSpecifier = normalizedSpecifier.split('/')[0] ?? normalizedSpecifier;

	return builtinModules.includes(normalizedSpecifier) || builtinModules.includes(rootSpecifier);
}

function isExternalModule(moduleSpecifier: string): boolean {
	return !moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/');
}

describe('published package runtime dependencies', () => {
	it('declares every external runtime import', () => {
		const missingDeclarations = new Set<string>();

		for (const filePath of sourceRoots.flatMap(findRuntimeSourceFiles)) {
			for (const moduleSpecifier of collectRuntimeModuleSpecifiers(filePath)) {
				if (!isExternalModule(moduleSpecifier) || isNodeBuiltin(moduleSpecifier)) {
					continue;
				}

				const packageName = getPackageName(moduleSpecifier);
				if (!declaredRuntimePackages.has(packageName)) {
					const relativePath = relative(projectRoot, filePath).split('\\').join('/');
					missingDeclarations.add(`${packageName} imported by ${relativePath}`);
				}
			}
		}

		expect([...missingDeclarations].sort()).toEqual([]);
	});
});
