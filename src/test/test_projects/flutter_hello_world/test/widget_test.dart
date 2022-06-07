import 'package:flutter_test/flutter_test.dart';

import '../lib/main.dart' as hello_world;

// This comment is extracted by the test and compared to a text representation
// built from the tree provider in the test. It must be maintained to match
// the results from the tests below.
// == EXPECTED RESULTS ==
// test/widget_test.dart [2/3 passed] Passed
//     Hello world test Passed
//     multi line Passed
//     Skipped test Skipped
// == /EXPECTED RESULTS ==

void main() {
  testWidgets('Hello world test', (WidgetTester tester) async {
    hello_world.main(); // BREAKPOINT1
    await tester.pump();
    expect(find.text('Hello, world!'), findsOneWidget);
  });
  testWidgets('''multi
line''', (WidgetTester tester) async {
    expect(1, 1);
  });
  testWidgets('Skipped test', (WidgetTester tester) async {
    hello_world.main();
    await tester.pump();
    expect(find.text('Hello, world!'), findsOneWidget);
  }, skip: true);
}
