import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vetclinic_app/providers/auth_provider.dart';
import 'package:vetclinic_app/screens/email_verification_screen.dart';
import 'package:vetclinic_app/screens/register_screen.dart';
import 'package:vetclinic_app/services/api_service.dart';

class _FakeApiService extends ApiService {
  _FakeApiService() : super(baseUrl: 'http://localhost');

  int registerCalls = 0;
  bool lastPrivacyConsent = false;

  @override
  Future<String?> get token async => null;

  @override
  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
    required bool privacyConsent,
  }) async {
    registerCalls++;
    lastPrivacyConsent = privacyConsent;
    return {
      'token': 'fake-token',
      'user': {
        'id': 'u1',
        'email': email,
        'firstName': firstName,
        'lastName': lastName,
        'role': 'CLIENT',
      },
    };
  }

  @override
  Future<void> setToken(String token) async {}
}

Widget _build(_FakeApiService fake) {
  return ProviderScope(
    overrides: [apiServiceProvider.overrideWithValue(fake)],
    child: const MaterialApp(home: RegisterScreen()),
  );
}

void main() {
  Future<void> fillForm(WidgetTester tester) async {
    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'Jean');
    await tester.enterText(fields.at(1), 'Dupont');
    await tester.enterText(fields.at(2), 'jean@test.com');
    await tester.enterText(fields.at(3), 'Motdepasse1!');
    await tester.enterText(fields.at(4), 'Motdepasse1!');
  }

  Future<void> tapSubmit(WidgetTester tester) async {
    await tester.ensureVisible(find.text("S'inscrire"));
    await tester.pumpAndSettle();
    await tester.tap(find.text("S'inscrire"));
    await tester.pumpAndSettle();
  }

  testWidgets('Register blocks submission without RGPD consent', (tester) async {
    final fake = _FakeApiService();
    await tester.pumpWidget(_build(fake));

    await fillForm(tester);
    await tapSubmit(tester);

    expect(fake.registerCalls, 0);
    expect(
      find.text('Vous devez accepter le consentement RGPD pour continuer'),
      findsOneWidget,
    );
  });

  testWidgets('Register submits with RGPD consent', (tester) async {
    final fake = _FakeApiService();
    await tester.pumpWidget(_build(fake));

    await fillForm(tester);

    await tester.ensureVisible(find.text('Je consens au traitement de mes données personnelles'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Je consens au traitement de mes données personnelles'));
    await tester.pump();

    await tapSubmit(tester);

    expect(fake.registerCalls, 1);
    expect(fake.lastPrivacyConsent, true);
    expect(find.byType(EmailVerificationScreen), findsOneWidget);
  });

  testWidgets('Consent info dialog opens from register screen', (tester) async {
    final fake = _FakeApiService();
    await tester.pumpWidget(_build(fake));

    await tester.ensureVisible(find.text('Lire le consentement RGPD'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lire le consentement RGPD'));
    await tester.pumpAndSettle();

    expect(find.text('Consentement RGPD'), findsOneWidget);
  });
}