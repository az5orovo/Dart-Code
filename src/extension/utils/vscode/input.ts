import * as vs from "vscode";
import { Context } from "../../../shared/vscode/workspace";

export async function showInputBoxWithSettings(
	context: Context,
	options: {
		title: string,
		prompt: string,
		placeholder: string,
		value: string,
		validation: (s: string) => string | undefined,
	},
): Promise<UserInputOrSettings | undefined> {
	const input = vs.window.createInputBox();
	input.title = options.title;
	input.prompt = options.prompt;
	input.placeholder = options.placeholder;
	input.value = options.value;
	if (options.validation) {
		input.onDidChangeValue((s) => {
			input.validationMessage = options.validation(s);
		});
	}
	input.buttons = [
		{
			iconPath: {
				dark: vs.Uri.file(context.asAbsolutePath("media/commands/settings.svg")),
				light: vs.Uri.file(context.asAbsolutePath("media/commands/settings.svg")),
			},
			tooltip: "Settings",
		},
	];

	const name = await new Promise<UserInputOrSettings | undefined>((resolve) => {
		input.onDidTriggerButton(async (e) => {
			resolve("SETTINGS");
			input.hide();
		});

		input.onDidAccept(() => input.value ? resolve({ value: input.value }) : resolve(undefined));
		input.onDidHide(() => {
			resolve(undefined);
		});
		input.show();
	});

	input.dispose();

	return name;
}


export async function showSimpleSettingsEditor(title: string, placeholder: string, getItems: () => PickableSetting[]): Promise<void> {
	while (true) {
		const quickPick = vs.window.createQuickPick<PickableSetting>();
		quickPick.title = title;
		quickPick.placeholder = placeholder;
		quickPick.items = getItems();

		const selectedSetting = await new Promise<PickableSetting | undefined>((resolve) => {
			quickPick.onDidAccept(() => resolve(quickPick.selectedItems && quickPick.selectedItems[0]));
			quickPick.onDidHide(() => resolve(undefined));
			quickPick.show();
		});

		quickPick.dispose();

		if (selectedSetting) {
			await editSetting(selectedSetting);
		} else {
			return;
		}
	}
}

export async function editSetting(setting: PickableSetting) {
	const title = setting.label;
	const placeHolder = `Select an option for ${setting.label} (or 'Escape' to cancel)`;
	const prompt = setting.detail;
	const value = setting.currentValue;
	switch (setting.settingKind) {
		case "STRING":
			const stringResult = await vs.window.showInputBox({ prompt, title, value });
			if (stringResult !== undefined)
				await setting.setValue(stringResult);
			break;
		case "ENUM":
			const enumResult = await vs.window.showQuickPick(
				setting.enumValues!.map((v) => ({ label: v } as vs.QuickPickItem)),
				{ placeHolder, title },
			);
			if (enumResult !== undefined)
				await setting.setValue(enumResult.label);
			break;
		case "BOOL":
			const boolResult = await vs.window.showQuickPick(
				[
					{ label: "enable" } as vs.QuickPickItem,
					{ label: "disable" } as vs.QuickPickItem,
				],
				{ placeHolder, title },
			);
			if (boolResult !== undefined)
				await setting.setValue(boolResult.label === "enable");
			break;
	}
}

type UserInputOrSettings = { value: string } | "SETTINGS";
export type PickableSetting = vs.QuickPickItem & {
	settingKind: "STRING" | "ENUM" | "BOOL",
	currentValue: any,
	setValue: (newValue: any) => Promise<void>,
	enumValues?: string[],
};
