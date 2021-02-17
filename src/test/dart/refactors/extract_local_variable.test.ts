import * as assert from "assert";
import * as vs from "vscode";
import { activate, currentDoc, ensureTestContent, extApi, rangeOf, setTestContent } from "../../helpers";

describe("refactor", () => {

	beforeEach("activate", () => activate());

	it("can extract simple code into a local variable", async () => {
		await setTestContent(`
String name() {
  return "Danny";
}
		`);

		const actions = await (vs.commands.executeCommand("vscode.executeCodeActionProvider", currentDoc().uri, rangeOf(`|"Danny"|`)) as Thenable<vs.CodeAction[]>);
		assert.ok(actions);
		assert.ok(actions.length);

		const extractLocalAction = actions.find((r) => r.title.indexOf("Extract Local Variable") !== -1);
		assert.ok(extractLocalAction, "Action was not found");

		await (vs.commands.executeCommand(extractLocalAction.command!.command, ...extractLocalAction.command!.arguments || []));

		// Incorrect indenting for non-LSP is due to https://github.com/Microsoft/vscode/issues/63129
		// When that's fixed, this variable can be removed.
		const extraIndent = extApi.isLsp ? "" : "  ";

		await ensureTestContent(`
String name() {
  var s = "Danny";
  ${extraIndent}return s;
}
		`);
	});
});
