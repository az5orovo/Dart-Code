"use strict";

import { workspace, WorkspaceConfiguration } from "vscode";

class Config {
	config: WorkspaceConfiguration;

	constructor() {
		workspace.onDidChangeConfiguration(e => this.loadConfig());
		this.loadConfig();
	}

	private loadConfig() {
		this.config = workspace.getConfiguration("dart");
	}

	private getConfig<T>(key: string): T {
		return this.config.get<T>(key);
	}

	get allowAnalytics() { return this.getConfig<boolean>("allowAnalytics"); }
	get analyzerDiagnosticsPort() { return this.getConfig<number>("analyzerDiagnosticsPort"); }
	get analyzerLogFile() { return this.getConfig<string>("analyzerLogFile"); }
	get lineLength() { return this.getConfig<number>("lineLength"); }
	get setIndentation() { return this.getConfig<number>("setIndentation"); }
	get showTodos() { return this.getConfig<boolean>("showTodos"); }
	get userDefinedSdkPath() { return this.getConfig<string>("sdkPath"); }
}

export const config = new Config();