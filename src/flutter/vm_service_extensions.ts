import * as vs from "vscode";
import { SERVICE_EXTENSION_CONTEXT_PREFIX } from "../extension";
import { TRACK_WIDGET_CREATION_ENABLED } from "../providers/debug_config_provider";

export const IS_INSPECTING_WIDGET_CONTEXT = "dart-code:flutter.isInspectingWidget";

/// The service extensions we know about and allow toggling via commands.
export enum FlutterServiceExtension {
	DebugBanner = "ext.flutter.debugAllowBanner",
	DebugPaint = "ext.flutter.debugPaint",
	PaintBaselines = "ext.flutter.debugPaintBaselinesEnabled",
	InspectorSelectMode = "ext.flutter.inspector.show",
	RepaintRainbow = "ext.flutter.repaintRainbow",
	PerformanceOverlay = "ext.flutter.showPerformanceOverlay",
	SlowAnimations = "ext.flutter.timeDilation",
}

const keyTimeDilation = "timeDilation";
const keyEnabled = "enabled";

/// Service extension values must be wrapped in objects when sent to the VM, eg:
///
///     { timeDilation: x.x }
///     { enabled: true }
///
/// This map tracks the name of the key for a fivengiven extension.
const extensionStateKeys: { [key: string]: string } = {
	[FlutterServiceExtension.DebugBanner]: keyEnabled,
	[FlutterServiceExtension.DebugPaint]: keyEnabled,
	[FlutterServiceExtension.PaintBaselines]: keyEnabled,
	[FlutterServiceExtension.InspectorSelectMode]: keyEnabled,
	[FlutterServiceExtension.RepaintRainbow]: keyEnabled,
	[FlutterServiceExtension.PerformanceOverlay]: keyEnabled,
	[FlutterServiceExtension.SlowAnimations]: keyTimeDilation,
};

export const timeDilationNormal = 1.0;
export const timeDilationSlow = 5.0;

/// Default values for each service extension.
const defaultExtensionState: { [key: string]: any } = {
	[FlutterServiceExtension.DebugBanner]: true,
	[FlutterServiceExtension.DebugPaint]: false,
	[FlutterServiceExtension.PaintBaselines]: false,
	[FlutterServiceExtension.InspectorSelectMode]: false,
	[FlutterServiceExtension.RepaintRainbow]: false,
	[FlutterServiceExtension.PerformanceOverlay]: false,
	[FlutterServiceExtension.SlowAnimations]: timeDilationNormal,
};

export interface FlutterServiceExtensionArgs { type: FlutterServiceExtension; params: any; }

/// Manages state for Flutter VM service extensions.
export class FlutterVmServiceExtensions {
	private loadedServiceExtensions: FlutterServiceExtension[] = [];
	private currentExtensionState = Object.assign({}, defaultExtensionState);
	private sendValueToVM: (extension: FlutterServiceExtension) => void;

	constructor(sendRequest: (extension: FlutterServiceExtension, args: FlutterServiceExtensionArgs) => void) {
		// To avoid any code in this class accidentally calling sendRequestToFlutter directly, we wrap it here and don't
		// keep a reference to it.
		this.sendValueToVM = (extension: FlutterServiceExtension) => {
			// Only ever send values for enabled and known extensions.
			if (this.loadedServiceExtensions.indexOf(extension) !== -1 && extensionStateKeys[extension] !== undefined) {
				// Build the args in the required format using the correct key and value.
				const params = { [extensionStateKeys[extension]]: this.currentExtensionState[extension] };
				const args = { type: extension, params };

				sendRequest(extension, args);

				this.syncInspectingWidgetContext(extension);
			}
		};
	}

	/// Handles an event from the Debugger, such as extension services being loaded and values updated.
	public handleDebugEvent(e: vs.DebugSessionCustomEvent): void {
		if (e.event === "dart.serviceExtensionAdded") {
			this.handleServiceExtensionLoaded(e.body.id);

			// If the isWidgetCreationTracked extension loads, send a command to the debug adapter
			// asking it to query whether it's enabled (it'll send us an event back with the answer).
			if (e.body.id === "ext.flutter.inspector.isWidgetCreationTracked") {
				e.session.customRequest("checkIsWidgetCreationTracked");
			}

		} else if (e.event === "dart.flutter.firstFrame") {
			// Send all values back to the VM on the first frame so that they persist across restarts.
			for (const extension in FlutterServiceExtension)
				this.sendValueToVM(extension as FlutterServiceExtension);
		} else if (e.event === "dart.flutter.updateIsWidgetCreationTracked") {
			vs.commands.executeCommand("setContext", TRACK_WIDGET_CREATION_ENABLED, e.body.isWidgetCreationTracked);
		} else if (e.event === "dart.flutter.serviceExtensionStateChanged") {
			this.handleRemoteValueUpdate(e.body.extension, e.body.value);
		}
	}

	/// Toggles between two values. Always picks the value1 if the current value
	// is not already value1 (eg. if it's neither of those, it'll pick val1).
	public toggle(id: FlutterServiceExtension, val1: any = true, val2: any = false) {
		this.currentExtensionState[id] = this.currentExtensionState[id] !== val1 ? val1 : val2;
		this.sendValueToVM(id);
	}

	/// Keep the context in sync so that the "Cancel Inspect Widget" command is enabled/disabled.
	private syncInspectingWidgetContext(id: string) {
		vs.commands.executeCommand("setContext", IS_INSPECTING_WIDGET_CONTEXT, this.currentExtensionState[FlutterServiceExtension.InspectorSelectMode]);
	}

	/// Handles updates that come from the VM (eg. were updated by another tool).
	private handleRemoteValueUpdate(id: string, value: any) {
		// Don't try to process service extension we don't know about.
		if (this.currentExtensionState[id] === undefined) {
			return;
		}

		// HACK: This is because the values we get are currently all strings.
		if (typeof value === "string") {
			value = JSON.parse(value);
		}

		this.currentExtensionState[id] = value;
		this.syncInspectingWidgetContext(id);
	}

	/// Resets all local state to defaults - used when terminating the last debug session (or
	// starting the first) to ensure debug toggles don't "persist" across sessions.
	public resetToDefaults() {
		this.currentExtensionState = Object.assign({}, defaultExtensionState);
	}

	/// Tracks loaded service extensions and updates contexts to enable VS Code commands.
	private handleServiceExtensionLoaded(id: FlutterServiceExtension) {
		this.loadedServiceExtensions.push(id);
		vs.commands.executeCommand("setContext", `${SERVICE_EXTENSION_CONTEXT_PREFIX}${id}`, true);
	}

	/// Marks all service extensions as not-loaded in the context to disable VS Code Commands.
	public markAllServiceExtensionsUnloaded() {
		for (const id of this.loadedServiceExtensions) {
			vs.commands.executeCommand("setContext", `${SERVICE_EXTENSION_CONTEXT_PREFIX}${id}`, undefined);
		}
		this.loadedServiceExtensions.length = 0;
		vs.commands.executeCommand("setContext", TRACK_WIDGET_CREATION_ENABLED, false);
	}
}
