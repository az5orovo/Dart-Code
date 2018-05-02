[![Gitter Chat](https://img.shields.io/badge/chat-online-blue.svg)](https://gitter.im/dart-code/Dart-Code) [![Follow on Twitter](https://img.shields.io/badge/twitter-dartcode-blue.svg)](https://twitter.com/DartCode) [![Contribute to Dart Code](https://img.shields.io/badge/help-contribute-551A8B.svg)](https://github.com/Dart-Code/Dart-Code/blob/master/CONTRIBUTING.md) [![Linux & Mac build status](https://img.shields.io/travis/Dart-Code/Dart-Code/master.svg?label=mac+%26+linux)](https://travis-ci.org/Dart-Code/Dart-Code) [![Windows build status](https://img.shields.io/appveyor/ci/DanTup/Dart-Code/master.svg?label=windows&logoWidth=-1)](https://ci.appveyor.com/project/DanTup/dart-code)

## Introduction

Dart Code extends [VS Code](https://code.visualstudio.com/) with support for the
[Dart](https://www.dartlang.org/) programming language, and provides tools for
effectively editing, refactoring, running, and reloading [Flutter](https://flutter.io/)
mobile apps, and [AngularDart](https://angulardart.org) web apps.

## Installation

Dart Code can be [installed from the Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Dart-Code.dart-code) or by [searching within VS Code](https://code.visualstudio.com/docs/editor/extension-gallery#_search-for-an-extension).


## Features

- Edit and Debug Flutter mobile apps
- Edit and Debug Dart command line apps
- [Automatic hot reloads for Flutter](https://dartcode.org/docs/settings/#dartflutterhotreloadonsave)
- [Refactorings and Code fixes (lightbulb)](https://dartcode.org/docs/refactorings-and-code-fixes/)
- [Quickly switch between devices for Flutter](https://dartcode.org/docs/quickly-switching-between-flutter-devices/)
- [Flutter Doctor command](https://dartcode.org/docs/commands/#flutter-run-flutter-doctor)
- [Flutter Get Packages command](https://dartcode.org/docs/commands/#flutter-get-packages)
- [Flutter Upgrade Packages command](https://dartcode.org/docs/commands/#flutter-upgrade-packages)
- [Automatically gets packages when `pubspec.yaml` is saved](https://dartcode.org/docs/settings/#dartrunpubgetonpubspecchanges)
- Prompts for full restarts when a hot reload does not re-execute all code
- [Automatically finds SDKs from `PATH`](https://dartcode.org/docs/configuring-path-and-environment-variables/)
- [Notification of new stable Dart SDK releases](https://dartcode.org/docs/settings/#dartcheckforsdkupdates)
- [Sort Members command](https://dartcode.org/docs/commands/#dart-sort-members)
- Support for debugging "just my code" or SDK/libraries too ([`dart.debugSdkLibraries`](https://dartcode.org/docs/settings/#dartdebugsdklibraries) and [`dart.debugExternalLibraries`](https://dartcode.org/docs/settings/#dartdebugexternallibraries))
- [Prompts to get packages when out of date](https://dartcode.org/docs/settings/#dartprompttogetpackages)
- Syntax highlighting
- Code completion
- Snippets
- Realtime errors/warnings/TODOs
- Documentation in hovers/tooltips
- Go to Definition
- Find References
- Rename refactoring
- Format document
- Support for format-on-save (`editor.formatOnSave`)
- Support for format-on-type (`editor.formatOnType`)
- Workspace symbol search
- Document symbol search
- [Organize Imports command](https://dartcode.org/docs/commands/#dart-organize-imports)
- [Automatically Organize Imports on save](https://dartcode.org/docs/settings/#dartorganizeimportsonsave)
- [Pub Get Packages command](https://dartcode.org/docs/commands/#pub-get-packages)
- [Pub Upgrade Packages command](https://dartcode.org/docs/commands/#pub-upgrade-packages)
- [Type Hierarchy](https://dartcode.org/docs/commands/#dart-show-type-hierarchy)


## Extension Settings

A full list of settings is [available here](https://dartcode.org/docs/settings/).


## Frequently Asked Questions

A list of frequently asked questions is [available here](https://dartcode.org/faq/).


## Key Bindings

A list of useful key bindings is [available here](https://dartcode.org/docs/key-bindings/).


## Refactorings and Code Fixes

A full list of supported refactors is [available here](https://dartcode.org/docs/refactorings-and-code-fixes/).


## Analytics

This extension reports some analytics such as:

- Extension load and analysis times
- Whether you have disabled some settings (such as showing TODOs in Problems Window or Closing Labels)
- Frequency of use of features like Hot Reload, Full Restart and Open Observatory
- Crashes in the Dart analysis server
- Platform and Dart/Flutter SDK versions

Reporting can be disabled via the [`dart.allowAnalytics` setting](https://dartcode.org/docs/settings/#dartallowanalytics).


## Release Notes

For full release notes, see [the changelog](https://dartcode.org/releases/).
