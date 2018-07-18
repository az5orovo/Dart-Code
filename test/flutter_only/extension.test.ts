import * as assert from "assert";
import * as path from "path";
import * as vs from "vscode";
import { fsPath, Sdks } from "../../src/utils";
import { logInfo } from "../../src/utils/log";
import { ext, extApi } from "../helpers";

describe("test environment", () => {
	it("has opened the correct folder", () => {
		const wfs = vs.workspace.workspaceFolders;
		assert.equal(wfs.length, 1);
		assert.ok(
			fsPath(wfs[0].uri).endsWith(path.sep + "flutter_hello_world"),
			`${fsPath(wfs[0].uri)} doesn't end with ${path.sep}flutter_hello_world`,
		);
	});
});

describe("extension", () => {
	it("activated", async () => {
		await ext.activate();
		assert.equal(ext.isActive, true);
	});
	it("found the Dart and Flutter SDK", async () => {
		await ext.activate();
		assert.ok(extApi);
		const sdks: Sdks = extApi.sdks;
		assert.ok(sdks);
		assert.ok(sdks.dart);
		assert.ok(sdks.flutter);
		logInfo("        " + JSON.stringify(sdks, undefined, 8).trim().slice(1, -1).trim());
		logInfo(`        "analysis_server": ${extApi.analyzerCapabilities.version}`);
	});
	it("used Flutter's version of the Dart SDK", async () => {
		await ext.activate();
		assert.ok(extApi);
		const sdks: Sdks = extApi.sdks;
		assert.ok(sdks);
		assert.notEqual(sdks.dart.indexOf("flutter"), -1);
	});
});
