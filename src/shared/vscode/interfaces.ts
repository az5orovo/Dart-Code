import { CompletionItem, CompletionItemProvider, DebugConfigurationProvider, DebugSession, DebugSessionCustomEvent, MarkdownString, RenameProvider, TextDocument, TreeDataProvider, TreeItem, Uri } from "vscode";
import * as lsp from "../analysis/lsp/custom_protocol";
import { AvailableSuggestion, FlutterOutline, Outline } from "../analysis_server_types";
import { Analyzer } from "../analyzer";
import { VersionStatus, VmService, VmServiceExtension } from "../enums";
import { WebClient } from "../fetch";
import { CustomScript, SpawnedProcess } from "../interfaces";
import { EmittingLogger } from "../logging";
import { TestSessionCoordindator } from "../test/coordindator";
import { TreeNode } from "../test/test_model";
import { WorkspaceContext } from "../workspace";
import { Context } from "./workspace";

export interface DebugCommandHandler {
	vmServices: {
		serviceIsRegistered(service: VmService): boolean;
		serviceExtensionIsLoaded(extension: VmServiceExtension): boolean;
	};
	handleDebugSessionStart(session: DebugSession): void;
	handleDebugSessionEnd(session: DebugSession): void;
	handleDebugSessionCustomEvent(e: DebugSessionCustomEvent): void;
}

export interface InternalExtensionApi {
	analyzerCapabilities?: {
		supportsGetSignature: boolean;
		supportsAvailableSuggestions: boolean;
		supportsIncludedImports: boolean;
	};
	cancelAllAnalysisRequests: () => void;
	completionItemProvider: CompletionItemProvider;
	context: Context;
	currentAnalysis: () => Promise<void>;
	cursorIsInTest: boolean;
	isInTestFileThatHasImplementation: boolean;
	isInImplementationFileThatCanHaveTest: boolean;
	isLsp: boolean;
	dartCapabilities: {
		includesSourceForSdkLibs: boolean;
		supportsPubOutdated: boolean;
		supportsDartPub: boolean;
		version: string;
		webSupportsDebugging: boolean;
		webSupportsEvaluation: boolean;
		webSupportsHotReload: boolean;
	};
	debugCommands: DebugCommandHandler;
	debugProvider: DebugConfigurationProvider;
	debugSessions: Array<{ loadedServiceExtensions: VmServiceExtension[] }>;
	envUtils: {
		openInBrowser(url: string): Promise<boolean>;
	};
	fileTracker: {
		getOutlineFor(file: Uri): Outline | lsp.Outline | undefined;
		getFlutterOutlineFor?: (file: Uri) => FlutterOutline | lsp.FlutterOutline | undefined;
		getLastPriorityFiles?: () => string[];
		getLastSubscribedFiles?: () => string[];
	};
	flutterCapabilities: {
		hasLatestStructuredErrorsWork: boolean;
		webSupportsDebugging: boolean;
		webSupportsEvaluation: boolean;
		webSupportsHotReload: boolean;
	};
	flutterOutlineTreeProvider: TreeDataProvider<TreeNode> | undefined;
	getLogHeader: () => string;
	initialAnalysis: Promise<void>;
	logger: EmittingLogger;
	analyzer: Analyzer;
	nextAnalysis: () => Promise<void>;
	packagesTreeProvider: TreeDataProvider<TreeItem>;
	pubGlobal: {
		promptToInstallIfRequired(packageName: string, packageID: string, moreInfoLink?: string, requiredVersion?: string, customActivateScript?: CustomScript, autoUpdate?: boolean): Promise<string | undefined>;
		checkVersionStatus(packageID: string, installedVersion: string | undefined, requiredVersion?: string): Promise<VersionStatus>;
		getInstalledVersion(packageName: string, packageID: string): Promise<string | undefined>;
		uninstall(packageID: string): Promise<void>;
	};
	renameProvider: RenameProvider | undefined;
	safeToolSpawn: (workingDirectory: string | undefined, binPath: string, args: string[], envOverrides?: { [key: string]: string | undefined }) => SpawnedProcess;
	testTreeProvider: TreeDataProvider<TreeNode>;
	testCoordinator: TestSessionCoordindator;
	webClient: WebClient;
	workspaceContext: WorkspaceContext;
}

export interface DelayedCompletionItem extends LazyCompletionItem {
	autoImportUri: string;
	document: TextDocument;
	enableCommitCharacters: boolean;
	filePath: string;
	insertArgumentPlaceholders: boolean;
	nextCharacter: string;
	offset: number;
	relevance: number;
	replacementLength: number;
	replacementOffset: number;
	suggestion: AvailableSuggestion;
	suggestionSetID: number;
}

// To avoid sending back huge docs for every completion item, we stash some data
// in our own fields (which won't serialise) and then restore them in resolve()
// on an individual completion basis.
export interface LazyCompletionItem extends CompletionItem {
	// tslint:disable-next-line: variable-name
	_documentation?: string | MarkdownString;
}

export interface FlutterSampleSnippet {
	readonly sourcePath: string;
	readonly sourceLine: number;
	readonly package: string;
	readonly library: string;
	readonly element: string;
	readonly id: string;
	readonly file: string;
	readonly description: string;
}
