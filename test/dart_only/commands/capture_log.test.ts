import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as sinon from "sinon";
import * as vs from "vscode";
import { STOP_LOGGING } from "../../../src/commands/logging";
import { LogCategory, LogSeverity, platformEol, PromiseCompleter } from "../../../src/debug/utils";
import { fsPath } from "../../../src/utils";
import { log } from "../../../src/utils/log";
import { activate, defer, delay, getRandomTempFolder, sb, waitFor } from "../../helpers";

describe("capture logs command", () => {
	beforeEach(() => activate());
	let tempLogFile: string;
	beforeEach(() => {
		tempLogFile = path.join(getRandomTempFolder(), "test_log.txt");
		const thisTempLogFile = tempLogFile;
		defer(() => {
			if (fs.existsSync(thisTempLogFile))
				fs.unlinkSync(thisTempLogFile);
		});
	});

	async function configureLog(...logCategories: LogCategory[]) {
		const showSaveDialog = sb.stub(vs.window, "showSaveDialog");
		showSaveDialog.resolves(vs.Uri.file(tempLogFile));
		// When prompted for categories, pick just Analyzer.
		const showQuickPick = sb.stub(vs.window, "showQuickPick");
		showQuickPick.resolves(logCategories.map((c) => ({ logCategory: c })));
		// Use a completer so the test can signal when to end logging (normally a user
		// would click the Stop Logging button on the notification).
		const showInformationMessage = sb.stub(vs.window, "showInformationMessage");
		const stopLogging = new PromiseCompleter();
		showInformationMessage.withArgs(sinon.match.any, STOP_LOGGING).resolves(stopLogging.promise);
		// Start the logging but don't await it (it doesn't complete until we stop the logging!).
		const loggingCommand = vs.commands.executeCommand("dart.startLogging");
		// Wait until the command has called for the filename and options (otherwise we'll send our log before
		// the logger is set up because the above call is async).
		await waitFor(() => showQuickPick.called);
		// Add a small delay to ensure the code that creates the log has started (since there are lots of
		// awaits we may have closed the quickPick but not started the log yet).
		await delay(100);

		return {
			stopLogging: async () => {
				// Resolving the promise will stop the logging.
				stopLogging.resolve(STOP_LOGGING);
				// Wait for the logging command to finish.
				await loggingCommand;
			},
		};
	}

	it("writes to the correct file", async () => {
		const logger = await configureLog(LogCategory.Analyzer);

		log("This is a test"); // Should be logged
		log("This is an analyzer event", LogSeverity.Info, LogCategory.Analyzer); // Should be logged
		log("This is an flutter daemon event", LogSeverity.Info, LogCategory.FlutterDaemon); // Should not be logged
		log("This is an flutter daemon ERROR event", LogSeverity.Error, LogCategory.FlutterDaemon); // Should be logged because it's an error.

		await logger.stopLogging();

		assert.ok(fs.existsSync(tempLogFile));
		const lines = fs.readFileSync(tempLogFile).toString().trim().split("\n").map((l) => l.trim());
		const lastLine = lines[lines.length - 1];
		assert.ok(lines.find((l) => l.endsWith("Log file started")), `Did not find 'Log file started' in ${platformEol}${lines.join(platformEol)}`);
		assert.ok(lines.find((l) => l.indexOf("This is a test") !== -1), `Did not find 'This is a test' in ${platformEol}${lines.join(platformEol)}`);
		assert.ok(lastLine.endsWith("Log file ended"), `Last line of log was '${lastLine}' instead of 'Log file ended'`);

		// Ensure the log file was opened.
		assert.equal(fsPath(vs.window.activeTextEditor.document.uri), tempLogFile);
	});

	it("does not start logging if cancelled", async () => {
		// When prompted for a log file, provide this temp filename.
		const showSaveDialog = sb.stub(vs.window, "showSaveDialog");
		showSaveDialog.resolves(undefined);

		const showInformationMessage = sb.stub(vs.window, "showInformationMessage");

		// Start the logging but don't await it (it doesn't complete until we stop the logging!).
		const loggingCommand = vs.commands.executeCommand("dart.startLogging");

		// Wait until the command has called for the filename (otherwise we'll send our log before
		// the logger is set up because the above call is async).
		await waitFor(() => showSaveDialog.called);

		// Wait for the logging command to finish (which it should automatically because we aborted).
		await loggingCommand;

		assert.ok(!fs.existsSync(tempLogFile));
	});

	it("only logs the specified categories", async () => {
		const logger = await configureLog(LogCategory.Analyzer);

		log("This is a test"); // Should be logged
		log("This is an analyzer event", LogSeverity.Info, LogCategory.Analyzer); // Should be logged
		log("This is an flutter daemon event", LogSeverity.Info, LogCategory.FlutterDaemon); // Should not be logged

		await logger.stopLogging();

		assert.ok(fs.existsSync(tempLogFile));
		const lines = fs.readFileSync(tempLogFile).toString().trim().split("\n").map((l) => l.trim());
		assert.ok(lines.find((l) => l.indexOf("This is a test") !== -1), `Did not find 'This is a test' in ${platformEol}${lines.join(platformEol)}`);
		assert.ok(lines.find((l) => l.indexOf("This is an analyzer event") !== -1), `Did not find 'This is an analyzer event' in ${platformEol}${lines.join(platformEol)}`);
	});

	it("always logs WARN and ERROR log to General", async () => {
		const logger = await configureLog(LogCategory.General);

		log("This is a test"); // Should be logged
		log("This is an flutter daemon event", LogSeverity.Info, LogCategory.FlutterDaemon); // Should not be logged
		log("This is an flutter daemon ERROR event", LogSeverity.Error, LogCategory.FlutterDaemon); // Should be logged because it's an error.

		await logger.stopLogging();

		assert.ok(fs.existsSync(tempLogFile));
		const lines = fs.readFileSync(tempLogFile).toString().trim().split("\n").map((l) => l.trim());
		assert.ok(lines.find((l) => l.indexOf("This is a test") !== -1), `Did not find 'This is a test' in ${platformEol}${lines.join(platformEol)}`);
		assert.ok(lines.find((l) => l.indexOf("This is an flutter daemon event") === -1), "Unexpectedly found 'This is an flutter daemon event' in the log");
		assert.ok(lines.find((l) => l.indexOf("This is an flutter daemon ERROR event") !== -1), `Did not find 'This is an flutter daemon ERROR event' in ${platformEol}${lines.join(platformEol)}`);
	});
});
