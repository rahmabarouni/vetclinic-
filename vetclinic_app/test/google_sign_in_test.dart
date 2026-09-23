import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vetclinic_app/providers/auth_provider.dart';
import 'package:vetclinic_app/screens/login_screen.dart';
import 'package:vetclinic_app/services/api_service.dart';

class _FakeApiService extends ApiService {
  _FakeApiService({this.failWith403 = false}) : super(baseUrl: 'http://localhost');

  final bool failWith403;
  String? receivedIdToken;

  @override
  Future<String?> get token async => null;

  @override
  Future<void> setToken(String token) async {}

  @override
  Future<void> clearToken() async {}

  @override
  Future<Map<String, dynamic>> loginWithGoogle({required String idToken}) async {
    receivedIdToken = idToken;
    if (failWith403) {
      throw Exception('403 Request failed with status code 403');
    }
    return {
      'user': {
        'id': 'google-user-1',
        'email': 'user@google.com',
        'firstName': 'Jean',
        'lastName': 'Google',
        'role': 'CLIENT',
      },
      'token': 'google-jwt-token',
      'authProvider': 'GOOGLE',
    };
  }
}

void main() {
  test('loginWithGoogle authenticates and stores user', () async {
    final fake = _FakeApiService();
    final container = ProviderContainer(
      overrides: [apiServiceProvider.overrideWithValue(fake)],
    );
    addTearDown(container.dispose);

    await container.read(authProvider.notifier).loginWithGoogle(idToken: 'abc');

    final state = container.read(authProvider);
    expect(fake.receivedIdToken, 'abc');
    expect(state.status, AuthStatus.authenticated);
    expect(state.user?.email, 'user@google.com');
  });

  test('loginWithGoogle maps 403 to existing-LOCAL-account error', () async {
    final fake = _FakeApiService(failWith403: true);
    final container = ProviderContainer(
      overrides: [apiServiceProvider.overrideWithValue(fake)],
    );
    addTearDown(container.dispose);

    await container.read(authProvider.notifier).loginWithGoogle(idToken: 'abc');

    final state = container.read(authProvider);
    expect(state.status, AuthStatus.error);
    expect(state.error, 'Cet email est déjà utilisé avec un compte classique');
  });

  testWidgets('Login screen shows the Google sign-in button', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiServiceProvider.overrideWithValue(_FakeApiService())],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Continuer avec Google'), findsOneWidget);
    expect(find.byIcon(Icons.g_mobiledata), findsOneWidget);
  });
}