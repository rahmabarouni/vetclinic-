import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vetclinic_app/models/appointment.dart';
import 'package:vetclinic_app/models/user.dart';
import 'package:vetclinic_app/providers/appointments_provider.dart';
import 'package:vetclinic_app/providers/auth_provider.dart';
import 'package:vetclinic_app/screens/appointments_list_screen.dart';
import 'package:vetclinic_app/services/api_service.dart';
import 'package:vetclinic_app/theme/app_theme.dart';

class _FakeApiService extends ApiService {
  _FakeApiService({this.error});

  final String? error;

  bool deleteCalled = false;
  bool statusCalled = false;
  String? statusValue;

  @override
  Future<String?> get token async => 'fake-jwt';

  @override
  Future<void> setToken(String token) async {}

  @override
  Future<void> clearToken() async {}

  @override
  Future<Map<String, dynamic>> cancelAppointment(String id) async {
    if (error != null) throw Exception(error);
    deleteCalled = true;
    return {'appointment': <String, dynamic>{}};
  }

  @override
  Future<Map<String, dynamic>> updateAppointmentStatus(String id, String status) async {
    if (error != null) throw Exception(error);
    statusCalled = true;
    statusValue = status;
    return {'appointment': <String, dynamic>{}};
  }
}

class _StubAppointmentsNotifier extends AppointmentsNotifier {
  _StubAppointmentsNotifier(super.api, AppointmentsState initialState) {
    state = initialState;
  }

  @override
  Future<void> loadAppointments({int page = 1, String? search}) async {}
}

class _FakeAuthNotifier extends AuthNotifier {
  _FakeAuthNotifier(super.api, {required String userId, required String role}) {
    state = AuthState(
      status: AuthStatus.authenticated,
      user: User(
        id: userId,
        email: 'utilisateur@email.test',
        firstName: 'Jean',
        lastName: 'Dupont',
        role: role,
      ),
    );
  }
}

Appointment buildAppointment() {
  final start = DateTime.now().add(const Duration(days: 3)).toUtc();
  return Appointment(
    id: 'appt-1',
    petId: 'pet-1',
    clientId: 'client-1',
    veterinarianId: 'vet-1',
    appointmentType: 'CONSULTATION',
    status: 'CONFIRMED',
    scheduledStart: start.toIso8601String(),
    scheduledEnd: start.add(const Duration(hours: 1)).toIso8601String(),
    reason: 'Contrôle annuel',
    createdAt: start.toIso8601String(),
    updatedAt: start.toIso8601String(),
  );
}

Widget _buildScreen({required _FakeApiService api, required String role}) {
  return ProviderScope(
    overrides: [
      apiServiceProvider.overrideWithValue(api),
      authProvider.overrideWith(
        (ref) => _FakeAuthNotifier(api, userId: 'user-1', role: role),
      ),
      appointmentsProvider.overrideWith(
        (ref) => _StubAppointmentsNotifier(
          api,
          AppointmentsState(
            status: AppointmentsStatus.loaded,
            appointments: [buildAppointment()],
            total: 1,
          ),
        ),
      ),
    ],
    child: MaterialApp(
      theme: AppTheme.light,
      home: const AppointmentsListScreen(),
    ),
  );
}

Future<void> cancelAppointmentFromUi(WidgetTester tester) async {
  await tester.tap(find.byTooltip('Annuler'));
  await tester.pumpAndSettle();
  expect(find.text('Annuler le rendez-vous'), findsOneWidget);
  await tester.tap(find.text('Oui'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('le vétérinaire annule via PATCH /status, pas via DELETE', (tester) async {
    final api = _FakeApiService();

    await tester.pumpWidget(_buildScreen(api: api, role: 'VETERINARIAN'));
    await tester.pumpAndSettle();

    await cancelAppointmentFromUi(tester);

    expect(api.statusCalled, isTrue);
    expect(api.statusValue, 'CANCELLED');
    expect(api.deleteCalled, isFalse);
    expect(find.text('Rendez-vous annulé'), findsOneWidget);
    expect(find.text('Contrôle annuel'), findsOneWidget);
  });

  testWidgets('le client annule toujours via DELETE', (tester) async {
    final api = _FakeApiService();

    await tester.pumpWidget(_buildScreen(api: api, role: 'CLIENT'));
    await tester.pumpAndSettle();

    await cancelAppointmentFromUi(tester);

    expect(api.deleteCalled, isTrue);
    expect(api.statusCalled, isFalse);
    expect(find.text('Rendez-vous annulé'), findsOneWidget);
  });

  testWidgets('une erreur affiche un message et conserve la liste', (tester) async {
    final api = _FakeApiService(error: '403');

    await tester.pumpWidget(_buildScreen(api: api, role: 'VETERINARIAN'));
    await tester.pumpAndSettle();

    await cancelAppointmentFromUi(tester);

    expect(find.text('Accès refusé'), findsOneWidget);
    expect(find.text('Contrôle annuel'), findsOneWidget);
    expect(find.text('Réessayer'), findsNothing);
  });
}
