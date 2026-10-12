import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ditsha_citizen/main.dart';

void main() {
  testWidgets('shows the citizen sign-in screen', (tester) async {
    await tester.pumpWidget(const MyApp());

    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('New to Ditsha? Create an account'), findsOneWidget);
  });

  testWidgets('switches to registration mode', (tester) async {
    await tester.pumpWidget(const MyApp());
    await tester.tap(find.text('New to Ditsha? Create an account'));
    await tester.pumpAndSettle();

    expect(find.text('Create your account'), findsOneWidget);
    expect(find.text('Full name'), findsOneWidget);
    expect(find.text('Create account'), findsOneWidget);
  });

  testWidgets('shows the authenticated citizen home', (tester) async {
    final api = ApiClient();
    await tester.pumpWidget(MaterialApp(
      home: HomePage(
        api: api,
        session: const {'full_name': 'Test Citizen', 'token': 'test-token'},
        onSignOut: () {},
      ),
    ));

    expect(find.text('Hello, Test Citizen'), findsOneWidget);
    expect(find.text('New application'), findsOneWidget);
    expect(find.text('Check application status'), findsOneWidget);
  });
}