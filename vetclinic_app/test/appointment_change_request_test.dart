import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vetclinic_app/models/appointment.dart';
import 'package:vetclinic_app/providers/auth_provider.dart';
import 'package:vetclinic_app/screens/appointment_form_screen.dart';
import 'package:vetclinic_app/services/api_service.dart';
import 'package:vetclinic_app/theme/app_theme.dart';

class _FakeApiService extends ApiService {
  _FakeApiService() : super(baseUrl: 'http://localhost');

  bool changeRequestCalled = false;
  String? appointmentId;
  String? proposedType;
  DateTime? proposedStart;

  @override
  Future<Map<String, dynamic>> getPets({int page = 1, int limit = 20, String? search}) async {
    return {
      'data': [
        {
          'id': 'p1',
          'ownerId': 'u1',
          'name': 'Rex',
          'species': 'DOG',
          'sex': 'MALE',
          'weightKg': 12.5,
          'isActive': true,
          'createdAt': '',
          'updatedAt': '',
        },
      ],
      'pagination': {'page': 1, 'limit': 20, 'total': 1, 'totalPages': 1},
    };
  }

  @override
  Future<Map<String, dynamic>> getAppointments({int page = 1, int limit = 20, String? search}) async {
    return {'data': <dynamic>[], 'pagination': {'page': 1, 'limit': 20, 'total': 0, 'totalPages': 0}};
  }

  @override
  Future<Map<String, dynamic>> createChangeRequest(
    String id, {
    required DateTime proposedStart,
    required DateTime proposedEnd,
    String? proposedType,
    String? proposedReason,
  }) async {
    changeRequestCalled = true;
    appointmentId = id;
    this.proposedType = proposedType;
    this.proposedStart = proposedStart;
    return {
      'changeRequest': {
        'id': 'cr1',
        'appointmentId': id,
        'proposedStart': proposedStart.toIso8601String(),
        'proposedEnd': proposedEnd.toIso8601String(),
        'proposedType': proposedType,
        'status': 'PENDING',
        'createdAt': '',
      },
      'applied': false,
    };
  }
}

void main() {
  final existing = Appointment(
    id: 'a1',
    petId: 'p1',
    clientId: 'u1',
    veterinarianId: 'v1',
    appointmentType: 'CONSULTATION',
    status: 'CONFIRMED',
    scheduledStart: DateTime.now().add(const Duration(days: 3)).toUtc().toIso8601String(),
    scheduledEnd: DateTime.now().add(const Duration(days: 3, hours: 1)).toUtc().toIso8601String(),
    reason: 'Contrôle annuel',
    createdAt: '',
    updatedAt: '',
  );

  Future<void> pumpEdit(WidgetTester tester, _FakeApiService fake) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiServiceProvider.overrideWithValue(fake)],
        child: MaterialApp(
          theme: AppTheme.light,
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => AppointmentFormScreen(appointment: existing),
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
  }

  testWidgets('edit mode has 3 steps and no veterinarian step', (tester) async {
    await pumpEdit(tester, _FakeApiService());

    expect(find.text('Modifier le rendez-vous'), findsOneWidget);
    expect(find.text('Vétérinaire'), findsNothing);
    expect(find.text('Suivant'), findsOneWidget);
    expect(find.text('Envoyer la demande'), findsNothing);
  });

  testWidgets('edit mode submits a change request with prefilled type', (tester) async {
    final fake = _FakeApiService();
    await pumpEdit(tester, fake);

    await tester.ensureVisible(find.text('Suivant'));
    await tester.tap(find.text('Suivant'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Suivant'));
    await tester.tap(find.text('Suivant'));
    await tester.pumpAndSettle();

    expect(find.text('Envoyer la demande'), findsOneWidget);

    await tester.ensureVisible(find.text('Envoyer la demande'));
    await tester.tap(find.text('Envoyer la demande'));
    await tester.pumpAndSettle();

    expect(fake.changeRequestCalled, isTrue);
    expect(fake.appointmentId, 'a1');
    expect(fake.proposedType, 'CONSULTATION');
    expect(find.text('Demande de modification envoyée au vétérinaire'), findsOneWidget);
  });
}
