// This file was generated by Dart-Code-Class-Builder
// and should not be hand-edited!

"use strict";

import * as vs from "vscode";
import * as as from "./analysis_server_types";
import * as a from "./analyzer";

export abstract class AnalyzerGen {
	protected abstract notify<T>(subscriptions: ((notification: T) => void)[], params: T);
	protected abstract subscribe<T>(subscriptions: ((notification: T) => void)[], subscriber: (notification: T) => void): vs.Disposable;
	protected abstract sendRequest<TReq, TResp>(method: string, params?: TReq): Thenable<TResp>;

	private serverConnectedSubscriptions: ((notification: as.ServerConnectedNotification) => void)[] = [];
	private serverErrorSubscriptions: ((notification: as.ServerErrorNotification) => void)[] = [];
	private serverStatusSubscriptions: ((notification: as.ServerStatusNotification) => void)[] = [];
	private analysisAnalyzedFilesSubscriptions: ((notification: as.AnalysisAnalyzedFilesNotification) => void)[] = [];
	private analysisErrorsSubscriptions: ((notification: as.AnalysisErrorsNotification) => void)[] = [];
	private analysisFlushResultsSubscriptions: ((notification: as.AnalysisFlushResultsNotification) => void)[] = [];
	private analysisFoldingSubscriptions: ((notification: as.AnalysisFoldingNotification) => void)[] = [];
	private analysisHighlightsSubscriptions: ((notification: as.AnalysisHighlightsNotification) => void)[] = [];
	private analysisImplementedSubscriptions: ((notification: as.AnalysisImplementedNotification) => void)[] = [];
	private analysisInvalidateSubscriptions: ((notification: as.AnalysisInvalidateNotification) => void)[] = [];
	private analysisNavigationSubscriptions: ((notification: as.AnalysisNavigationNotification) => void)[] = [];
	private analysisOccurrencesSubscriptions: ((notification: as.AnalysisOccurrencesNotification) => void)[] = [];
	private analysisOutlineSubscriptions: ((notification: as.AnalysisOutlineNotification) => void)[] = [];
	private analysisOverridesSubscriptions: ((notification: as.AnalysisOverridesNotification) => void)[] = [];
	private completionResultsSubscriptions: ((notification: as.CompletionResultsNotification) => void)[] = [];
	private searchResultsSubscriptions: ((notification: as.SearchResultsNotification) => void)[] = [];
	private executionLaunchDataSubscriptions: ((notification: as.ExecutionLaunchDataNotification) => void)[] = [];

	protected handleNotification(evt: a.UnknownNotification) {
		switch (evt.event) {
			case "server.connected":
				this.notify(this.serverConnectedSubscriptions, <as.ServerConnectedNotification>evt.params);
				break;
			case "server.error":
				this.notify(this.serverErrorSubscriptions, <as.ServerErrorNotification>evt.params);
				break;
			case "server.status":
				this.notify(this.serverStatusSubscriptions, <as.ServerStatusNotification>evt.params);
				break;
			case "analysis.analyzedFiles":
				this.notify(this.analysisAnalyzedFilesSubscriptions, <as.AnalysisAnalyzedFilesNotification>evt.params);
				break;
			case "analysis.errors":
				this.notify(this.analysisErrorsSubscriptions, <as.AnalysisErrorsNotification>evt.params);
				break;
			case "analysis.flushResults":
				this.notify(this.analysisFlushResultsSubscriptions, <as.AnalysisFlushResultsNotification>evt.params);
				break;
			case "analysis.folding":
				this.notify(this.analysisFoldingSubscriptions, <as.AnalysisFoldingNotification>evt.params);
				break;
			case "analysis.highlights":
				this.notify(this.analysisHighlightsSubscriptions, <as.AnalysisHighlightsNotification>evt.params);
				break;
			case "analysis.implemented":
				this.notify(this.analysisImplementedSubscriptions, <as.AnalysisImplementedNotification>evt.params);
				break;
			case "analysis.invalidate":
				this.notify(this.analysisInvalidateSubscriptions, <as.AnalysisInvalidateNotification>evt.params);
				break;
			case "analysis.navigation":
				this.notify(this.analysisNavigationSubscriptions, <as.AnalysisNavigationNotification>evt.params);
				break;
			case "analysis.occurrences":
				this.notify(this.analysisOccurrencesSubscriptions, <as.AnalysisOccurrencesNotification>evt.params);
				break;
			case "analysis.outline":
				this.notify(this.analysisOutlineSubscriptions, <as.AnalysisOutlineNotification>evt.params);
				break;
			case "analysis.overrides":
				this.notify(this.analysisOverridesSubscriptions, <as.AnalysisOverridesNotification>evt.params);
				break;
			case "completion.results":
				this.notify(this.completionResultsSubscriptions, <as.CompletionResultsNotification>evt.params);
				break;
			case "search.results":
				this.notify(this.searchResultsSubscriptions, <as.SearchResultsNotification>evt.params);
				break;
			case "execution.launchData":
				this.notify(this.executionLaunchDataSubscriptions, <as.ExecutionLaunchDataNotification>evt.params);
				break;
		}
	}

	/**
	Reports that the server is running. This notification is
	issued once after the server has started running but before
	any requests are processed to let the client know that it
	started correctly.
	It is not possible to subscribe to or unsubscribe from this
	notification.
	*/
	registerForServerConnected(subscriber: (notification: as.ServerConnectedNotification) => void): vs.Disposable {
		return this.subscribe(this.serverConnectedSubscriptions, subscriber);
	}

	/**
	Reports that an unexpected error has occurred while
	executing the server. This notification is not used for
	problems with specific requests (which are returned as part
	of the response) but is used for exceptions that occur while
	performing other tasks, such as analysis or preparing
	notifications.
	It is not possible to subscribe to or unsubscribe from this
	notification.
	*/
	registerForServerError(subscriber: (notification: as.ServerErrorNotification) => void): vs.Disposable {
		return this.subscribe(this.serverErrorSubscriptions, subscriber);
	}

	/**
	Reports the current status of the server. Parameters are
	omitted if there has been no change in the status
	represented by that parameter.
	This notification is not subscribed to by default. Clients
	can subscribe by including the value "STATUS" in
	the list of services passed in a server.setSubscriptions
	request.
	*/
	registerForServerStatus(subscriber: (notification: as.ServerStatusNotification) => void): vs.Disposable {
		return this.subscribe(this.serverStatusSubscriptions, subscriber);
	}

	/**
	Reports the paths of the files that are being analyzed.
	This notification is not subscribed to by default. Clients can
	subscribe by including the value "ANALYZED_FILES" in the list
	of services passed in an analysis.setGeneralSubscriptions request.
	*/
	registerForAnalysisAnalyzedFiles(subscriber: (notification: as.AnalysisAnalyzedFilesNotification) => void): vs.Disposable {
		return this.subscribe(this.analysisAnalyzedFilesSubscriptions, subscriber);
	}

	/**
	Reports the errors associated with a given file. The set of
	errors included in the notification is always a complete
	list that supersedes any previously reported errors.
	It is only possible to unsubscribe from this notification by
	using the command-line flag --no-error-notification.
	*/
	registerForAnalysisErrors(subscriber: (notification: as.AnalysisErrorsNotification) => void): vs.Disposable {
		return this.subscribe(this.analysisErrorsSubscriptions, subscriber);
	}

	/**
	Reports that any analysis results that were previously
	associated with the given files should be considered to be
	invalid because those files are no longer being analyzed,
	either because the analysis root that contained it is no
	longer being analyzed or because the file no longer exists.
	If a file is included in this notification and at some later
	time a notification with results for the file is received,
	clients should assume that the file is once again being
	analyzed and the information should be processed.
	It is not possible to subscribe to or unsubscribe from this
	notification.
	*/
	registerForAnalysisFlushResults(subscriber: (notification: as.AnalysisFlushResultsNotification) => void): vs.Disposable {
		return this.subscribe(this.analysisFlushResultsSubscriptions, subscriber);
	}

	/**
	Reports the folding regions associated with a given
	file. Folding regions can be nested, but will not be
	overlapping. Nesting occurs when a foldable element, such as
	a method, is nested inside another foldable element such as
	a class.
	This notification is not subscribed to by default. Clients
	can subscribe by including the value "FOLDING" in
	the list of services passed in an analysis.setSubscriptions
	request.
	*/
	registerForAnalysisFolding(subscriber: (notification: as.AnalysisFoldingNotification) => void): vs.Disposable {
		return this.subscribe(this.analysisFoldingSubscriptions, subscriber);
	}

	/**
	Reports the highlight regions associated with a given file.
	This notification is not subscribed to by default. Clients
	can subscribe by including the value "HIGHLIGHTS"
	in the list of services passed in an
	analysis.setSubscriptions request.
	*/
	registerForAnalysisHighlights(subscriber: (notification: as.AnalysisHighlightsNotification) => void): vs.Disposable {
		return this.subscribe(this.analysisHighlightsSubscriptions, subscriber);
	}

	/**
	Reports the classes that are implemented or extended and
	class members that are implemented or overridden in a file.
	This notification is not subscribed to by default. Clients
	can subscribe by including the value "IMPLEMENTED" in
	the list of services passed in an analysis.setSubscriptions
	request.
	*/
	registerForAnalysisImplemented(subscriber: (notification: as.AnalysisImplementedNotification) => void): vs.Disposable {
		return this.subscribe(this.analysisImplementedSubscriptions, subscriber);
	}

	/**
	Reports that the navigation information associated with a region of a
	single file has become invalid and should be re-requested.
	This notification is not subscribed to by default. Clients can
	subscribe by including the value "INVALIDATE" in the list of
	services passed in an analysis.setSubscriptions request.
	*/
	registerForAnalysisInvalidate(subscriber: (notification: as.AnalysisInvalidateNotification) => void): vs.Disposable {
		return this.subscribe(this.analysisInvalidateSubscriptions, subscriber);
	}

	/**
	Reports the navigation targets associated with a given file.
	This notification is not subscribed to by default. Clients
	can subscribe by including the value "NAVIGATION"
	in the list of services passed in an
	analysis.setSubscriptions request.
	*/
	registerForAnalysisNavigation(subscriber: (notification: as.AnalysisNavigationNotification) => void): vs.Disposable {
		return this.subscribe(this.analysisNavigationSubscriptions, subscriber);
	}

	/**
	Reports the occurrences of references to elements within a
	single file.
	This notification is not subscribed to by default. Clients
	can subscribe by including the value "OCCURRENCES"
	in the list of services passed in an
	analysis.setSubscriptions request.
	*/
	registerForAnalysisOccurrences(subscriber: (notification: as.AnalysisOccurrencesNotification) => void): vs.Disposable {
		return this.subscribe(this.analysisOccurrencesSubscriptions, subscriber);
	}

	/**
	Reports the outline associated with a single file.
	This notification is not subscribed to by default. Clients
	can subscribe by including the value "OUTLINE" in
	the list of services passed in an analysis.setSubscriptions
	request.
	*/
	registerForAnalysisOutline(subscriber: (notification: as.AnalysisOutlineNotification) => void): vs.Disposable {
		return this.subscribe(this.analysisOutlineSubscriptions, subscriber);
	}

	/**
	Reports the overriding members in a file.
	This notification is not subscribed to by default. Clients
	can subscribe by including the value "OVERRIDES" in
	the list of services passed in an analysis.setSubscriptions
	request.
	*/
	registerForAnalysisOverrides(subscriber: (notification: as.AnalysisOverridesNotification) => void): vs.Disposable {
		return this.subscribe(this.analysisOverridesSubscriptions, subscriber);
	}

	/**
	Reports the completion suggestions that should be presented
	to the user. The set of suggestions included in the
	notification is always a complete list that supersedes any
	previously reported suggestions.
	*/
	registerForCompletionResults(subscriber: (notification: as.CompletionResultsNotification) => void): vs.Disposable {
		return this.subscribe(this.completionResultsSubscriptions, subscriber);
	}

	/**
	Reports some or all of the results of performing a requested
	search. Unlike other notifications, this notification
	contains search results that should be added to any
	previously received search results associated with the same
	search id.
	*/
	registerForSearchResults(subscriber: (notification: as.SearchResultsNotification) => void): vs.Disposable {
		return this.subscribe(this.searchResultsSubscriptions, subscriber);
	}

	/**
	Reports information needed to allow a single file to be launched.
	This notification is not subscribed to by default. Clients can
	subscribe by including the value "LAUNCH_DATA" in the list of services
	passed in an execution.setSubscriptions request.
	*/
	registerForExecutionLaunchData(subscriber: (notification: as.ExecutionLaunchDataNotification) => void): vs.Disposable {
		return this.subscribe(this.executionLaunchDataSubscriptions, subscriber);
	}

	/**
	Return the version number of the analysis server.
	*/
	serverGetVersion(): Thenable<as.ServerGetVersionResponse> {
		return this.sendRequest("server.getVersion");
	}

	/**
	Cleanly shutdown the analysis server. Requests that are
	received after this request will not be processed. Requests
	that were received before this request, but for which a
	response has not yet been sent, will not be responded to. No
	further responses or notifications will be sent after the
	response to this request has been sent.
	*/
	serverShutdown(): Thenable<a.UnknownResponse> {
		return this.sendRequest("server.shutdown");
	}

	/**
	Subscribe for services. All previous subscriptions are
	replaced by the given set of services.
	It is an error if any of the elements in the list are not
	valid services. If there is an error, then the current
	subscriptions will remain unchanged.
	*/
	serverSetSubscriptions(request: as.ServerSetSubscriptionsRequest): Thenable<a.UnknownResponse> {
		return this.sendRequest("server.setSubscriptions", request);
	}

	/**
	Return the errors associated with the given file. If the
	errors for the given file have not yet been computed, or the
	most recently computed errors for the given file are out of
	date, then the response for this request will be delayed
	until they have been computed. If some or all of the errors
	for the file cannot be computed, then the subset of the
	errors that can be computed will be returned and the
	response will contain an error to indicate why the errors
	could not be computed. If the content of the file changes after this
	request was received but before a response could be sent, then an
	error of type CONTENT_MODIFIED will be generated.
	This request is intended to be used by clients that cannot
	asynchronously apply updated error information. Clients that
	can apply error information as it becomes available
	should use the information provided by the 'analysis.errors'
	notification.
	If a request is made for a file which does not exist, or
	which is not currently subject to analysis (e.g. because it
	is not associated with any analysis root specified to
	analysis.setAnalysisRoots), an error of type
	GET_ERRORS_INVALID_FILE will be generated.
	*/
	analysisGetErrors(request: as.AnalysisGetErrorsRequest): Thenable<as.AnalysisGetErrorsResponse> {
		return this.sendRequest("analysis.getErrors", request);
	}

	/**
	Return the hover information associate with the given
	location. If some or all of the hover information is not
	available at the time this request is processed the
	information will be omitted from the response.
	*/
	analysisGetHover(request: as.AnalysisGetHoverRequest): Thenable<as.AnalysisGetHoverResponse> {
		return this.sendRequest("analysis.getHover", request);
	}

	/**
	Return the transitive closure of reachable sources for a given file.
	If a request is made for a file which does not exist, or
	which is not currently subject to analysis (e.g. because it
	is not associated with any analysis root specified to
	analysis.setAnalysisRoots), an error of type
	GET_REACHABLE_SOURCES_INVALID_FILE will be generated.
	*/
	analysisGetReachableSources(request: as.AnalysisGetReachableSourcesRequest): Thenable<as.AnalysisGetReachableSourcesResponse> {
		return this.sendRequest("analysis.getReachableSources", request);
	}

	/**
	Return library dependency information for use in client-side indexing
	and package URI resolution.
	Clients that are only using the libraries field should consider using the
	analyzedFiles notification instead.
	*/
	analysisGetLibraryDependencies(): Thenable<as.AnalysisGetLibraryDependenciesResponse> {
		return this.sendRequest("analysis.getLibraryDependencies");
	}

	/**
	Return the navigation information associated with the given region of
	the given file. If the navigation information for the given file has
	not yet been computed, or the most recently computed navigation
	information for the given file is out of date, then the response for
	this request will be delayed until it has been computed. If the
	content of the file changes after this request was received but before
	a response could be sent, then an error of type
	CONTENT_MODIFIED will be generated.
	If a navigation region overlaps (but extends either before or after)
	the given region of the file it will be included in the result. This
	means that it is theoretically possible to get the same navigation
	region in response to multiple requests. Clients can avoid this by
	always choosing a region that starts at the beginning of a line and
	ends at the end of a (possibly different) line in the file.
	If a request is made for a file which does not exist, or
	which is not currently subject to analysis (e.g. because it
	is not associated with any analysis root specified to
	analysis.setAnalysisRoots), an error of type
	GET_NAVIGATION_INVALID_FILE will be generated.
	*/
	analysisGetNavigation(request: as.AnalysisGetNavigationRequest): Thenable<as.AnalysisGetNavigationResponse> {
		return this.sendRequest("analysis.getNavigation", request);
	}

	/**
	Force the re-analysis of everything contained in the specified
	analysis roots. This will cause all previously computed analysis
	results to be discarded and recomputed, and will cause all subscribed
	notifications to be re-sent.
	If no analysis roots are provided, then all current analysis roots
	will be re-analyzed. If an empty list of analysis roots is provided,
	then nothing will be re-analyzed. If the list contains one or more
	paths that are not currently analysis roots, then an error of type
	INVALID_ANALYSIS_ROOT will be generated.
	*/
	analysisReanalyze(request: as.AnalysisReanalyzeRequest): Thenable<a.UnknownResponse> {
		return this.sendRequest("analysis.reanalyze", request);
	}

	/**
	Sets the root paths used to determine which files to analyze. The set
	of files to be analyzed are all of the files in one of the root paths
	that are not either explicitly or implicitly excluded. A file is
	explicitly excluded if it is in one of the excluded paths. A file is
	implicitly excluded if it is in a subdirectory of one of the root
	paths where the name of the subdirectory starts with a period (that
	is, a hidden directory).
	Note that this request determines the set of requested
	analysis roots. The actual set of analysis roots at any
	given time is the intersection of this set with the set of
	files and directories actually present on the
	filesystem. When the filesystem changes, the actual set of
	analysis roots is automatically updated, but the set of
	requested analysis roots is unchanged. This means that if
	the client sets an analysis root before the root becomes
	visible to server in the filesystem, there is no error; once
	the server sees the root in the filesystem it will start
	analyzing it. Similarly, server will stop analyzing files
	that are removed from the file system but they will remain
	in the set of requested roots.
	If an included path represents a file, then server will look
	in the directory containing the file for a pubspec.yaml
	file. If none is found, then the parents of the directory
	will be searched until such a file is found or the root of
	the file system is reached. If such a file is found, it will
	be used to resolve package: URI’s within the file.
	*/
	analysisSetAnalysisRoots(request: as.AnalysisSetAnalysisRootsRequest): Thenable<a.UnknownResponse> {
		return this.sendRequest("analysis.setAnalysisRoots", request);
	}

	/**
	Subscribe for general services (that is, services that are not
	specific to individual files). All previous subscriptions are replaced
	by the given set of services.
	It is an error if any of the elements in the list are not valid
	services. If there is an error, then the current subscriptions will
	remain unchanged.
	*/
	analysisSetGeneralSubscriptions(request: as.AnalysisSetGeneralSubscriptionsRequest): Thenable<a.UnknownResponse> {
		return this.sendRequest("analysis.setGeneralSubscriptions", request);
	}

	/**
	Set the priority files to the files in the given list. A
	priority file is a file that is given priority when
	scheduling which analysis work to do first. The list
	typically contains those files that are visible to the user
	and those for which analysis results will have the biggest
	impact on the user experience. The order of the files within
	the list is significant: the first file will be given higher
	priority than the second, the second higher priority than
	the third, and so on.
	Note that this request determines the set of requested
	priority files. The actual set of priority files is the
	intersection of the requested set of priority files with the
	set of files currently subject to analysis. (See
	analysis.setSubscriptions for a description of files that
	are subject to analysis.)
	If a requested priority file is a directory it is ignored,
	but remains in the set of requested priority files so that
	if it later becomes a file it can be included in the set of
	actual priority files.
	*/
	analysisSetPriorityFiles(request: as.AnalysisSetPriorityFilesRequest): Thenable<a.UnknownResponse> {
		return this.sendRequest("analysis.setPriorityFiles", request);
	}

	/**
	Subscribe for services that are specific to individual files.
	All previous subscriptions are replaced by the current set of
	subscriptions. If a given service is not included as a key in the map
	then no files will be subscribed to the service, exactly as if the
	service had been included in the map with an explicit empty list of
	files.
	Note that this request determines the set of requested
	subscriptions. The actual set of subscriptions at any given
	time is the intersection of this set with the set of files
	currently subject to analysis. The files currently subject
	to analysis are the set of files contained within an actual
	analysis root but not excluded, plus all of the files
	transitively reachable from those files via import, export
	and part directives. (See analysis.setAnalysisRoots for an
	explanation of how the actual analysis roots are
	determined.) When the actual analysis roots change, the
	actual set of subscriptions is automatically updated, but
	the set of requested subscriptions is unchanged.
	If a requested subscription is a directory it is ignored,
	but remains in the set of requested subscriptions so that if
	it later becomes a file it can be included in the set of
	actual subscriptions.
	It is an error if any of the keys in the map are not valid
	services. If there is an error, then the existing
	subscriptions will remain unchanged.
	*/
	analysisSetSubscriptions(request: as.AnalysisSetSubscriptionsRequest): Thenable<a.UnknownResponse> {
		return this.sendRequest("analysis.setSubscriptions", request);
	}

	/**
	Update the content of one or more files. Files that were
	previously updated but not included in this update remain
	unchanged. This effectively represents an overlay of the
	filesystem. The files whose content is overridden are
	therefore seen by server as being files with the given
	content, even if the files do not exist on the filesystem or
	if the file path represents the path to a directory on the
	filesystem.
	*/
	analysisUpdateContent(request: as.AnalysisUpdateContentRequest): Thenable<as.AnalysisUpdateContentResponse> {
		return this.sendRequest("analysis.updateContent", request);
	}

	/**
	Update the options controlling analysis based on the given
	set of options. Any options that are not included in the
	analysis options will not be changed. If there are options
	in the analysis options that are not valid, they will be
	silently ignored.
	*/
	analysisUpdateOptions(request: as.AnalysisUpdateOptionsRequest): Thenable<a.UnknownResponse> {
		return this.sendRequest("analysis.updateOptions", request);
	}

	/**
	Request that completion suggestions for the given offset in
	the given file be returned.
	*/
	completionGetSuggestions(request: as.CompletionGetSuggestionsRequest): Thenable<as.CompletionGetSuggestionsResponse> {
		return this.sendRequest("completion.getSuggestions", request);
	}

	/**
	Perform a search for references to the element defined or
	referenced at the given offset in the given file.
	An identifier is returned immediately, and individual
	results will be returned via the search.results notification
	as they become available.
	*/
	searchFindElementReferences(request: as.SearchFindElementReferencesRequest): Thenable<as.SearchFindElementReferencesResponse> {
		return this.sendRequest("search.findElementReferences", request);
	}

	/**
	Perform a search for declarations of members whose name is
	equal to the given name.
	An identifier is returned immediately, and individual
	results will be returned via the search.results notification
	as they become available.
	*/
	searchFindMemberDeclarations(request: as.SearchFindMemberDeclarationsRequest): Thenable<as.SearchFindMemberDeclarationsResponse> {
		return this.sendRequest("search.findMemberDeclarations", request);
	}

	/**
	Perform a search for references to members whose name is
	equal to the given name. This search does not check to see
	that there is a member defined with the given name, so it is
	able to find references to undefined members as well.
	An identifier is returned immediately, and individual
	results will be returned via the search.results notification
	as they become available.
	*/
	searchFindMemberReferences(request: as.SearchFindMemberReferencesRequest): Thenable<as.SearchFindMemberReferencesResponse> {
		return this.sendRequest("search.findMemberReferences", request);
	}

	/**
	Perform a search for declarations of top-level elements
	(classes, typedefs, getters, setters, functions and fields)
	whose name matches the given pattern.
	An identifier is returned immediately, and individual
	results will be returned via the search.results notification
	as they become available.
	*/
	searchFindTopLevelDeclarations(request: as.SearchFindTopLevelDeclarationsRequest): Thenable<as.SearchFindTopLevelDeclarationsResponse> {
		return this.sendRequest("search.findTopLevelDeclarations", request);
	}

	/**
	Return the type hierarchy of the class declared or
	referenced at the given location.
	*/
	searchGetTypeHierarchy(request: as.SearchGetTypeHierarchyRequest): Thenable<as.SearchGetTypeHierarchyResponse> {
		return this.sendRequest("search.getTypeHierarchy", request);
	}

	/**
	Format the contents of a single file. The currently selected region of
	text is passed in so that the selection can be preserved across the
	formatting operation. The updated selection will be as close to
	matching the original as possible, but whitespace at the beginning or
	end of the selected region will be ignored. If preserving selection
	information is not required, zero (0) can be specified for both the
	selection offset and selection length.
	If a request is made for a file which does not exist, or which is not
	currently subject to analysis (e.g. because it is not associated with
	any analysis root specified to analysis.setAnalysisRoots), an error of
	type FORMAT_INVALID_FILE will be generated. If the source
	contains syntax errors, an error of type FORMAT_WITH_ERRORS
	will be generated.
	*/
	editFormat(request: as.EditFormatRequest): Thenable<as.EditFormatResponse> {
		return this.sendRequest("edit.format", request);
	}

	/**
	Return the set of assists that are available at the given
	location. An assist is distinguished from a refactoring
	primarily by the fact that it affects a single file and does
	not require user input in order to be performed.
	*/
	editGetAssists(request: as.EditGetAssistsRequest): Thenable<as.EditGetAssistsResponse> {
		return this.sendRequest("edit.getAssists", request);
	}

	/**
	Get a list of the kinds of refactorings that are valid for
	the given selection in the given file.
	*/
	editGetAvailableRefactorings(request: as.EditGetAvailableRefactoringsRequest): Thenable<as.EditGetAvailableRefactoringsResponse> {
		return this.sendRequest("edit.getAvailableRefactorings", request);
	}

	/**
	Return the set of fixes that are available for the errors at
	a given offset in a given file.
	*/
	editGetFixes(request: as.EditGetFixesRequest): Thenable<as.EditGetFixesResponse> {
		return this.sendRequest("edit.getFixes", request);
	}

	/**
	Get the changes required to perform a refactoring.
	If another refactoring request is received during the processing
	of this one, an error of type REFACTORING_REQUEST_CANCELLED
	will be generated.
	*/
	editGetRefactoring(request: as.EditGetRefactoringRequest): Thenable<as.EditGetRefactoringResponse> {
		return this.sendRequest("edit.getRefactoring", request);
	}

	/**
	Sort all of the directives, unit and class members
	of the given Dart file.
	If a request is made for a file that does not exist, does not belong
	to an analysis root or is not a Dart file,
	SORT_MEMBERS_INVALID_FILE will be generated.
	If the Dart file has scan or parse errors,
	SORT_MEMBERS_PARSE_ERRORS will be generated.
	*/
	editSortMembers(request: as.EditSortMembersRequest): Thenable<as.EditSortMembersResponse> {
		return this.sendRequest("edit.sortMembers", request);
	}

	/**
	Organizes all of the directives - removes unused imports and sorts
	directives of the given Dart file according to the
	Dart Style Guide.
	If a request is made for a file that does not exist, does not belong
	to an analysis root or is not a Dart file,
	FILE_NOT_ANALYZED will be generated.
	If directives of the Dart file cannot be organized, for example
	because it has scan or parse errors, or by other reasons,
	ORGANIZE_DIRECTIVES_ERROR will be generated. The message
	will provide details about the reason.
	*/
	editOrganizeDirectives(request: as.EditOrganizeDirectivesRequest): Thenable<as.EditOrganizeDirectivesResponse> {
		return this.sendRequest("edit.organizeDirectives", request);
	}

	/**
	Create an execution context for the executable file with the given
	path. The context that is created will persist until
	execution.deleteContext is used to delete it. Clients, therefore, are
	responsible for managing the lifetime of execution contexts.
	*/
	executionCreateContext(request: as.ExecutionCreateContextRequest): Thenable<as.ExecutionCreateContextResponse> {
		return this.sendRequest("execution.createContext", request);
	}

	/**
	Delete the execution context with the given identifier. The context id
	is no longer valid after this command. The server is allowed to re-use
	ids when they are no longer valid.
	*/
	executionDeleteContext(request: as.ExecutionDeleteContextRequest): Thenable<a.UnknownResponse> {
		return this.sendRequest("execution.deleteContext", request);
	}

	/**
	Map a URI from the execution context to the file that it corresponds
	to, or map a file to the URI that it corresponds to in the execution
	context.
	Exactly one of the file and uri fields must be provided. If both
	fields are provided, then an error of type INVALID_PARAMETER
	will be generated. Similarly, if neither field is provided, then an
	error of type INVALID_PARAMETER will be generated.
	If the file field is provided and the value is not the path of a file
	(either the file does not exist or the path references something other
	than a file), then an error of type INVALID_PARAMETER will
	be generated.
	If the uri field is provided and the value is not a valid URI or if
	the URI references something that is not a file (either a file that
	does not exist or something other than a file), then an error of type
	INVALID_PARAMETER will be generated.
	If the contextRoot used to create the execution context does not
	exist, then an error of type INVALID_EXECUTION_CONTEXT will
	be generated.
	*/
	executionMapUri(request: as.ExecutionMapUriRequest): Thenable<as.ExecutionMapUriResponse> {
		return this.sendRequest("execution.mapUri", request);
	}

	/**
	Subscribe for services. All previous subscriptions are replaced by the
	given set of services.
	It is an error if any of the elements in the list are not valid
	services. If there is an error, then the current subscriptions will
	remain unchanged.
	*/
	executionSetSubscriptions(request: as.ExecutionSetSubscriptionsRequest): Thenable<a.UnknownResponse> {
		return this.sendRequest("execution.setSubscriptions", request);
	}

	/**
	Return server diagnostics.
	*/
	diagnosticGetDiagnostics(): Thenable<as.DiagnosticGetDiagnosticsResponse> {
		return this.sendRequest("diagnostic.getDiagnostics");
	}
}
