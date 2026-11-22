import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vetclinic_app/providers/auth_provider.dart';
import 'package:vetclinic_app/screens/forgot_password_screen.dart';
import 'package:vetclinic_app/screens/reset_password_screen.dart';
import 'package:vetclinic_app/services/api_service.dart';

class _FakeApiService extends ApiService {
  _FakeApiService() : super(baseUrl: 'http://localhost');

  int forgotCalls = 0;
  int resetCalls = 0;
  int tokenWrites = 0;
  int tokenDeletes = 0;
  String? lastCode;
  String? lastPassword;
  bool serverFailure = false;
  int failureStatus = 400;

  @override
  Future<String?> get token => Future.value(null);

  @override
  Future<String> forgotPassword({required String email}) async {
    forgotCalls++;
    if (serverFailure) {
      throw Exception('$failureStatus Request failed with status code $failureStatus');
    }
    return genericForgotMessage;
  }

  @override
  Future<String> resetPassword({
    required String email,
    required String code,
    required String newPassword,
  }) async {
    resetCalls++;
    lastCode = code;
    lastPassword = newPassword;
    if (serverFailure) {
      throw Exception('$failureStatus Request failed with status code $failureStatus');
    }
    return 'Mot de passe réinitialisé avec succès.';
  }

  @override
  Future<void> setToken(String token) async {
    tokenWrites++;
  }

  @override
  Future<void> clearToken() async {
    tokenDeletes++;
  }
}

Widget _direct(_FakeApiService fake, Widget home) {
  return ProviderScope(
    overrides: [apiServiceProvider.overrideWithValue(fake)],
    child: MaterialApp(home: home),
  );
}

Widget _pushed(_FakeApiService fake, Widget target) {
  return ProviderScope(
    overrides: [apiServiceProvider.overrideWithValue(fake)],
    child: MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => target),
              ),
              child: const Text('go'),
            ),
          ),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('Forgot screen rejects an invalid email without any API call',
      (tester) async {
    final fake = _FakeApiService();
    await tester.pumpWidget(
      _direct(fake, const ForgotPasswordScreen()),
    );

    await tester.enterText(find.byKey(const Key('forgot-email')), 'invalid');
    await tester.tap(find.text('Envoyer le code'));
    await tester.pump();

    expect(find.text('Email invalide'), findsOneWidget);
    expect(fake.forgotCalls, 0);
  });

  testWidgets('Forgot screen shows the generic message and opens the code screen',
      (tester) async {
    final fake = _FakeApiService();
    await tester.pumpWidget(
      _pushed(fake, const ForgotPasswordScreen()),
    );
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();

    await tester.enterText(
        find.byKey(const Key('forgot-email')), 'client@example.com');
    await tester.tap(find.text('Envoyer le code'));
    await tester.pumpAndSettle();

    expect(fake.forgotCalls, 1);
    expect(find.text(genericForgotMessage), findsOneWidget);
    expect(find.byType(ResetPasswordScreen), findsOneWidget);
  });

  testWidgets('Forgot screen maps a 429 to the rate-limit message', (tester) async {
    final fake = _FakeApiService()
      ..serverFailure = true
      ..failureStatus = 429;
    await tester.pumpWidget(
      _direct(fake, const ForgotPasswordScreen()),
    );

    await tester.enterText(
        find.byKey(const Key('forgot-email')), 'client@example.com');
    await tester.tap(find.text('Envoyer le code'));
    await tester.pumpAndSettle();

    expect(fake.forgotCalls, 1);
    expect(
        find.text('Trop de demandes, patientez un instant'), findsOneWidget);
  });

  testWidgets('Reset screen rejects a code shorter than 6 digits', (tester) async {
    final fake = _FakeApiService();
    await tester.pumpWidget(
      _direct(fake, const ResetPasswordScreen(email: 'client@example.com')),
    );

    await tester.enterText(find.byKey(const Key('reset-code')), '123');
    await tester.enterText(find.byKey(const Key('reset-password')), 'password1');
    await tester.enterText(find.byKey(const Key('reset-confirm')), 'password1');
    await tester.tap(find.text('Réinitialiser le mot de passe'));
    await tester.pump();

    expect(find.text('Saisissez le code à 6 chiffres'), findsOneWidget);
    expect(fake.resetCalls, 0);
  });

  testWidgets('Reset screen rejects a password shorter than 8 characters',
      (tester) async {
    final fake = _FakeApiService();
    await tester.pumpWidget(
      _direct(fake, const ResetPasswordScreen(email: 'client@example.com')),
    );

    await tester.enterText(find.byKey(const Key('reset-code')), '123456');
    await tester.enterText(find.byKey(const Key('reset-password')), 'short');
    await tester.enterText(find.byKey(const Key('reset-confirm')), 'short');
    await tester.tap(find.text('Réinitialiser le mot de passe'));
    await tester.pump();

    expect(find.text('Minimum 8 caractères'), findsOneWidget);
    expect(fake.resetCalls, 0);
  });

  testWidgets('Reset screen rejects mismatched passwords', (tester) async {
    final fake = _FakeApiService();
    await tester.pumpWidget(
      _direct(fake, const ResetPasswordScreen(email: 'client@example.com')),
    );

    await tester.enterText(find.byKey(const Key('reset-code')), '123456');
    await tester.enterText(find.byKey(const Key('reset-password')), 'password1');
    await tester.enterText(find.byKey(const Key('reset-confirm')), 'password2');
    await tester.tap(find.text('Réinitialiser le mot de passe'));
    await tester.pump();

    expect(find.text('Les mots de passe ne correspondent pas'), findsOneWidget);
    expect(fake.resetCalls, 0);
  });

  testWidgets('Reset screen shows one uniform message on 400', (tester) async {
    final fake = _FakeApiService()..serverFailure = true;
    await tester.pumpWidget(
      _direct(fake, const ResetPasswordScreen(email: 'client@example.com')),
    );

    await tester.enterText(find.byKey(const Key('reset-code')), '123456');
    await tester.enterText(find.byKey(const Key('reset-password')), 'password1');
    await tester.enterText(find.byKey(const Key('reset-confirm')), 'password1');
    await tester.tap(find.text('Réinitialiser le mot de passe'));
    await tester.pumpAndSettle();

    expect(fake.resetCalls, 1);
    expect(find.text('Code invalide ou expiré.'), findsOneWidget);
  });

  testWidgets('Reset screen returns to login and never touches the token',
      (tester) async {
    final fake = _FakeApiService();
    await tester.pumpWidget(
      _pushed(
          fake, const ResetPasswordScreen(email: 'client@example.com')),
    );
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('reset-code')), '123456');
    await tester.enterText(find.byKey(const Key('reset-password')), 'password1');
    await tester.enterText(find.byKey(const Key('reset-confirm')), 'password1');
    await tester.tap(find.text('Réinitialiser le mot de passe'));
    await tester.pumpAndSettle();

    expect(fake.resetCalls, 1);
    expect(fake.lastCode, '123456');
    expect(fake.lastPassword, 'password1');
    expect(find.byType(ResetPasswordScreen), findsNothing);
    expect(find.text('go'), findsOneWidget);
    expect(fake.tokenWrites, 0);
    expect(fake.tokenDeletes, 0);
  });

  testWidgets('Reset screen can resend a code with the same generic message',
      (tester) async {
    final fake = _FakeApiService();
    await tester.pumpWidget(
      _direct(fake, const ResetPasswordScreen(email: 'client@example.com')),
    );

    await tester.tap(find.text('Renvoyer le code'));
    await tester.pumpAndSettle();

    expect(fake.forgotCalls, 1);
    expect(find.text(genericForgotMessage), findsOneWidget);
  });
}
