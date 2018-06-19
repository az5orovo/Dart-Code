import * as fs from "fs";
import * as path from "path";
import * as vs from "vscode";
import { Event, EventEmitter } from "vscode";
import { isDevExtension } from "../utils";

export enum LogCategory {
	General,
	CI,
	Analyzer,
	FlutterDaemon,
	FlutterRun,
	FlutterTest,
	Observatory,
}
export const userSelectableLogCategories: { [key: string]: LogCategory } = {
	"Analysis Server": LogCategory.Analyzer,
	"Debugger (Observatory)": LogCategory.Observatory,
	"Flutter Device Daemon": LogCategory.FlutterDaemon,
	"Flutter Run": LogCategory.FlutterRun,
	"Flutter Test": LogCategory.FlutterTest,
};
export class LogMessage {
	constructor(public readonly message: string, public readonly category: LogCategory) { }
}

const onLogEmitter: EventEmitter<LogMessage> = new EventEmitter<LogMessage>();
export const onLog: Event<LogMessage> = onLogEmitter.event;
export function log(message: string, category = LogCategory.General) {
	onLogEmitter.fire(new LogMessage((message || "").toString().trim(), category));
}
export function logError(error: any) {
	if (!error)
		error = "Empty error";
	if (error instanceof Error)
		error = error.message + (error.stack ? `\n${error.stack}` : "");
	if (typeof error !== "string") {
		try {
			error = JSON.stringify(error);
		} catch {
			if (error.message)
				error = error.message;
			else
				error = `${error}`;
		}
	}
	if (isDevExtension)
		vs.window.showErrorMessage("DEBUG: " + error);
	console.error(error);
	log(`ERR: ${error}`, LogCategory.General);
}
export function logWarn(warning: string) {
	if (isDevExtension)
		vs.window.showWarningMessage("DEBUG: " + warning);
	console.warn(warning);
	log(`WARN: ${warning}`, LogCategory.General);
}
export function logInfo(info: string) {
	console.log(info);
	log(info, LogCategory.General);
}
export const debugLogTypes: { [key: string]: LogCategory } = {
	"dart.log.flutter.run": LogCategory.FlutterRun,
	"dart.log.flutter.test": LogCategory.FlutterTest,
	"dart.log.observatory": LogCategory.Observatory,
};
export function handleDebugLogEvent(event: string, message: string) {
	const cat = debugLogTypes[event];
	if (event)
		log(message, cat);
	else
		logWarn(`Failed to handle log event ${event}`);
}

export function logTo(file: string, logCategories?: LogCategory[], maxLength = 2000): ({ dispose: () => Promise<void> }) {
	if (!file || !path.isAbsolute(file))
		throw new Error("Path passed to logTo must be an absolute path");
	const time = () => `[${(new Date()).toLocaleTimeString()}] `;
	let logStream = fs.createWriteStream(file);
	logStream.write(`${time()}Log file started\n`);
	let logger = onLog((e) => {
		if (logCategories && logCategories.indexOf(e.category) === -1)
			return;

		const logMessage = e.message.length > maxLength
			? e.message.substring(0, maxLength) + "…"
			: e.message;
		const prefix = `${time()}[${LogCategory[e.category]}] `;
		logStream.write(`${prefix}${logMessage}\n`);
	});
	return {
		dispose(): Promise<void> {
			if (logger) {
				logger.dispose();
				logger = null;
			}
			if (logStream) {
				logStream.write(`${time()}Log file ended\n`);
				return new Promise((resolve) => {
					logStream.end(resolve);
					logStream = null;
				});
			}
		},
	};
}
