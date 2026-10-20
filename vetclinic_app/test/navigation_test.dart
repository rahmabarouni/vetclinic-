import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vetclinic_app/models/user.dart';
import 'package:vetclinic_app/providers/auth_provider.dart';
import 'package:vetclinic_app/screens/appointments_list_screen.dart';
import 'package:vetclinic_app/screens/conversations_list_screen.dart';
import 'package:vetclinic_app/screens/home_screen.dart';
import 'package:vetclinic_app/screens/main_scaffold.dart';
import 'package:vetclinic_app/screens/pets_list_screen.dart';
import 'package:vetclinic_app/screens/profile_screen.dart';
import 'package:vetclinic_app/services/api_service.dart';
import 'package:vetclinic_app/theme/app_theme.dart';

class _FakeApiService extends ApiService {
  _FakeApiService() : super(baseUrl: 'http://localhost');

  @override
  Future<String?> get token async => 'fake-jwt-token';

  @override
  Future<void> setToken(String token) async {}

  @override
  Future<void> clearToken() async {}

  @override
  Future<Map<String, dynamic>> getPets({int page = 1, int limit = 20, String? search}) async {
    return {'data': <dynamic>[], 'pagination': {'page': 1, 'limit': 20, 'total': 0, 'totalPages': 0}};
  }

  @override
  Future<Map<String, dynamic>> getAppointments({int page = 1, int limit = 20, String? search}) async {
    return {'data': <dynamic>[], 'pagination': {'page': 1, 'limit': 20, 'total': 0, 'totalPages': 0}};
  }

  @override
  Future<Map<String, dynamic>> getConversations({int page = 1, int limit = 20}) async {
    return {'data': <dynamic>[], 'pagination': {'page': 1, 'limit': 20, 'total': 0, 'totalPages': 0}};
  }

  @override
  Future<Map<String, dynamic>> getVeterinarians({bool availableOnly = false}) async {
    return {'data': <dynamic>[], 'pagination': {'page': 1, 'limit': 20, 'total': 0, 'totalPages': 0}};
  }

  @override
  Future<Map<String, dynamic>> getNotifications({int page = 1, int limit = 20}) async {
    return {'data': <dynamic>[], 'pagination': {'page': 1, 'limit': 20, 'total': 0, 'totalPages': 0}};
  }

  @override
  Future<int> getUnreadNotificationCount() async => 0;
}

class _FakeAuthNotifier extends AuthNotifier {
  _FakeAuthNotifier(super.api) {
    state = AuthState(
      status: AuthStatus.authenticated,
      user: User(
        id: 'u1',
        email: 'jean@test.com',
        firstName: 'Jean',
        lastName: 'Dupont',
        role: 'CLIENT',
      ),
    );
  }
}

void main() {
  Future<void> pumpApp(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiServiceProvider.overrideWithValue(_FakeApiService()),
          authProvider.overrideWith((ref) => _FakeAuthNotifier(ref.read(apiServiceProvider))),
        ],
        child: MaterialApp(theme: AppTheme.light, home: const MainScaffold()),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('Main scaffold starts on Home tab', (tester) async {
    await pumpApp(tester);

    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.text('Bonjour, Jean !'), findsOneWidget);
    expect(find.byType(PetsListScreen), findsNothing);
  });

  testWidgets('Bottom navigation switches between the 5 tabs', (tester) async {
    await pumpApp(tester);

    const cases = [
      ('Animaux', PetsListScreen, 'Mes animaux'),
      ('RDV', AppointmentsListScreen, 'Mes rendez-vous'),
      ('Messages', ConversationsListScreen, 'Messages'),
      ('Profil', ProfileScreen, 'Profil'),
    ];

    for (final (label, screenType, title) in cases) {
      await tester.tap(find.text(label));
      await tester.pumpAndSettle();

      expect(find.byType(screenType), findsOneWidget, reason: 'Tab $label should show $screenType');
      if (label != 'Messages' && label != 'Profil') {
        expect(find.text(title), findsOneWidget);
      }
    }

    await tester.tap(find.text('Accueil'));
    await tester.pumpAndSettle();
    expect(find.byType(HomeScreen), findsOneWidget);
  });
}