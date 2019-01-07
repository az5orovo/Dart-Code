import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import { DebugSession, Event, InitializedEvent, OutputEvent, Scope, Source, StackFrame, StoppedEvent, TerminatedEvent, Thread, ThreadEvent } from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import { config } from "../config";
import { getLogHeader, logError, logInfo } from "../utils/log";
import { DebuggerResult, ObservatoryConnection, SourceReportKind, VM, VMBreakpoint, VMClass, VMClassRef, VMErrorRef, VMEvent, VMFrame, VMInstance, VMInstanceRef, VMIsolate, VMIsolateRef, VMLibrary, VMMapEntry, VMObj, VMResponse, VMScript, VMScriptRef, VMSentinel, VMSourceLocation, VMSourceReport, VMStack, VMTypeRef } from "./dart_debug_protocol";
import { PackageMap } from "./package_map";
import { CoverageData, DartAttachRequestArguments, DartLaunchRequestArguments, FileLocation, flatMap, formatPathForVm, LogCategory, LogMessage, LogSeverity, PromiseCompleter, safeSpawn, throttle, uniq, uriToFilePath } from "./utils";

const maxValuesToCallToString = 15;
// Prefix that appears at the start of stack frame names that are unoptimized
// which we'd prefer not to show to the user.
const unoptimizedPrefix = "[Unoptimized] ";
const stackFrameWithUriPattern = new RegExp(`^((?:flutter: )?#\\d+)(.*)\\(((?:package|dart|file):.*\\.dart):(\\d+):(\\d+)\\)$`);

// TODO: supportsSetVariable
// TODO: class variables?
// TODO: library variables?
// stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): void;
// restartFrameRequest(response: DebugProtocol.RestartFrameResponse, args: DebugProtocol.RestartFrameArguments): void;
// completionsRequest(response: DebugProtocol.CompletionsResponse, args: DebugProtocol.CompletionsArguments): void;
export class DartDebugSession extends DebugSession {
	// TODO: Tidy all this up
	protected childProcess?: child_process.ChildProcess;
	protected additionalPidsToTerminate: number[] = [];
	// We normally track the pid from Observatory to terminate the VM afterwards, but for Flutter Run it's
	// a remote PID and therefore doesn't make sense to try and terminate.
	protected allowTerminatingObservatoryVmPid = true;
	private processExited = false;
	public observatory?: ObservatoryConnection;
	protected cwd?: string;
	private logFile?: string;
	private logStream?: fs.WriteStream;
	public debugSdkLibraries: boolean;
	public debugExternalLibraries: boolean;
	public evaluateGettersInDebugViews: boolean;
	protected threadManager: ThreadManager;
	public packageMap?: PackageMap;
	protected sendStdOutToConsole: boolean = true;
	protected parseObservatoryUriFromStdOut: boolean = true;
	protected requiresProgram: boolean = true;
	protected pollforMemoryMs?: number; // If set, will poll for memory usage and send events back.
	protected processExit: Promise<void> = Promise.resolve();
	protected maxLogLineLength: number;
	protected shouldKillProcessOnTerminate = true;
	// protected observatoryUriIsProbablyReconnectable = false;

	public constructor() {
		super();

		this.threadManager = new ThreadManager(this);
	}

	protected initializeRequest(
		response: DebugProtocol.InitializeResponse,
		args: DebugProtocol.InitializeRequestArguments,
	): void {
		response.body = response.body || {};
		response.body.supportsConfigurationDoneRequest = true;
		response.body.supportsEvaluateForHovers = true;
		response.body.supportsDelayedStackTraceLoading = true;
		response.body.supportsConditionalBreakpoints = true;
		response.body.supportsLogPoints = true;
		response.body.supportsTerminateRequest = true;
		response.body.exceptionBreakpointFilters = [
			{ filter: "All", label: "All Exceptions", default: false },
			{ filter: "Unhandled", label: "Uncaught Exceptions", default: true },
		];
		this.sendResponse(response);
	}

	protected launchRequest(response: DebugProtocol.LaunchResponse, args: DartLaunchRequestArguments): void {
		if (!args || !args.dartPath || (this.requiresProgram && !args.program)) {
			this.logToUser("Unable to restart debugging. Please try ending the debug session and starting again.");
			this.sendEvent(new TerminatedEvent());
			return;
		}

		// Force relative paths to absolute.
		if (args.program && !path.isAbsolute(args.program))
			args.program = path.join(args.cwd, args.program);
		this.shouldKillProcessOnTerminate = true;
		this.cwd = args.cwd;
		this.packageMap = new PackageMap(PackageMap.findPackagesFile(args.program || args.cwd));
		this.debugSdkLibraries = args.debugSdkLibraries;
		this.debugExternalLibraries = args.debugExternalLibraries;
		this.evaluateGettersInDebugViews = args.evaluateGettersInDebugViews;
		this.logFile = args.observatoryLogFile;
		this.maxLogLineLength = args.maxLogLineLength;

		this.sendResponse(response);

		this.childProcess = this.spawnProcess(args);
		const process = this.childProcess;
		this.processExited = false;
		this.processExit = new Promise((resolve) => process.on("exit", resolve));

		process.stdout.setEncoding("utf8");
		process.stdout.on("data", (data) => {
			let match: RegExpExecArray;
			if (this.parseObservatoryUriFromStdOut && !this.observatory) {
				match = ObservatoryConnection.bannerRegex.exec(data.toString());
			}
			if (match) {
				this.initObservatory(this.websocketUriForObservatoryUri(match[1]));
			} else if (this.sendStdOutToConsole)
				this.logToUser(data.toString(), "stdout");
		});
		process.stderr.setEncoding("utf8");
		process.stderr.on("data", (data) => {
			this.logToUser(data.toString(), "stderr");
		});
		process.on("error", (error) => {
			this.logToUser(`${error}`, "stderr");
		});
		process.on("exit", (code, signal) => {
			this.processExited = true;
			this.log(`Process exited (${signal ? `${signal}`.toLowerCase() : code})`);
			if (!code && !signal)
				this.logToUser("Exited");
			else
				this.logToUser(`Exited (${signal ? `${signal}`.toLowerCase() : code})`);
			this.sendEvent(new TerminatedEvent());
		});

		if (args.noDebug)
			this.sendEvent(new InitializedEvent());
	}

	protected async attachRequest(response: DebugProtocol.AttachResponse, args: DartAttachRequestArguments): Promise<void> {
		if (!args || !args.observatoryUri) {
			return this.errorResponse(response, "Unable to attach; no Observatory address provided.");
		}

		// this.observatoryUriIsProbablyReconnectable = true;
		this.shouldKillProcessOnTerminate = false;
		this.cwd = args.cwd;
		this.debugSdkLibraries = args.debugSdkLibraries;
		this.debugExternalLibraries = args.debugExternalLibraries;
		this.logFile = args.observatoryLogFile;

		this.log(`Attaching to process via ${args.observatoryUri}`);

		// If we were given an explicity packages path, use it (otherwise we'll try
		// to extract from the VM)
		if (args.packages) {
			// Support relative paths
			if (args.packages && !path.isAbsolute(args.packages))
				args.packages = path.join(args.cwd, args.packages);

			try {
				this.packageMap = new PackageMap(PackageMap.findPackagesFile(args.packages));
			} catch (e) {
				this.errorResponse(response, `Unable to load packages file: ${e}`);
			}
		}

		try {
			await this.initObservatory(this.websocketUriForObservatoryUri(args.observatoryUri));
			this.sendResponse(response);
		} catch (e) {
			this.errorResponse(response, `Unable to connect to Observatory: ${e}`);
		}
	}

	protected sourceFileForArgs(args: DartLaunchRequestArguments) {
		return path.relative(args.cwd, args.program);
	}

	protected spawnProcess(args: DartLaunchRequestArguments) {
		const debug = !args.noDebug;
		let appArgs = [];
		if (debug) {
			appArgs.push("--enable-vm-service=0");
			appArgs.push("--pause_isolates_on_start=true");
		}
		if (args.enableAsserts !== false) { // undefined = on
			appArgs.push("--enable-asserts");
		}
		if (args.vmAdditionalArgs) {
			appArgs = appArgs.concat(args.vmAdditionalArgs);
		}
		appArgs.push(this.sourceFileForArgs(args));
		if (args.args) {
			appArgs = appArgs.concat(args.args);
		}

		this.log(`Spawning ${args.dartPath} with args ${JSON.stringify(appArgs)}`);
		if (args.cwd)
			this.log(`..  in ${args.cwd}`);

		const process = safeSpawn(args.cwd, args.dartPath, appArgs, args.env);

		this.log(`    PID: ${process.pid}`);

		return process;
	}

	protected websocketUriForObservatoryUri(uri: string) {
		const wsUri = uri.trim();
		if (wsUri.endsWith("/ws"))
			return wsUri;
		else if (wsUri.endsWith("/ws/"))
			return wsUri.substr(0, wsUri.length - 1);
		else if (wsUri.endsWith("/"))
			return `${wsUri}ws`;
		else
			return `${wsUri}/ws`;
	}

	protected log(message: string, severity = LogSeverity.Info) {
		if (this.logFile) {
			if (!this.logStream) {
				this.logStream = fs.createWriteStream(this.logFile);
				this.logStream.write(getLogHeader());
			}
			this.logStream.write(`[${(new Date()).toLocaleTimeString()}]: `);
			if (this.maxLogLineLength && message.length > this.maxLogLineLength)
				this.logStream.write(message.substring(0, this.maxLogLineLength) + "…\r\n");
			else
				this.logStream.write(message.trim() + "\r\n");
		}

		this.sendEvent(new Event("dart.log", new LogMessage(message, severity, LogCategory.Observatory)));
	}

	protected initObservatory(uri: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			// Send the uri back to the editor so it can be used to launch browsers etc.
			if (uri.endsWith("/ws")) {
				let browserFriendlyUri = uri.substring(0, uri.length - 3);
				if (browserFriendlyUri.startsWith("ws:"))
					browserFriendlyUri = "http:" + browserFriendlyUri.substring(3);
				this.sendEvent(new Event("dart.observatoryUri", {
					// If we won't be killing the process on terminate, then it's likely the
					// process will remain around and can be reconnected to, so let the
					// editor know that it should stash this URL for easier re-attaching.
					// isProbablyReconnectable: this.observatoryUriIsProbablyReconnectable,
					observatoryUri: browserFriendlyUri.toString(),
				}));
			}
			this.observatory = new ObservatoryConnection(uri);
			this.observatory.onLogging((message) => this.log(message));
			this.observatory.onOpen(() => {
				if (!this.observatory)
					return;
				this.observatory.on("Isolate", (event: VMEvent) => this.handleIsolateEvent(event));
				this.observatory.on("Extension", (event: VMEvent) => this.handleExtensionEvent(event));
				this.observatory.on("Debug", (event: VMEvent) => this.handleDebugEvent(event));
				this.observatory.getVM().then(async (result): Promise<void> => {
					const vm: VM = result.result as VM;

					// If we own this process (we launched it, didn't attach) and the PID we get from Observatory is different, then
					// we should keep a ref to this process to terminate when we quit. This avoids issues where our process is a shell
					// (we use shell execute to fix issues on Windows) and the kill signal isn't passed on correctly.
					// See: https://github.com/Dart-Code/Dart-Code/issues/907
					if (this.allowTerminatingObservatoryVmPid && this.childProcess && this.childProcess.pid !== vm.pid) {
						this.additionalPidsToTerminate.push(vm.pid);
					}

					const isolates = await Promise.all(vm.isolates.map((isolateRef) => this.observatory.getIsolate(isolateRef.id)));

					// TODO: Is it valid to assume the first (only?) isolate with a rootLib is the one we care about here?
					// If it's always the first, could we even just query the first instead of getting them all before we
					// start the other processing?
					const rootIsolateResult = isolates.find((isolate) => !!(isolate.result as VMIsolate).rootLib);
					const rootIsolate = rootIsolateResult && rootIsolateResult.result as VMIsolate;

					if (rootIsolate && rootIsolate.extensionRPCs) {
						// If we're attaching, we won't see ServiceExtensionAdded events for extensions already loaded so
						// we need to enumerate them here.
						rootIsolate.extensionRPCs.forEach((id) => this.notifyServiceExtensionAvailable(id));
					}

					if (!this.packageMap) {
						// TODO: There's a race here if the isolate is not yet runnable, it might not have rootLib yet. We don't
						// currently fill this in later.
						if (rootIsolate)
							this.packageMap = new PackageMap(PackageMap.findPackagesFile(this.convertVMUriToSourcePath(rootIsolate.rootLib.uri)));
					}

					await Promise.all(isolates.map(async (response) => {
						const isolate: VMIsolate = response.result as VMIsolate;
						this.threadManager.registerThread(
							isolate,
							isolate.runnable ? "IsolateRunnable" : "IsolateStart",
						);

						if (isolate.pauseEvent.kind.startsWith("Pause")) {
							await this.handlePauseEvent(isolate.pauseEvent);
						}
					}));

					// Set a timer for memory updates.
					if (this.pollforMemoryMs)
						setTimeout(() => this.pollForMemoryUsage(), this.pollforMemoryMs);

					this.sendEvent(new InitializedEvent());
				});
				resolve();
			});

			this.observatory.onClose((code: number, message: string) => {

				this.log(`Observatory connection closed: ${code} (${message})`);
				if (this.logStream) {
					this.logStream.end();
					this.logStream = undefined;
					// Wipe out the filename so if a message arrives late, it doesn't
					// wipe out the logfile with just a "process exited" or similar message.
					this.logFile = undefined;
				}
				// If we don't have a process (eg. we're attached) then this is our signal to quit, since we won't
				// get a process exit event.
				if (this.childProcess == null) {
					this.sendEvent(new TerminatedEvent());
				} else {
					// In some cases Observatory closes but we never get the exit/close events from the process
					// so this is a fallback to termiante the session after a short period. Without this, we have
					// issues like https://github.com/Dart-Code/Dart-Code/issues/1268 even though when testing from
					// the terminal the app does terminate as expected.
					setTimeout(() => {
						if (!this.processExited)
							this.sendEvent(new TerminatedEvent());
					}, 500);
				}
			});

			this.observatory.onError((error) => {
				reject(error);
			});
		});
	}

	protected async terminate(force: boolean): Promise<void> {
		const signal = force ? "SIGKILL" : "SIGINT";
		const request = force ? "DISC" : "TERM";
		this.log(`${request}: Going to terminate with ${signal}...`);
		if (this.shouldKillProcessOnTerminate && this.childProcess != null && !this.processExited) {
			for (const pid of this.additionalPidsToTerminate) {
				try {
					this.log(`${request}: Terminating related process ${pid} with ${signal}...`);
					process.kill(pid, signal);
				} catch (e) {
					// Sometimes this process will have already gone away (eg. the app finished/terminated)
					// so logging here just results in lots of useless info.
				}
			}
			// Don't remove these PIDs from the list as we don't know that they actually quit yet.
			try {
				this.log(`${request}: Terminating main process with ${signal}...`);
				this.childProcess.kill(signal);
			} catch (e) {
				// This tends to throw a lot because the shell process quit when we terminated the related
				// VM process above, so just swallow the error.
			}
			// Don't do this - because the process might ignore our kill (eg. test framework lets the current
			// test finish) so we may need to send again it we get another disconnectRequest.
			// We also use childProcess == null to mean we're attached.
			// this.childProcess = undefined;
		} else if (!this.shouldKillProcessOnTerminate && this.observatory) {
			try {
				this.log(`${request}: Disconnecting from process...`);
				// Remove all breakpoints from the VM.
				await await Promise.race([
					Promise.all(this.threadManager.threads.map((thread) => thread.removeAllBreakpoints())),
					new Promise((resolve) => setTimeout(resolve, 500)),
				]);

				// Restart any paused threads.
				// Note: Only wait up to 500ms here because sometimes we don't get responses because the VM terminates.
				this.log(`${request}: Unpausing all threads...`);
				await Promise.race([
					Promise.all(this.threadManager.threads.map((thread) => thread.resume())),
					new Promise((resolve) => setTimeout(resolve, 500)),
				]);
			} catch { }
			try {
				this.log(`${request}: Closing observatory...`);
				this.observatory.close();
			} catch { } finally {
				this.observatory = null;
			}
		}

		this.log(`${request}: Removing all stored data...`);
		this.threadManager.removeAllStoredData();

		this.log(`${request}: Waiting for process to finish...`);
		await this.processExit;

		this.log(`${request}: Disconnecting...`);
	}

	protected async terminateRequest(
		response: DebugProtocol.TerminateResponse,
		args: DebugProtocol.TerminateArguments,
	): Promise<void> {
		this.log(`Termination requested!`);
		try {
			await this.terminate(false);
		} catch (e) {
			return this.errorResponse(response, `${e}`);
		}
		super.terminateRequest(response, args);
	}

	protected async disconnectRequest(
		response: DebugProtocol.DisconnectResponse,
		args: DebugProtocol.DisconnectArguments,
	): Promise<void> {
		this.log(`Disconnect requested!`);
		try {
			await Promise.race([
				this.terminate(false),
				new Promise((resolve) => setTimeout(resolve, 2000)).then(() => this.terminate(true)),
			]);
		} catch (e) {
			return this.errorResponse(response, `${e}`);
		}
		super.disconnectRequest(response, args);
	}

	protected async setBreakPointsRequest(
		response: DebugProtocol.SetBreakpointsResponse,
		args: DebugProtocol.SetBreakpointsArguments,
	): Promise<void> {
		const source: DebugProtocol.Source = args.source;
		let breakpoints: DebugProtocol.SourceBreakpoint[] = args.breakpoints;
		if (!breakpoints)
			breakpoints = [];

		// Get the correct format for the path depending on whether it's a package.
		const uri = this.packageMap
			? this.packageMap.convertFileToPackageUri(source.path) || formatPathForVm(source.path)
			: formatPathForVm(source.path);

		try {
			const result = await this.threadManager.setBreakpoints(uri, breakpoints);
			const bpResponse = [];
			for (const bpRes of result) {
				bpResponse.push({ verified: !!bpRes });
			}

			response.body = { breakpoints: bpResponse };
			this.sendResponse(response);
		} catch (error) {
			this.errorResponse(response, `${error}`);
		}
	}

	protected setExceptionBreakPointsRequest(
		response: DebugProtocol.SetExceptionBreakpointsResponse,
		args: DebugProtocol.SetExceptionBreakpointsArguments,
	): void {
		const filters: string[] = args.filters;

		let mode = "None";
		if (filters.indexOf("Unhandled") !== -1)
			mode = "Unhandled";
		if (filters.indexOf("All") !== -1)
			mode = "All";

		this.threadManager.setExceptionPauseMode(mode);

		this.sendResponse(response);
	}

	protected configurationDoneRequest(
		response: DebugProtocol.ConfigurationDoneResponse,
		args: DebugProtocol.ConfigurationDoneArguments,
	): void {
		this.sendResponse(response);

		this.threadManager.receivedConfigurationDone();
	}

	protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments): void {
		const thread = this.threadManager.getThreadInfoFromNumber(args.threadId);

		if (!thread) {
			this.errorResponse(response, `No thread with id ${args.threadId}`);
			return;
		}

		this.observatory.pause(thread.ref.id)
			.then((_) => this.sendResponse(response))
			.catch((error) => this.errorResponse(response, `${error}`));
	}

	protected sourceRequest(response: DebugProtocol.SourceResponse, args: DebugProtocol.SourceArguments): void {
		const sourceReference = args.sourceReference;
		const data = this.threadManager.getStoredData(sourceReference);
		const scriptRef: VMScriptRef = data.data as VMScriptRef;

		data.thread.getScript(scriptRef).then((script: VMScript) => {
			if (script.source) {
				response.body = { content: script.source };
			} else {
				response.success = false;
				response.message = "<source not available>";
			}
			this.sendResponse(response);
		}).catch((error) => this.errorResponse(response, `${error}`));
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
		response.body = { threads: this.threadManager.getThreads() };
		this.sendResponse(response);
	}

	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
		const thread = this.threadManager.getThreadInfoFromNumber(args.threadId);
		let startFrame: number = args.startFrame;
		let levels: number = args.levels;

		if (!thread) {
			this.errorResponse(response, `No thread with id ${args.threadId}`);
			return;
		}

		this.observatory.getStack(thread.ref.id).then((result: DebuggerResult) => {
			const stack: VMStack = result.result as VMStack;
			let vmFrames: VMFrame[] = stack.asyncCausalFrames;
			if (vmFrames == null)
				vmFrames = stack.frames;
			const totalFrames = vmFrames.length;

			if (!startFrame)
				startFrame = 0;
			if (!levels)
				levels = totalFrames;
			if (startFrame + levels > totalFrames)
				levels = totalFrames - startFrame;
			vmFrames = vmFrames.slice(startFrame, startFrame + levels);

			const stackFrames: DebugProtocol.StackFrame[] = [];
			const promises: Array<Promise<void>> = [];

			vmFrames.forEach((frame: VMFrame) => {
				const frameId = thread.storeData(frame);

				if (frame.kind === "AsyncSuspensionMarker") {
					const stackFrame: DebugProtocol.StackFrame = new StackFrame(frameId, "<asynchronous gap>");
					stackFrame.presentationHint = "label";
					stackFrames.push(stackFrame);
					return;
				}

				const frameName = frame.code.name.startsWith(unoptimizedPrefix)
					? frame.code.name.substring(unoptimizedPrefix.length)
					: frame.code.name;
				const location: VMSourceLocation = frame.location;

				if (location == null) {
					const stackFrame: DebugProtocol.StackFrame = new StackFrame(frameId, frameName);
					stackFrame.presentationHint = "subtle";
					stackFrames.push(stackFrame);
					return;
				}

				const uri = location.script.uri;
				let sourcePath: string | undefined = this.convertVMUriToSourcePath(uri);
				let canShowSource = fs.existsSync(sourcePath);

				// Download the source if from a "dart:" uri.
				let sourceReference: number;
				if (uri.startsWith("dart:")) {
					sourcePath = undefined;
					sourceReference = thread.storeData(location.script);
					canShowSource = true;
				}

				const shortName = this.formatUriForShortDisplay(uri);
				const stackFrame: DebugProtocol.StackFrame = new StackFrame(
					frameId,
					frameName,
					canShowSource ? new Source(shortName, sourcePath, sourceReference, null, location.script) : undefined,
					0, 0,
				);
				// If we wouldn't debug this source, then deemphasize in the stack.
				if (stackFrame.source) {
					if (!this.isValidToDebug(uri) || (this.isSdkLibrary(uri) && !this.debugSdkLibraries)) {
						stackFrame.source.origin = "from the Dart SDK";
						stackFrame.source.presentationHint = "deemphasize";
					} else if (this.isExternalLibrary(uri) && !this.debugExternalLibraries) {
						stackFrame.source.origin = uri.startsWith("package:flutter/") ? "from the Flutter framework" : "from Pub packages";
						stackFrame.source.presentationHint = "deemphasize";
					}
				}
				stackFrames.push(stackFrame);

				// Resolve the line and column information.
				const promise = thread.getScript(location.script).then((script: VMScript) => {
					const fileLocation: FileLocation = this.resolveFileLocation(script, location.tokenPos);
					if (fileLocation) {
						stackFrame.line = fileLocation.line;
						stackFrame.column = fileLocation.column;
					}
				});
				promises.push(promise);
			});

			response.body = {
				stackFrames,
				totalFrames,
			};

			Promise.all(promises).then((_) => {
				this.sendResponse(response);
			}).catch((_) => {
				this.sendResponse(response);
			});
		}).catch((error) => this.errorResponse(response, `${error}`));
	}

	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
		const frameId = args.frameId;
		const data = this.threadManager.getStoredData(frameId);
		const frame: VMFrame = data.data as VMFrame;

		// TODO: class variables? library variables?

		const variablesReference = data.thread.storeData(frame);
		const scopes: Scope[] = [];

		if (data.thread.exceptionReference) {
			scopes.push(new Scope("Exception", data.thread.exceptionReference));
		}

		scopes.push(new Scope("Locals", variablesReference));

		response.body = { scopes };
		this.sendResponse(response);
	}

	protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): Promise<void> {
		const variablesReference = args.variablesReference;

		// implement paged arrays
		// let filter = args.filter; // optional; either "indexed" or "named"
		let start = args.start; // (optional) index of the first variable to return; if omitted children start at 0
		const count = args.count; // (optional) number of variables to return. If count is missing or 0, all variables are returned

		const data = this.threadManager.getStoredData(variablesReference);
		const thread = data.thread;

		if (data.data.type === "Frame") {
			const frame: VMFrame = data.data as VMFrame;
			const variables: DebugProtocol.Variable[] = [];
			if (frame.vars) {
				for (const variable of frame.vars)
					variables.push(await this.instanceRefToVariable(thread, true, variable.name, variable.name, variable.value, frame.vars.length <= maxValuesToCallToString));
			}
			response.body = { variables };
			this.sendResponse(response);
		} else if (data.data.type === "MapEntry") {
			const mapRef = data.data as VMMapEntry;

			const results = await Promise.all([
				this.observatory.getObject(thread.ref.id, mapRef.keyId),
				this.observatory.getObject(thread.ref.id, mapRef.valueId),
			]);

			const variables: DebugProtocol.Variable[] = [];

			const [keyDebuggerResult, valueDebuggerResult] = results;
			const keyInstanceRef = keyDebuggerResult.result as VMInstanceRef;
			const valueInstanceRef = valueDebuggerResult.result as VMInstanceRef;

			variables.push(await this.instanceRefToVariable(thread, false, "key", "key", keyInstanceRef, true));

			let canEvaluateValueName = false;
			let valueEvaluateName = "value";
			if (this.isSimpleKind(keyInstanceRef.kind)) {
				canEvaluateValueName = true;
				valueEvaluateName = `${mapRef.mapEvaluateName}[${this.valueAsString(keyInstanceRef)}]`;
			}

			variables.push(await this.instanceRefToVariable(thread, canEvaluateValueName, valueEvaluateName, "value", valueInstanceRef, true));

			response.body = { variables };
			this.sendResponse(response);
		} else {
			const instanceRef = data.data as InstanceWithEvaluateName;

			try {
				const result = await this.observatory.getObject(thread.ref.id, instanceRef.id, start, count);
				const variables: DebugProtocol.Variable[] = [];
				// If we're the top-level exception, or our parent has an evaluateName of undefined (its children)
				// we cannot evaluate (this will disable "Add to Watch" etc).
				const canEvaluate = instanceRef.evaluateName !== undefined;

				if (result.result.type === "Sentinel") {
					variables.push({
						name: "<evalError>",
						value: (result.result as VMSentinel).valueAsString,
						variablesReference: 0,
					});
				} else {
					const obj: VMObj = result.result as VMObj;

					if (obj.type === "Instance") {
						const instance = obj as VMInstance;

						// TODO: show by kind instead
						if (this.isSimpleKind(instance.kind)) {
							variables.push(await this.instanceRefToVariable(thread, canEvaluate, `${instanceRef.evaluateName}`, instance.kind, instanceRef, true));
						} else if (instance.elements) {
							const len = instance.elements.length;
							if (!start)
								start = 0;
							for (let i = 0; i < len; i++) {
								const element = instance.elements[i];
								variables.push(await this.instanceRefToVariable(thread, canEvaluate, `${instanceRef.evaluateName}[${i + start}]`, `[${i + start}]`, element, len <= maxValuesToCallToString));
							}
						} else if (instance.associations) {
							const len = instance.associations.length;
							if (!start)
								start = 0;
							for (let i = 0; i < len; i++) {
								const association = instance.associations[i];

								const keyName = this.valueAsString(association.key, true);
								const valueName = this.valueAsString(association.value, true);

								let variablesReference = 0;

								if (association.key.type !== "Sentinel" && association.value.type !== "Sentinel") {
									const mapRef: VMMapEntry = {
										keyId: (association.key as VMInstanceRef).id,
										mapEvaluateName: instanceRef.evaluateName,
										type: "MapEntry",
										valueId: (association.value as VMInstanceRef).id,
									};

									variablesReference = thread.storeData(mapRef);
								}

								variables.push({
									name: `${i + start}`,
									type: `${keyName} -> ${valueName}`,
									value: `${keyName} -> ${valueName}`,
									variablesReference,
								});
							}
						} else if (instance.fields) {
							let len = instance.fields.length;
							// Add getters
							if (this.evaluateGettersInDebugViews && instance.class) {
								let getterNames = await this.getGetterNamesForHierarchy(thread.ref, instance.class);
								getterNames = getterNames.sort();
								len += getterNames.length;

								// Call each getter, adding the result as a variable.
								for (const getterName of getterNames) {
									const getterDisplayName = getterName; // `get ${getterName}`;
									const getterResult = await this.observatory.evaluate(thread.ref.id, instanceRef.id, getterName);
									if (getterResult.result.type === "@Error") {
										variables.push({ name: getterDisplayName, value: (getterResult.result as VMErrorRef).message, variablesReference: 0 });
									} else if (getterResult.result.type === "Sentinel") {
										variables.push({ name: getterDisplayName, value: (getterResult.result as VMSentinel).valueAsString, variablesReference: 0 });
									} else {
										const getterResultInstanceRef = getterResult.result as VMInstanceRef;
										variables.push(await this.instanceRefToVariable(
											thread, canEvaluate,
											`${instanceRef.evaluateName}.${getterName}`,
											getterDisplayName,
											getterResultInstanceRef,
											len <= maxValuesToCallToString,
										));
									}
								}
							}

							// Add all of the fields.
							for (const field of instance.fields)
								variables.push(await this.instanceRefToVariable(thread, canEvaluate, `${instanceRef.evaluateName}.${field.decl.name}`, field.decl.name, field.value, len <= maxValuesToCallToString));
						} else {
							// TODO: unhandled kind
							this.logToUser(instance.kind);
						}
					} else {
						// TODO: unhandled type
						this.logToUser(obj.type);
					}
				}

				response.body = { variables };
				this.sendResponse(response);
			} catch (error) {
				this.errorResponse(response, `${error}`);
			}
		}
	}

	private async getGetterNamesForHierarchy(thread: VMIsolateRef, classRef: VMClassRef): Promise<string[]> {
		let getterNames: string[] = [];
		while (classRef) {
			const classResponse = await this.observatory.getObject(thread.id, classRef.id);
			if (classResponse.result.type !== "Class")
				break;

			const c = classResponse.result as VMClass;

			// TODO: This kinda smells for two reasons:
			// 1. This is supposed to be an @Function but it has loads of extra stuff on it compare to the docs
			// 2. We're accessing _kind to check if it's a getter :/
			getterNames = getterNames.concat(getterNames, c.functions.filter((f) => f._kind === "GetterFunction" && !f.static && !f.const).map((f) => f.name));
			classRef = c.super;
		}

		// Distinct the list; since we may have got dupes from the super-classes.
		getterNames = uniq(getterNames);

		// Remove _identityHashCode because it seems to throw (and probably isn't useful to the user).
		return getterNames.filter((g) => g !== "_identityHashCode");
	}

	private isSimpleKind(kind: string) {
		return kind === "String" || kind === "Bool" || kind === "Int" || kind === "Num" || kind === "Double";
	}

	private async callToString(isolate: VMIsolateRef, instanceRef: VMInstanceRef, getFullString: boolean = false): Promise<string> {
		try {
			const result = await this.observatory.evaluate(isolate.id, instanceRef.id, "toString()");
			if (result.result.type === "@Error") {
				return null;
			} else {
				let evalResult: VMInstanceRef = result.result as VMInstanceRef;

				if (evalResult.valueAsStringIsTruncated && getFullString) {
					const result = await this.observatory.getObject(isolate.id, evalResult.id);
					evalResult = result.result as VMInstanceRef;
				}

				return this.valueAsString(evalResult, undefined, true);
			}
		} catch (e) {
			logError(e, LogCategory.Observatory);
			return null;
		}
	}

	protected setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments): void {
		const variablesReference: number = args.variablesReference;
		// The name of the variable.
		const name: string = args.name;
		// The value of the variable.
		const value: string = args.value;

		// TODO: Use eval to implement this.
		this.errorResponse(response, "not supported");
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
		const thread = this.threadManager.getThreadInfoFromNumber(args.threadId);
		if (!thread) {
			this.errorResponse(response, `No thread with id ${args.threadId}`);
			return;
		}
		thread.resume().then((_) => {
			response.body = { allThreadsContinued: false };
			this.sendResponse(response);
			this.requestCoverageUpdate("resume");
		}).catch((error) => this.errorResponse(response, `${error}`));
	}

	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
		const thread = this.threadManager.getThreadInfoFromNumber(args.threadId);
		if (!thread) {
			this.errorResponse(response, `No thread with id ${args.threadId}`);
			return;
		}
		const type = thread.atAsyncSuspension ? "OverAsyncSuspension" : "Over";
		thread.resume(type).then((_) => {
			this.sendResponse(response);
			this.requestCoverageUpdate("step-over");
		}).catch((error) => this.errorResponse(response, `${error}`));
	}

	protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
		const thread = this.threadManager.getThreadInfoFromNumber(args.threadId);
		if (!thread) {
			this.errorResponse(response, `No thread with id ${args.threadId}`);
			return;
		}
		thread.resume("Into").then((_) => {
			this.sendResponse(response);
			this.requestCoverageUpdate("step-in");
		}).catch((error) => this.errorResponse(response, `${error}`));
	}

	protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
		const thread = this.threadManager.getThreadInfoFromNumber(args.threadId);
		if (!thread) {
			this.errorResponse(response, `No thread with id ${args.threadId}`);
			return;
		}
		thread.resume("Out").then((_) => {
			this.sendResponse(response);
			this.requestCoverageUpdate("step-out");
		}).catch((error) => this.errorResponse(response, `${error}`));
	}

	protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): void {
		// unsupported
	}

	protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): Promise<void> {
		const expression: string = args.expression;
		// Stack frame scope; if not specified, the expression is evaluated in the global scope.
		const frameId: number = args.frameId;
		// Values are "watch", "repl", and "hover".
		const context: string = args.context;

		if (!frameId) {
			this.errorResponse(response, "global evaluation not supported");
			return;
		}

		const data = this.threadManager.getStoredData(frameId);
		const thread = data.thread;
		const frame: VMFrame = data.data as VMFrame;

		try {
			let result: DebuggerResult;
			if ((expression === "$e" || expression.startsWith("$e.")) && thread.exceptionReference) {
				const exceptionData = this.threadManager.getStoredData(thread.exceptionReference);
				const exceptionInstanceRef = exceptionData && exceptionData.data as VMInstanceRef;

				if (expression === "$e") {
					response.body = {
						result: await this.fullValueAsString(thread.ref, exceptionInstanceRef),
						variablesReference: thread.exceptionReference,
					};
					this.sendResponse(response);
					return;
				}

				const exceptionId = exceptionInstanceRef && exceptionInstanceRef.id;

				if (exceptionId)
					result = await this.observatory.evaluate(thread.ref.id, exceptionId, expression.substr(3));
			}
			if (!result) {
				// Don't wait more than half a second for the response:
				//   1. VS Code's watch window behaves badly when there are incomplete evaluate requests
				//      https://github.com/Microsoft/vscode/issues/52317
				//   2. The VM sometimes doesn't respond to your requests at all
				//      https://github.com/flutter/flutter/issues/18595
				result = await Promise.race([
					this.observatory.evaluateInFrame(thread.ref.id, frame.index, expression),
					new Promise<never>((resolve, reject) => setTimeout(() => reject(new Error("<timed out>")), 500)),
				]);
			}

			// InstanceRef or ErrorRef
			if (result.result.type === "@Error") {
				const error: VMErrorRef = result.result as VMErrorRef;
				let str: string = error.message;
				if (str)
					str = str.split("\n").slice(0, 6).join("\n");
				this.errorResponse(response, str);
			} else {
				const instanceRef: InstanceWithEvaluateName = result.result as InstanceWithEvaluateName;
				instanceRef.evaluateName = expression;
				const text = await this.fullValueAsString(thread.ref, instanceRef);
				response.body = {
					result: text,
					variablesReference: this.isSimpleKind(instanceRef.kind) ? 0 : thread.storeData(instanceRef),
				};
				this.sendResponse(response);
			}
		} catch (e) {
			this.errorResponse(response, `${e}`);
		}
	}

	protected customRequest(request: string, response: DebugProtocol.Response, args: any): void {
		switch (request) {
			case "coverageFilesUpdate":
				this.knownOpenFiles = args.scriptUris;
				break;
			case "requestCoverageUpdate":
				this.requestCoverageUpdate("editor");
				break;

			default:
				super.customRequest(request, response, args);
				break;
		}
	}

	// IsolateStart, IsolateRunnable, IsolateExit, IsolateUpdate, ServiceExtensionAdded
	public handleIsolateEvent(event: VMEvent) {
		const kind = event.kind;
		if (kind === "IsolateStart" || kind === "IsolateRunnable") {
			this.threadManager.registerThread(event.isolate, kind);
		} else if (kind === "IsolateExit") {
			this.threadManager.handleIsolateExit(event.isolate);
		} else if (kind === "ServiceExtensionAdded") {
			this.handleServiceExtensionAdded(event);
		}
	}

	// Extension
	public handleExtensionEvent(event: VMEvent) {
		// Nothing Dart-specific, but Flutter overrides this
	}

	// PauseStart, PauseExit, PauseBreakpoint, PauseInterrupted, PauseException, Resume,
	// BreakpointAdded, BreakpointResolved, BreakpointRemoved, Inspect, None
	public async handleDebugEvent(event: VMEvent): Promise<void> {
		try {
			const kind = event.kind;

			if (kind.startsWith("Pause")) {
				await this.handlePauseEvent(event);
			} else if (kind === "Inspect") {
				await this.handleInspectEvent(event);
			}
		} catch (e) {
			logError(e, LogCategory.Observatory);
		}
	}

	private async handlePauseEvent(event: VMEvent) {
		const kind = event.kind;
		const thread = event.isolate ? this.threadManager.getThreadInfoFromRef(event.isolate) : undefined;

		// For PausePostRequest we need to re-send all breakpoints; this happens after a flutter restart
		if (kind === "PausePostRequest") {
			await this.threadManager.resetBreakpoints();
			try {
				await this.observatory.resume(event.isolate.id);
			} catch (e) {
				// Ignore failed-to-resume errors https://github.com/flutter/flutter/issues/10934
				if (e.code !== 106)
					throw e;
			}
		} else if (kind === "PauseStart") {
			// "PauseStart" should auto-resume after breakpoints are set if we launched the process.
			if (this.childProcess)
				thread.receivedPauseStart();
			else {
				// Otherwise, if we were attaching, then just issue a step-into to put the debugger
				// right at the start of the application.
				thread.handlePaused(event.atAsyncSuspension, event.exception);
				await thread.resume("Into");
			}
		} else {
			// PauseStart, PauseExit, PauseBreakpoint, PauseInterrupted, PauseException
			let reason = "pause";
			let exceptionText = null;
			let shouldRemainedStoppedOnBreakpoint = true;

			if (kind === "PauseBreakpoint" && event.pauseBreakpoints && event.pauseBreakpoints.length) {
				reason = "breakpoint";

				const breakpoints = event.pauseBreakpoints.map((bp) => thread.breakpoints[bp.id]);
				// When attaching to an already-stopped process, this event can be handled before the
				// breakpoints have been registered. If that happens, replace any unknown breakpoints with
				// dummy unconditional breakpoints.
				// TODO: Ensure that VM breakpoint state is reconciled with debugger breakpoint state before
				// handling thread state so that this doesn't happen, and remove this check.
				const hasUnknownBreakpoints = breakpoints.indexOf(undefined) !== -1;

				if (!hasUnknownBreakpoints) {
					const hasUnconditionalBreakpoints = !!breakpoints.find((bp) => !bp.condition && !bp.logMessage);
					const conditionalBreakpoints = breakpoints.filter((bp) => bp.condition);
					const logPoints = breakpoints.filter((bp) => bp.logMessage);

					// Evalute conditions to see if we should remain stopped or continue.
					shouldRemainedStoppedOnBreakpoint =
						hasUnconditionalBreakpoints
						|| await this.anyBreakpointConditionReturnsTrue(conditionalBreakpoints, thread);

					// Output any logpoint messages.
					for (const logPoint of logPoints) {
						const logMessage = logPoint.logMessage
							.replace(/(^|[^\\\$]){/g, "$1\${") // Prefix any {tokens} with $ if they don't have
							.replace(/\\({)/g, "$1"); // Remove slashes
						// TODO: Escape triple quotes?
						const printCommand = `print("""${logMessage}""")`;
						await this.evaluateAndSendErrors(thread, printCommand);
					}
				}
			} else if (kind === "PauseBreakpoint") {
				reason = "step";
			} else if (kind === "PauseException") {
				reason = "exception";
				exceptionText = await this.fullValueAsString(event.isolate, event.exception);
			}

			thread.handlePaused(event.atAsyncSuspension, event.exception);
			if (shouldRemainedStoppedOnBreakpoint) {
				this.sendEvent(new StoppedEvent(reason, thread.num, exceptionText));
			} else {
				thread.resume();
			}
		}
	}

	protected async handleInspectEvent(event: VMEvent): Promise<void> {
		// No implementation for Dart.
	}

	// Like valueAsString, but will call toString() if the thing is truncated.
	private async fullValueAsString(isolate: VMIsolateRef, instanceRef: VMInstanceRef): Promise<string> {
		let text: string;
		if (!instanceRef.valueAsStringIsTruncated)
			text = this.valueAsString(instanceRef, false);
		if (!text)
			text = await this.callToString(isolate, instanceRef, true);
		// If it has a custom toString(), put that in parens after the type name.
		if (instanceRef.kind === "PlainInstance" && instanceRef.class && instanceRef.class.name) {
			if (text === `Instance of '${instanceRef.class.name}'`)
				text = instanceRef.class.name;
			else
				text = `${instanceRef.class.name} (${text})`;
		}
		return text;
	}

	private async anyBreakpointConditionReturnsTrue(breakpoints: DebugProtocol.SourceBreakpoint[], thread: ThreadInfo) {
		for (const bp of breakpoints) {
			const evalResult = await this.evaluateAndSendErrors(thread, bp.condition);
			if (evalResult) {
				// To be considered true, we need to have a value and either be not-a-bool
				const breakpointconditionEvaluatesToTrue =
					(evalResult.kind === "Bool" && evalResult.valueAsString === "true")
					|| (evalResult.kind === "Int" && evalResult.valueAsString !== "0");
				if (breakpointconditionEvaluatesToTrue)
					return true;

			}
		}
		return false;
	}

	private async evaluateAndSendErrors(thread: ThreadInfo, expression: string): Promise<VMInstanceRef> {
		function trimToFirstNewline(s: string) {
			s = s && s.toString();
			const newlinePos = s.indexOf("\n");
			return s.substr(0, newlinePos).trim();
		}
		try {
			const result = await this.observatory.evaluateInFrame(thread.ref.id, 0, expression);
			if (result.result.type !== "@Error") {
				return result.result as VMInstanceRef;
			} else {
				this.logToUser(`Debugger failed to evaluate expression \`${expression}\``);
			}
		} catch {
			this.logToUser(`Debugger failed to evaluate expression \`${expression}\``);
		}
	}

	public handleServiceExtensionAdded(event: VMEvent) {
		if (event && event.extensionRPC) {
			this.notifyServiceExtensionAvailable(event.extensionRPC);
		}
	}

	private notifyServiceExtensionAvailable(id: string) {
		this.sendEvent(new Event("dart.serviceExtensionAdded", { id }));
	}

	private knownOpenFiles: string[] = []; // Keep track of these for internal requests
	protected requestCoverageUpdate = throttle(async (reason: string): Promise<void> => {
		if (!this.knownOpenFiles || !this.knownOpenFiles.length)
			return;

		const coverageReport = await this.getCoverageReport(this.knownOpenFiles);

		// Unwrap tokenPos into real locations.
		const coverageData: CoverageData[] = coverageReport.map((r) => {
			const allTokens = [r.startPos, r.endPos, ...r.hits, ...r.misses];
			const hitLines: number[] = [];
			r.hits.forEach((h) => {
				const startTokenIndex = allTokens.indexOf(h);
				const endTokenIndex = startTokenIndex < allTokens.length - 1 ? startTokenIndex + 1 : startTokenIndex;
				const startLoc = this.resolveFileLocation(r.script, allTokens[startTokenIndex]);
				const endLoc = this.resolveFileLocation(r.script, allTokens[endTokenIndex]);
				for (let i = startLoc.line; i <= endLoc.line; i++)
					hitLines.push(i);
			});
			return {
				hitLines,
				scriptPath: r.hostScriptPath,
			};
		});

		this.sendEvent(new Event("dart.coverage", coverageData));
	}, 2000);

	private async getCoverageReport(scriptUris: string[]): Promise<Array<{ hostScriptPath: string, script: VMScript, tokenPosTable: number[][], startPos: number, endPos: number, hits: number[], misses: number[] }>> {
		if (!scriptUris || !scriptUris.length)
			return [];

		const result = await this.observatory.getVM();
		const vm = result.result as VM;

		const promises: Array<Promise<DebuggerResult>> = [];

		const isolatePromises = vm.isolates.map((isolateRef) => this.observatory.getIsolate(isolateRef.id));
		const isolatesResponses = await Promise.all(isolatePromises);
		const isolates = isolatesResponses.map((response) => response.result as VMIsolate);

		// Our handling of file:// prefixes is inconsistent until
		// https://github.com/flutter/flutter/issues/18441 is resolved.
		function removeFilePrefix(uri: string) {
			return uri.replace("file://", "");
		}

		// Make a quick map for looking up with scripts we are tracking.
		const trackedScriptUris: { [key: string]: boolean } = {};
		scriptUris.forEach((uri) => trackedScriptUris[uri] = true);

		const results: Array<{ hostScriptPath: string, script: VMScript, tokenPosTable: number[][], startPos: number, endPos: number, hits: number[], misses: number[] }> = [];
		for (const isolate of isolates) {
			const libraryPromises = isolate.libraries.map((library) => this.observatory.getObject(isolate.id, library.id));
			const libraryResponses = await Promise.all(libraryPromises);
			const libraries = libraryResponses.map((response) => response.result as VMLibrary);

			const scriptRefs = flatMap(libraries, (library) => library.scripts);

			// Filter scripts to the ones we care about.
			const scripts = scriptRefs.filter((s) => trackedScriptUris[s.uri]);

			for (const scriptRef of scripts) {
				const script = (await this.observatory.getObject(isolate.id, scriptRef.id)).result as VMScript;
				try {
					const report = await this.observatory.getSourceReport(isolate, [SourceReportKind.Coverage], scriptRef);
					const sourceReport = report.result as VMSourceReport;
					const ranges = sourceReport.ranges.filter((r) => r.coverage && r.coverage.hits && r.coverage.hits.length);

					for (const range of ranges) {
						results.push({
							endPos: range.endPos,
							hits: range.coverage.hits,
							hostScriptPath: uriToFilePath(script.uri),
							misses: range.coverage.misses,
							script,
							startPos: range.startPos,
							tokenPosTable: script.tokenPosTable,
						});
					}
				} catch (e) {
					logError(e, LogCategory.Observatory);
				}
			}
		}

		return results;
	}

	public errorResponse(response: DebugProtocol.Response, message: string) {
		response.success = false;
		response.message = message;
		this.sendResponse(response);
	}

	private formatUriForShortDisplay(uri: string): string {
		if (uri.startsWith("file:")) {
			uri = uriToFilePath(uri);
			if (this.cwd)
				uri = path.relative(this.cwd, uri);
		}

		// Split on the separators and return only the first and last two parts.
		const sep = uri.indexOf("/") === -1 && uri.indexOf("\\") !== -1 ? "\\" : "/";
		const parts = uri.split(sep);
		if (parts.length > 3) {
			return [parts[0], "…", parts[parts.length - 2], parts[parts.length - 1]].join(sep);
		} else {
			return uri;
		}
	}

	protected convertVMUriToSourcePath(uri: string, returnWindowsPath?: boolean): string {
		if (uri.startsWith("file:"))
			return uriToFilePath(uri, returnWindowsPath);

		if (uri.startsWith("package:") && this.packageMap)
			return this.packageMap.resolvePackageUri(uri);

		return uri;
	}

	private valueAsString(ref: VMInstanceRef | VMSentinel, useClassNameAsFallback = true, suppressQuotesAroundStrings: boolean = false): string {
		if (ref.type === "Sentinel")
			return ref.valueAsString;

		const instanceRef = ref as VMInstanceRef;

		if (ref.kind === "String" || ref.valueAsString) {
			let str: string = instanceRef.valueAsString;
			if (instanceRef.valueAsStringIsTruncated)
				str += "…";
			if (instanceRef.kind === "String" && !suppressQuotesAroundStrings)
				str = `"${str}"`;
			return str;
		} else if (ref.kind === "List") {
			return `List (${instanceRef.length} ${instanceRef.length === 1 ? "item" : "items"})`;
		} else if (ref.kind === "Map") {
			return `Map (${instanceRef.length} ${instanceRef.length === 1 ? "item" : "items"})`;
		} else if (ref.kind === "Type") {
			const typeRef = ref as VMTypeRef;
			return `Type (${typeRef.name})`;
		} else if (useClassNameAsFallback) {
			return this.getFriendlyTypeName(instanceRef);
		} else {
			return null;
		}
	}

	private getFriendlyTypeName(ref: VMInstanceRef): string {
		return ref.kind !== "PlainInstance" ? ref.kind : ref.class.name;
	}

	private async instanceRefToVariable(
		thread: ThreadInfo, canEvaluate: boolean, evaluateName: string, name: string, ref: VMInstanceRef | VMSentinel, allowFetchFullString: boolean,
	): Promise<DebugProtocol.Variable> {
		if (ref.type === "Sentinel") {
			return {
				name,
				value: (ref as VMSentinel).valueAsString,
				variablesReference: 0,
			};
		} else {
			const val = ref as InstanceWithEvaluateName;
			// Stick on the evaluateName as we'll need this to build
			// the evaluateName for the child, and we don't have the parent
			// (or a string expression) in the response.
			val.evaluateName = canEvaluate ? evaluateName : undefined;

			let str = config.previewToStringInDebugViews && allowFetchFullString && !val.valueAsString
				? await this.fullValueAsString(thread.ref, val)
				: this.valueAsString(val);
			if (!val.valueAsString && !str)
				str = "";

			return {
				evaluateName: canEvaluate ? evaluateName : null,
				indexedVariables: (val.kind.endsWith("List") ? val.length : null),
				name,
				type: `${val.kind} (${val.class.name})`,
				value: str,
				variablesReference: val.valueAsString ? 0 : thread.storeData(val),
			};
		}
	}

	public isValidToDebug(uri: string) {
		// TODO: See https://github.com/dart-lang/sdk/issues/29813
		return !uri.startsWith("dart:_");
	}

	public isSdkLibrary(uri: string) {
		return uri.startsWith("dart:");
	}

	public isExternalLibrary(uri: string) {
		// If we don't know the local package name, we have to assume nothing is external, else we might disable debugging for the local library.
		return uri.startsWith("package:") && this.packageMap && this.packageMap.localPackageName && !uri.startsWith(`package:${this.packageMap.localPackageName}/`);
	}

	private resolveFileLocation(script: VMScript, tokenPos: number): FileLocation {
		const table: number[][] = script.tokenPosTable;
		for (const entry of table) {
			// [lineNumber, (tokenPos, columnNumber)*]
			for (let index = 1; index < entry.length; index += 2) {
				if (entry[index] === tokenPos) {
					const line = entry[0];
					return { line, column: entry[index + 1] };
				}
			}
		}

		return null;
	}

	private async pollForMemoryUsage(): Promise<void> {
		if (!this.childProcess || this.childProcess.killed)
			return;

		const result = await this.observatory.getVM();
		const vm = result.result as VM;

		const promises: Array<Promise<DebuggerResult>> = [];

		const isolatePromises = vm.isolates.map((isolateRef) => this.observatory.getIsolate(isolateRef.id));
		const isolatesResponses = await Promise.all(isolatePromises);
		const isolates = isolatesResponses.map((response) => response.result as VMIsolate);

		let current = 0;
		let total = 0;

		for (const isolate of isolates) {
			for (const heap of [isolate._heaps.old, isolate._heaps.new]) {
				current += heap.used + heap.external;
				total += heap.capacity + heap.external;
			}
		}

		this.sendEvent(new Event("dart.debugMetrics", { memory: { current, total } }));

		setTimeout(() => this.pollForMemoryUsage(), this.pollforMemoryMs);
	}

	protected logToUser(message: string, category?: string) {
		message = message.trimRight();
		// If we get a multi-line message that looks like it contains an error/stack trace, then process each
		// line individually, so we can attach location metadata to individual lines.
		if (message.indexOf("\n") !== -1 && message.indexOf("Unhandled exception") !== -1) {
			message.split("\n").forEach((line) => this.logToUser(line, category));
			return;
		}

		const output = new OutputEvent(`${message}\n`, category) as OutputEvent & DebugProtocol.OutputEvent;

		// If the output line looks like a stack frame with users code, attempt to link it up to make
		// it clickable.
		const match = message && stackFrameWithUriPattern.exec(message);

		logInfo(`Testing: ${message}`, LogCategory.CI);
		if (match) {
			logInfo("DID MATCH!!!", LogCategory.CI);
			// TODO: Handle dart: uris (using source references)?
			const prefix = match[1];
			const functionName = match[2];
			const sourceUri = match[3];
			const line = parseInt(match[4], 10);
			const col = parseInt(match[5], 10);

			const sourcePath: string | undefined = this.convertVMUriToSourcePath(sourceUri);
			logInfo(`sourcePath: ${sourcePath}`, LogCategory.CI);
			const canShowSource = sourcePath && sourcePath !== sourceUri && fs.existsSync(sourcePath);
			const shortName = this.formatUriForShortDisplay(sourceUri);
			const source = canShowSource ? new Source(shortName, sourcePath, null, null, null) : undefined;

			if (source) {
				output.body.source = source;
				output.body.line = line;
				output.body.column = col;
				// Replace the output to only the text part to avoid the duplicated uri.
				output.body.output = `${prefix}${functionName}\n`;
			}
		}

		this.sendEvent(output);
	}
}

class ThreadManager {
	public nextThreadId: number = 0;

	public threads: ThreadInfo[] = [];
	public bps: { [uri: string]: DebugProtocol.SourceBreakpoint[] } = {};
	private hasConfigurationDone = false;
	private exceptionMode = "Unhandled";

	constructor(public readonly debugSession: DartDebugSession) {
	}

	public async registerThread(ref: VMIsolateRef, eventKind: string): Promise<void> {
		let thread: ThreadInfo = this.getThreadInfoFromRef(ref);

		if (!thread) {
			thread = new ThreadInfo(this, ref, this.nextThreadId);
			this.nextThreadId++;
			this.threads.push(thread);

			// If this is the first time we've seen it, fire an event
			this.debugSession.sendEvent(new ThreadEvent("started", thread.num));

			if (this.hasConfigurationDone)
				thread.receivedConfigurationDone();
		}

		// If it's just become runnable (IsolateRunnable), then set breakpoints.
		if (eventKind === "IsolateRunnable" && !thread.runnable) {
			thread.runnable = true;

			await Promise.all([
				this.debugSession.observatory.setExceptionPauseMode(thread.ref.id, this.exceptionMode),
				this.setLibrariesDebuggable(thread.ref),
				this.resetBreakpoints(),
			]);
			thread.setInitialBreakpoints();
		}
	}

	public receivedConfigurationDone() {
		this.hasConfigurationDone = true;

		for (const thread of this.threads)
			thread.receivedConfigurationDone();
	}

	public getThreadInfoFromRef(ref: VMIsolateRef): ThreadInfo {
		for (const thread of this.threads) {
			if (thread.ref.id === ref.id)
				return thread;
		}
		return null;
	}

	public getThreadInfoFromNumber(num: number): ThreadInfo {
		for (const thread of this.threads) {
			if (thread.num === num)
				return thread;
		}
		return null;
	}

	public getThreads(): Thread[] {
		return this.threads.map((thread: ThreadInfo) => new Thread(thread.num, thread.ref.name));
	}

	public setExceptionPauseMode(mode: string) {
		this.exceptionMode = mode;

		for (const thread of this.threads) {
			if (thread.runnable) {
				let threadMode = mode;

				// If the mode is set to "All Exceptions" but the thread is a snapshot from pub
				// then downgrade it to Uncaught because the user is unlikely to want to be stopping
				// on internal exceptions such trying to parse versions.
				if (mode === "All" && thread.isInfrastructure)
					threadMode = "Unhandled";

				this.debugSession.observatory.setExceptionPauseMode(thread.ref.id, threadMode);
			}
		}
	}

	private async setLibrariesDebuggable(isolateRef: VMIsolateRef): Promise<void> {
		// Helpers to categories libraries as SDK/ExternalLibrary/not.
		// Set whether libraries should be debuggable based on user settings.
		const response = await this.debugSession.observatory.getIsolate(isolateRef.id);
		const isolate: VMIsolate = response.result as VMIsolate;
		await Promise.all(
			isolate.libraries.filter((l) => this.debugSession.isValidToDebug(l.uri)).map((library) => {
				// Note: Condition is negated.
				const shouldDebug = !(
					// Inside here is shouldNotDebug!
					(this.debugSession.isSdkLibrary(library.uri) && !this.debugSession.debugSdkLibraries)
					|| (this.debugSession.isExternalLibrary(library.uri) && !this.debugSession.debugExternalLibraries));
				return this.debugSession.observatory.setLibraryDebuggable(isolate.id, library.id, shouldDebug);
			}));
	}

	// Just resends existing breakpoints
	public async resetBreakpoints(): Promise<void> {
		const promises = [];
		for (const uri of Object.keys(this.bps)) {
			promises.push(this.setBreakpoints(uri, this.bps[uri]));
		}
		await Promise.all(promises);
	}

	public setBreakpoints(uri: string, breakpoints: DebugProtocol.SourceBreakpoint[]): Promise<any[]> {
		// Remember these bps for when new threads start.
		if (breakpoints.length === 0)
			delete this.bps[uri];
		else
			this.bps[uri] = breakpoints;

		let promise;

		for (const thread of this.threads) {
			if (thread.runnable) {
				const result = thread.setBreakpoints(uri, breakpoints);
				if (!promise)
					promise = result;
			}
		}

		if (promise)
			return promise;

		const completer = new PromiseCompleter<boolean[]>();
		const result = [];
		for (const b of breakpoints)
			result.push(true);
		completer.resolve(result);
		return completer.promise;
	}

	public nextDataId: number = 1;
	public storedData: { [id: number]: StoredData } = {};

	public storeData(thread: ThreadInfo, data: VMResponse): number {
		const id = this.nextDataId;
		this.nextDataId++;
		this.storedData[id] = new StoredData(thread, data);
		return id;
	}

	public getStoredData(id: number): StoredData {
		return this.storedData[id];
	}

	public removeStoredData(thread: ThreadInfo) {
		for (const id of Object.keys(this.storedData).map((k) => parseInt(k, 10))) {
			if (this.storedData[id].thread.num === thread.num)
				delete this.storedData[id];
		}
	}

	public removeAllStoredData() {
		for (const id of Object.keys(this.storedData).map((k) => parseInt(k, 10))) {
			delete this.storedData[id];
		}
	}

	public handleIsolateExit(ref: VMIsolateRef) {
		const threadInfo: ThreadInfo = this.getThreadInfoFromRef(ref);
		if (threadInfo) {
			this.debugSession.sendEvent(new ThreadEvent("exited", threadInfo.num));
			this.threads.splice(this.threads.indexOf(threadInfo), 1);
			this.removeStoredData(threadInfo);
		}
	}
}

class StoredData {
	public thread: ThreadInfo;
	public data: VMResponse;

	constructor(thread: ThreadInfo, data: VMResponse) {
		this.thread = thread;
		this.data = data;
	}
}

class ThreadInfo {
	public scriptCompleters: { [key: string]: PromiseCompleter<VMScript> } = {};
	public runnable: boolean = false;
	public vmBps: { [uri: string]: VMBreakpoint[] } = {};
	// TODO: Do we need both sets of breakpoints?
	public breakpoints: { [key: string]: DebugProtocol.SourceBreakpoint } = {};
	public atAsyncSuspension: boolean = false;
	public exceptionReference = 0;
	public paused: boolean = false;

	// Whether this thread is infrastructure (eg. not user code), useful for avoiding breaking
	// on handled exceptions, etc.
	get isInfrastructure(): boolean {
		return this.ref && this.ref.name && this.ref.name.startsWith("pub.dart.snapshot");
	}

	constructor(
		public readonly manager: ThreadManager,
		public readonly ref: VMIsolateRef,
		public readonly num: number) {
	}

	private removeBreakpointsAtUri(uri: string): Promise<DebuggerResult[]> {
		const removeBreakpointPromises = [];
		const breakpoints = this.vmBps[uri];
		if (breakpoints) {
			for (const bp of breakpoints) {
				removeBreakpointPromises.push(this.manager.debugSession.observatory.removeBreakpoint(this.ref.id, bp.id));
			}
			delete this.vmBps[uri];
		}
		return Promise.all(removeBreakpointPromises);
	}

	public removeAllBreakpoints(): Promise<DebuggerResult[]> {
		const removeBreakpointPromises = [];
		for (const uri of Object.keys(this.vmBps)) {
			removeBreakpointPromises.push(this.removeBreakpointsAtUri(uri));
		}
		return Promise.all(removeBreakpointPromises).then((results) => {
			return [].concat.apply([], results);
		});
	}

	public async setBreakpoints(uri: string, breakpoints: DebugProtocol.SourceBreakpoint[]): Promise<VMBreakpoint[]> {
		// Remove all current bps.
		await this.removeBreakpointsAtUri(uri);
		this.vmBps[uri] = [];

		return Promise.all(
			breakpoints.map(async (bp) => {
				const result = await this.manager.debugSession.observatory.addBreakpointWithScriptUri(this.ref.id, uri, bp.line, bp.column);
				const vmBp: VMBreakpoint = (result.result as VMBreakpoint);
				this.vmBps[uri].push(vmBp);
				this.breakpoints[vmBp.id] = bp;
				return vmBp;
			}),
		);
	}

	private gotPauseStart = false;
	private initialBreakpoints = false;
	private hasConfigurationDone = false;
	private hasPendingResume = false;

	public receivedPauseStart() {
		this.gotPauseStart = true;
		this.paused = true;
		this.checkResume();
	}

	public setInitialBreakpoints() {
		this.initialBreakpoints = true;
		this.checkResume();
	}

	public receivedConfigurationDone() {
		this.hasConfigurationDone = true;
		this.checkResume();
	}

	public checkResume() {
		if (this.paused && this.gotPauseStart && this.initialBreakpoints && this.hasConfigurationDone)
			this.resume();
	}

	public handleResumed() {
		this.manager.removeStoredData(this);
		// TODO: Should we be waiting for acknowledgement before doing this?
		this.atAsyncSuspension = false;
		this.exceptionReference = 0;
		this.paused = false;
	}

	public async resume(step?: string): Promise<void> {
		if (!this.paused || this.hasPendingResume)
			return;

		this.hasPendingResume = true;
		try {
			await this.manager.debugSession.observatory.resume(this.ref.id, step);
			this.handleResumed();
		} finally {
			this.hasPendingResume = false;
		}
	}

	public getScript(scriptRef: VMScriptRef): Promise<VMScript> {
		const scriptId = scriptRef.id;

		if (this.scriptCompleters[scriptId]) {
			const completer: PromiseCompleter<VMScript> = this.scriptCompleters[scriptId];
			return completer.promise;
		} else {
			const completer: PromiseCompleter<VMScript> = new PromiseCompleter();
			this.scriptCompleters[scriptId] = completer;

			const observatory = this.manager.debugSession.observatory;
			observatory.getObject(this.ref.id, scriptRef.id).then((result: DebuggerResult) => {
				const script: VMScript = result.result as VMScript;
				completer.resolve(script);
			}).catch((error) => {
				completer.reject(error);
			});

			return completer.promise;
		}
	}

	public storeData(data: VMResponse): number {
		return this.manager.storeData(this, data);
	}

	public handlePaused(atAsyncSuspension?: boolean, exception?: VMInstanceRef) {
		this.atAsyncSuspension = atAsyncSuspension;
		if (exception) {
			(exception as InstanceWithEvaluateName).evaluateName = "$e";
			this.exceptionReference = this.storeData(exception);
		}
		this.paused = true;
	}
}

interface InstanceWithEvaluateName extends VMInstanceRef {
	// Undefined means we cannot evaluate
	// Null means we use the name
	// Otherwise we use the string
	evaluateName: string | null | undefined;
}
