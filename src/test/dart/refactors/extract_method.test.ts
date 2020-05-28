import * as assert from "assert";
import * as sinon from "sinon";
import * as vs from "vscode";
import { REFACTOR_ANYWAY, REFACTOR_FAILED_DOC_MODIFIED } from "../../../shared/constants";
import { PromiseCompleter } from "../../../shared/utils";
import { activate, ensureTestContent, executeCodeAction, extApi, getCodeActions, positionOf, rangeOf, sb, setTestContent, waitForResult } from "../../helpers";

describe("extract method refactor", () => {

	beforeEach("activate", () => activate());

	it("can extract simple code into a method", async () => {
		const showInputBox = sb.stub(vs.window, "showInputBox");
		showInputBox.resolves("newMethod");

		await setTestContent(`
main() {
  print("Hello, world!");
}
		`);

		await executeCodeAction({ title: "Extract Method" }, rangeOf("|print(\"Hello, world!\");|"));

		await ensureTestContent(`
main() {
  newMethod();
}

void newMethod() {
  print("Hello, world!");
}
		`);
	});

	it("is not available for an invalid range", async () => {
		await setTestContent(`
main() {
  print("Hello, world!");
}
		`);
		const codeActions = await getCodeActions({ title: "Extract Method" }, new vs.Range(positionOf("^main("), positionOf("world^")));
		assert.equal(codeActions.length, 0);

	});

	it("displays an error if an invalid new name is provided", async function () {
		if (extApi.isLsp)
			this.skip(); // LSP doesn't ask for the name

		const showInputBox = sb.stub(vs.window, "showInputBox");
		showInputBox.resolves("\"\"\"");
		const showErrorMessage = sb.stub(vs.window, "showErrorMessage");

		await setTestContent(`
main() {
  print("Hello, world!");
}
		`);
		await executeCodeAction({ title: "Extract Method" }, rangeOf("|print(\"Hello, world!\");|"));

		// Ensure the content was not modified.
		await ensureTestContent(`
main() {
  print("Hello, world!");
}
		`);
		assert(showErrorMessage.calledOnce);
	});

	it("does not apply changes when there are warnings if the user does not approve", async function () {
		if (extApi.isLsp)
			this.skip(); // LSP doesn't ask for the name

		const showInputBox = sb.stub(vs.window, "showInputBox");
		showInputBox.resolves("Aaaa");
		const showWarningMessage = sb.stub(vs.window, "showWarningMessage").callThrough();
		const refactorPrompt = showWarningMessage.withArgs(sinon.match.any, REFACTOR_ANYWAY).resolves();

		await setTestContent(`
main() {
  print("Hello, world!");
}
		`);
		await executeCodeAction({ title: "Extract Method" }, rangeOf("|print(\"Hello, world!\");|"));

		// Ensure the content was not modified.
		await ensureTestContent(`
main() {
  print("Hello, world!");
}
		`);
		assert(refactorPrompt.calledOnce);
	});

	it("applies changes when there are warnings if the user approves", async function () {
		if (extApi.isLsp)
			this.skip(); // LSP doesn't ask for the name

		const showInputBox = sb.stub(vs.window, "showInputBox");
		showInputBox.resolves("Aaaa");
		const showWarningMessage = sb.stub(vs.window, "showWarningMessage").callThrough();
		const refactorPrompt = showWarningMessage.withArgs(sinon.match.any, REFACTOR_ANYWAY).resolves(REFACTOR_ANYWAY);

		await setTestContent(`
main() {
  print("Hello, world!");
}
		`);
		await executeCodeAction({ title: "Extract Method" }, rangeOf("|print(\"Hello, world!\");|"));

		// Ensure the content was modified.
		await ensureTestContent(`
main() {
  Aaaa();
}

void Aaaa() {
  print("Hello, world!");
}
		`);

		assert(refactorPrompt.calledOnce);
	});

	it("rejects the edit if the document has been modified before the user approves", async function () {
		if (extApi.isLsp)
			this.skip(); // LSP doesn't prompt

		const showInputBox = sb.stub(vs.window, "showInputBox");
		showInputBox.resolves("Aaaaa");
		const showWarningMessage = sb.stub(vs.window, "showWarningMessage");
		const showErrorMessage = sb.stub(vs.window, "showErrorMessage");
		// Accept after some time (so the doc can be edited by the test).
		const refactorAnywayChoice = new PromiseCompleter();
		const refactorPrompt = showWarningMessage.withArgs(sinon.match.any, REFACTOR_ANYWAY).returns(refactorAnywayChoice.promise);
		const rejectMessage = showErrorMessage.withArgs(REFACTOR_FAILED_DOC_MODIFIED).resolves();

		await setTestContent(`
main() {
  print("Hello, world!");
}
		`);

		// Start the command but don't await it.
		const refactorCommand = executeCodeAction({ title: "Extract Method" }, rangeOf("|print(\"Hello, world!\");|"));

		// Wait for the message to appear.
		await waitForResult(() => refactorPrompt.called);

		// Change the document in the meantime.
		await setTestContent(`
main() {
  print("Hello, world!");
}
// This comment was added
		`);

		refactorAnywayChoice.resolve(REFACTOR_ANYWAY);

		// Wait for the command to complete.
		await refactorCommand;

		// Ensure nothing changed.
		await ensureTestContent(`
main() {
  print("Hello, world!");
}
// This comment was added
		`);

		assert(rejectMessage.calledOnce, "Reject message was not shown");
	});
});
