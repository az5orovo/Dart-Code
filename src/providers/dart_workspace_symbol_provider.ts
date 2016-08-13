"use strict";

import { WorkspaceSymbolProvider, SymbolInformation, CancellationToken, SymbolKind, Location, Uri, Range, Position, workspace } from "vscode";
import * as path from "path";
import * as fs from "fs";
import { Analyzer, getSymbolKindForElementKind } from "../analysis/analyzer";
import { toRange, isWithinRootPath } from "../utils";
import * as as from "../analysis/analysis_server_types";

export class DartWorkspaceSymbolProvider implements WorkspaceSymbolProvider {
	private analyzer: Analyzer;
	constructor(analyzer: Analyzer) {
		this.analyzer = analyzer;
	}

	provideWorkspaceSymbols(query: string, token: CancellationToken): Thenable<SymbolInformation[]> {
		query = this.sanitizeUserQuery(query);
		return new Promise<SymbolInformation[]>((resolve, reject) => {
			Promise.all([
				this.searchTopLevelSymbols(query),
				this.searchmemberDeclerations(query)
			]).then(results => resolve(this.combineResults(results)), e => { console.warn(e.message); reject(); });
		});
	}

	private combineResults(results: as.SearchResult[][]): SymbolInformation[] {
		return results[0].concat(results[1]).filter(r => this.shouldIncludeResult(r)).map(r => this.convertResult(r));
	}

	private searchTopLevelSymbols(query: string): PromiseLike<as.SearchResult[]> {
		let chars = Array.from(query);
		chars = chars.map((c: string) => {
			if (c.toUpperCase() == c.toLowerCase())
				return c;
			return `[${c.toUpperCase()}${c.toLowerCase()}]`;
		});
		let pattern = chars.join(".*");

		return new Promise<as.SearchResult[]>((resolve, reject) => {
			this.analyzer.searchFindTopLevelDeclarations({ pattern: pattern }).then(resp => {
				let disposable = this.analyzer.registerForSearchResults(notification => {
					// Skip any results that are not ours (or are not the final results).
					if (notification.id != resp.id || !notification.isLast)
						return;

					disposable.dispose();
					resolve(notification.results);
				})
			}, e => { console.warn(e.message); reject(); });
		});
	}

	private searchmemberDeclerations(query: string): PromiseLike<as.SearchResult[]> {
		return new Promise<as.SearchResult[]>((resolve, reject) => {
			this.analyzer.searchFindMemberDeclarations({
				name: query
			}).then(resp => {
				let disposable = this.analyzer.registerForSearchResults(notification => {
					// Skip any results that are not ours (or are not the final results).
					if (notification.id != resp.id || !notification.isLast)
						return;

					disposable.dispose();
					resolve(notification.results);
				})
			}, e => { console.warn(e.message); reject(); });
		});
	}

	private sanitizeUserQuery(query: string): string {
		let chars = Array.from(query);
		// Filter out special chars that will break regex.
		// searchFindTopLevelDeclarations supports regex, but we build the pattern with the output of this.
		// searchmemberDeclerations is not intended to support regex but does.
		chars = chars.filter((c) => {
			return "[](){}\\|./<>?+".indexOf(c) == -1;
		});
		return chars.join("");
	}

	private shouldIncludeResult(result: as.SearchResult): boolean {
		// Must be either:
		//   1. Public (not start with an underscore).
		//   2. In our project.
		return !result.path[0].name.startsWith("_") || isWithinRootPath(result.location.file);
	}

	private convertResult(result: as.SearchResult): SymbolInformation {
		// Rewrite the filename for best display.
		result.location.file = this.rewriteFilename(result.location.file);

		// If the parent name is just the filename, send null, else Code will display it badly (strip up to last dot).
		let containerName = result.path[1].name;
		if (path.basename(result.location.file) == result.path[1].name)
			containerName = null;

		return {
			name: result.path[0].name + (result.path[0].parameters || ""),
			kind: getSymbolKindForElementKind(result.path[0].kind),
			location: {
				uri: Uri.file(result.location.file),
				range: toRange(result.location)
			},
			containerName: containerName
		};
	}

	private rewriteFilename(inputPath: string): string {
		// HACK: The AS returns paths to the PUB_CACHE folder, which Code can't
		// convert to relative paths (so they look terrible). If the file exists in
		// workspace.rootPath we rewrite the path to there which gives us a nice
		// relative path.

		// Currently I only do this for "hosted\pub.dartlang.org" as I'm not sure of the
		// rules for these paths!

		const pubCachePath = "hosted" + path.sep + "pub.dartlang.org";
		let pubCachePathIndex = inputPath.indexOf(pubCachePath);
		if (pubCachePathIndex > -1) {

			let relativePath = inputPath.substring(pubCachePathIndex + pubCachePath.length + 1);

			// Packages in pubcache are versioned so trim the "-x.x.x" off the end of the foldername.
			let pathComponents = relativePath.split(path.sep);
			pathComponents[0] = pathComponents[0].split("-")[0];

			// Symlink goes into the lib folder, so strip that out of the path.
			if (pathComponents[1] == "lib")
				pathComponents.splice(1, 1);

			// Build the path and check it exists.
			let possiblePath = path.join(workspace.rootPath, "packages", pathComponents.join(path.sep));
			if (fs.existsSync(possiblePath))
				return possiblePath;
		}

		return inputPath;
	}
}
