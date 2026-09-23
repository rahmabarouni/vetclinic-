import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vetclinic_app/providers/auth_provider.dart';
import 'package:vetclinic_app/screens/email_verification_screen.dart';
import 'package:vetclinic_app/services/api_service.dart';

class _FakeApiService extends ApiService {
  _FakeApiService() : super(baseUrl: 'http://localhost');

  int verifyCalls = 0;
  int resendCalls = 0;
  bool serverFailures = false;

  @override
  Future<Map<String, dynamic>> verifyEmail({
    required String email,
    required String code,
  }) async {
    verifyCalls++;
    if (serverFailures) {
      throw Exception('400 Request failed with status code 400');
    }
    return {'message': 'Email vérifié avec succès.'};
  }

  @override
  Future<Map<String, dynamic>> resendVerification({required String email}) async {
    resendCalls++;
    return {'message': 'Code de vérification envoyé.'};
  }
}

void main() {
  testWidgets('Email verification screen requires 6-char code', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiServiceProvider.overrideWithValue(_FakeApiService())],
        child: MaterialApp(home: EmailVerificationScreen(email: 'test@example.com')),
      ),
    );

    await tester.enterText(find.byType(TextField), 'ABC');
    await tester.tap(find.text('Vérifier'));
    await tester.pump();

    expect(find.text('Saisissez le code à 6 caractères'), findsOneWidget);
  });

  testWidgets('Email verification calls verifyEmail and pops on success', (tester) async {
    final fake = _FakeApiService();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiServiceProvider.overrideWithValue(fake)],
        child: MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const EmailVerificationScreen(email: 'test@example.com'),
                    ),
                  ),
                  child: const Text('go'),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'ABCDEF');
    await tester.tap(find.text('Vérifier'));
    await tester.pumpAndSettle();

    expect(fake.verifyCalls, 1);
    expect(find.byType(EmailVerificationScreen), findsNothing);
    expect(find.text('go'), findsOneWidget);
  });

  testWidgets('Email verification shows error message on failure', (tester) async {
    final fake = _FakeApiService()..serverFailures = true;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiServiceProvider.overrideWithValue(fake)],
        child: MaterialApp(home: EmailVerificationScreen(email: 'test@example.com')),
      ),
    );

    await tester.enterText(find.byType(TextField), 'ABCDEF');
    await tester.tap(find.text('Vérifier'));
    await tester.pumpAndSettle();

    expect(fake.verifyCalls, 1);
    expect(find.text('Code invalide ou email déjà vérifié'), findsOneWidget);
  });
}