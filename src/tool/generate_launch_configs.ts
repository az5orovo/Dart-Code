import * as fs from "fs";
import { flatMap } from "../shared/utils";
import { unique } from "../shared/utils/array";
import { getDebugAdapterPort } from "../shared/utils/debug";

const launchConfigPath = ".vscode/launch.json";
const debuggerEntry = "out/dist/debug.js";
const testFolder = "out/src/test";
const testProjectsFolder = "src/test/test_projects";

const testConfigs: TestConfig[] = [
	{ testFolder: "dart", project: "hello_world" },
	{ testFolder: "dart", project: "hello_world", lsp: true },
	{ testFolder: "dart_debug", project: "hello_world", debugAdapters: ["dart", "dart_test"] },
	{ testFolder: "web_debug", project: "web", debugAdapters: ["web", "web_test"] },
	{ testFolder: "flutter", project: "flutter_hello_world" },
	{ testFolder: "flutter", project: "flutter_hello_world", lsp: true },
	{ testFolder: "flutter_debug", project: "flutter_hello_world", debugAdapters: ["flutter"] },
	{ testFolder: "flutter_debug", project: "flutter_hello_world", debugAdapters: ["flutter"], chrome: true },
	{ testFolder: "flutter_test_debug", project: "flutter_hello_world", debugAdapters: ["flutter_test"] },
	{ testFolder: "multi_root", project: "projects.code-workspace" },
	{ testFolder: "multi_project_folder", project: "" },
	{ testFolder: "dart_create_tests", project: "dart_create_tests.code-workspace" },
	{ testFolder: "not_activated/dart_create", project: "empty" },
	{ testFolder: "flutter_create_tests", project: "flutter_create_tests.code-workspace" },
	{ testFolder: "not_activated/flutter_create", project: "empty" },
	{ testFolder: "flutter_bazel", project: "bazel_workspace/flutter_hello_world_bazel" },
	{ testFolder: "flutter_snap", project: "empty" },
	{ testFolder: "flutter_repository", project: "${env:FLUTTER_ROOT}" },
];

async function main() {
	const debugAdapters = unique(flatMap(testConfigs, (t) => t.debugAdapters || []));
	const launchConfig = {
		"version": "0.1.0",
		"configurations": [
			getExtensionConfig(),
			getGenerateLaunchConfigConfig(),
			...debugAdapters.map((name) => getDebugServerConfig(name)),
			...testConfigs.map(getTestsConfig),
		],
		"compounds": [
			{
				"name": "Extension + DAs",
				"configurations": [
					"Extension",
					...debugAdapters.map((name) => getDebugServerConfigName(name))
				],
				"presentation": {
					"order": 1
				},
				"stopAll": true,
			},
			...testConfigs.map((test) => {
				const testConfigName = getTestConfigName(test);
				return {
					"name": `${testConfigName} + DAs`,
					"configurations": [
						`${testConfigName}`,
						...debugAdapters
							.filter((name) => test.debugAdapters?.find((da) => name === da))
							.map((name) => getDebugServerConfigName(name))
					],
					"presentation": {
						"order": 3
					},
					"stopAll": true,
				};
			})
		],
	}

	const header = '// This file was generated by src/tool/generate_launch_configs.ts!';
	const configJson = JSON.stringify(launchConfig, undefined, "\t");
	fs.writeFileSync(launchConfigPath, `${header}\n${configJson}\n`);
}

const template = {
	"request": "launch",
	"outFiles": [
		"${workspaceFolder}/out/**/*.js"
	],
	"smartStep": true,
	"skipFiles": [
		"<node_internals>/**",
		"**/app/out/vs/**"
	]
};

function getConfigName(input: string) {
	return input.replace("/", "_/_").split("_").map(titleCase).join(" ");
}

function getDebugServerConfigName(debugType: string) {
	return `${getConfigName(debugType)} Debug Server`;
}

function getTestConfigName(test: TestConfig) {
	let name = getConfigName(test.testFolder);
	if (test.lsp)
		name = `${name} LSP`;
	if (test.chrome)
		name = `${name} Chrome`;
	return `${name} Tests`;
}

function titleCase(input: string) {
	return `${input[0].toUpperCase()}${input.slice(1)}`;
}

function getExtensionConfig() {
	return Object.assign({
		"name": "Extension",
		"type": "extensionHost",
		"runtimeExecutable": "${execPath}",
		"args": [
			"--extensionDevelopmentPath=${workspaceFolder}"
		],
		"env": {
			"DART_CODE_USE_DEBUG_SERVERS": "true",
		},
		"preLaunchTask": "npm: watch",
		"presentation": {
			"hidden": true,
		}
	}, template);
}

function getGenerateLaunchConfigConfig() {
	return Object.assign({
		"name": "Generate launch.json",
		"type": "node",
		"cwd": "${workspaceFolder}",
		"program": "${workspaceFolder}/src/tool/generate_launch_configs.ts",
		"preLaunchTask": "npm: watch",
		"presentation": {
			"order": 2,
		}
	}, template);
}

function getDebugServerConfig(debugType: string) {
	const port = getDebugAdapterPort(debugType);
	return Object.assign({
		"name": getDebugServerConfigName(debugType),
		"type": "node",
		"cwd": "${workspaceFolder}",
		"program": `\${workspaceFolder}/${debuggerEntry}`,
		"args": [
			debugType,
			`--server=${port}`
		],
		"preLaunchTask": "npm: watch",
		"presentation": {
			"hidden": true,
		}
	}, template);
}

function getTestsConfig(test: TestConfig) {
	const name = getTestConfigName(test);
	return Object.assign({
		"name": name,
		"type": "extensionHost",
		"runtimeExecutable": "${execPath}",
		"args": [
			test.project.startsWith("${env:") ? test.project : `\${workspaceFolder}/${testProjectsFolder}/${test.project}`,
			"--extensionDevelopmentPath=${workspaceFolder}",
			`--extensionTestsPath=\${workspaceFolder}/${testFolder}/${test.testFolder}`,
			"--user-data-dir=${workspaceFolder}/.dart_code_test_data_dir"
		],
		"env": {
			"DART_CODE_USE_DEBUG_SERVERS": "true",
			"DART_CODE_IS_TEST_RUN": "true",
			"DART_CODE_FORCE_LSP": test.lsp ? "true" : undefined,
			"FLUTTER_TEST_DEVICE_ID": test.chrome ? "chrome" : undefined,
		},
		"preLaunchTask": "npm: watch",
		"presentation": {
			"hidden": true,
		}
	}, template);
}

interface TestConfig {
	testFolder: string;
	project: string;
	debugAdapters?: string[];
	lsp?: boolean;
	chrome?: boolean;
}

// tslint:disable-next-line: no-floating-promises
main();
