import * as vs from "vscode";
import { Logger } from "../../shared/interfaces";
import { fsPath } from "../../shared/utils/fs";

const fileUriPattern = new RegExp("(?<uri>file:\\/{2,3}\\S+[\\/]\\S+\\.dart)(?:[: ](?<line>\\d+):(?<col>\\d+))?", "mg");

export class DartFileUriTerminalLinkProvider implements vs.TerminalLinkProvider<DartFileUriTerminalLink> {
	constructor(private readonly logger: Logger) {
	}

	public async provideTerminalLinks(context: vs.TerminalLinkContext, token: vs.CancellationToken): Promise<DartFileUriTerminalLink[]> {
		const results: DartFileUriTerminalLink[] = [];
		fileUriPattern.lastIndex = -1;
		let result: RegExpExecArray | null;
		// tslint:disable-next-line: no-conditional-assignment
		while ((result = fileUriPattern.exec(context.line)) && result.groups) {
			let uri: vs.Uri | undefined;
			try {
				uri = vs.Uri.parse(result.groups.uri, true);
			} catch (e) {
				this.logger.error(e);
				continue;
			}
			if (!uri)
				continue;

			const line = result.groups.line ? parseInt(result.groups.line) : undefined;
			const col = result.groups.col ? parseInt(result.groups.col) : undefined;
			const startIndex = result.index;
			// TODO: This should be "result[0].length" but including the line/col can cause
			// the tooltip not to render correctly, so we only highlight the uri for now.
			// https://github.com/microsoft/vscode/issues/108301
			const length = result.groups.uri.length;

			results.push({
				col,
				length,
				line,
				startIndex,
				tooltip: "Open file in editor",
				uri,
			});
		}

		return results;
	}

	public handleTerminalLink(link: DartFileUriTerminalLink): vs.ProviderResult<void> {
		const filePath = fsPath(link.uri);
		vs.commands.executeCommand("_dart.jumpToLineColInUri", vs.Uri.file(filePath), link.line, link.col);
	}
}

interface DartFileUriTerminalLink extends vs.TerminalLink {
	startIndex: number;
	length: number;
	tooltip: string;
	uri: vs.Uri;
	line: number | undefined;
	col: number | undefined;
}
