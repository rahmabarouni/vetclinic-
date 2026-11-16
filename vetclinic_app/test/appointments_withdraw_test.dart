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
  _FakeApiService() : super(baseUrl: 'http://localhost');

  bool withdrawCalled = false;
  String? withdrawnId;

  @override
  Future<String?> get token async => 'fake-jwt';

  @override
  Future<void> setToken(String token) async {}

  @override
  Future<void> clearToken() async {}

  @override
  Future<void> cancelChangeRequest(String id) async {
    withdrawCalled = true;
    withdrawnId = id;
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
  _FakeAuthNotifier(super.api, String userId) {
    state = AuthState(
      status: AuthStatus.authenticated,
      user: User(
        id: userId,
        email: 'jean.dupont@email.test',
        firstName: 'Jean',
        lastName: 'Dupont',
        role: 'CLIENT',
      ),
    );
  }
}

Appointment appointmentWithPendingRequest({required String clientId}) {
  final start = DateTime.now().add(const Duration(days: 3)).toUtc();
  return Appointment(
    id: 'appt-1',
    petId: 'pet-1',
    clientId: clientId,
    veterinarianId: 'vet-1',
    appointmentType: 'CONSULTATION',
    status: 'CONFIRMED',
    scheduledStart: start.toIso8601String(),
    scheduledEnd: start.add(const Duration(hours: 1)).toIso8601String(),
    reason: 'Contrôle annuel',
    createdAt: start.toIso8601String(),
    updatedAt: start.toIso8601String(),
    pendingChangeRequest: ChangeRequest(
      id: 'cr-1',
      appointmentId: 'appt-1',
      proposedStart: start.add(const Duration(days: 2)).toIso8601String(),
      proposedEnd: start.add(const Duration(days: 2, hours: 1)).toIso8601String(),
      status: 'PENDING',
      createdAt: start.toIso8601String(),
    ),
  );
}

Widget buildScreen({
  required _FakeApiService api,
  required String userId,
  required String appointmentClientId,
}) {
  return ProviderScope(
    overrides: [
      apiServiceProvider.overrideWithValue(api),
      authProvider.overrideWith((ref) => _FakeAuthNotifier(api, userId)),
      appointmentsProvider.overrideWith(
        (ref) => _StubAppointmentsNotifier(
          api,
          AppointmentsState(
            status: AppointmentsStatus.loaded,
            appointments: [
              appointmentWithPendingRequest(clientId: appointmentClientId),
            ],
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

void main() {
  testWidgets('le client peut annuler sa demande de modification', (tester) async {
    final api = _FakeApiService();

    await tester.pumpWidget(
      buildScreen(api: api, userId: 'client-1', appointmentClientId: 'client-1'),
    );
    await tester.pumpAndSettle();

    expect(find.text('Annuler ma demande'), findsOneWidget);

    await tester.tap(find.text('Annuler ma demande'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Voulez-vous annuler votre demande de modification'),
        findsOneWidget);

    await tester.tap(find.text('Oui'));
    await tester.pumpAndSettle();

    expect(api.withdrawCalled, isTrue);
    expect(api.withdrawnId, 'cr-1');
    expect(find.text('Demande de modification annulée'), findsOneWidget);
  });

  testWidgets('le bouton est masqué sur le RDV d\'un autre client', (tester) async {
    final api = _FakeApiService();

    await tester.pumpWidget(
      buildScreen(api: api, userId: 'client-1', appointmentClientId: 'client-2'),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('Modification en attente'), findsOneWidget);
    expect(find.text('Annuler ma demande'), findsNothing);
  });
}
