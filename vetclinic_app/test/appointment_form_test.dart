import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vetclinic_app/providers/auth_provider.dart';
import 'package:vetclinic_app/screens/appointment_form_screen.dart';
import 'package:vetclinic_app/services/api_service.dart';

class _FakeApiService extends ApiService {
  _FakeApiService() : super(baseUrl: 'http://localhost');

  bool createCalled = false;
  String? createdPetId;
  String? createdVetId;
  String? createdType;

  @override
  Future<Map<String, dynamic>> getPets({int page = 1, int limit = 20, String? search}) async {
    return {
      'data': [
        {
          'id': 'p1',
          'ownerId': 'u1',
          'name': 'Rex',
          'species': 'DOG',
          'breed': null,
          'birthDate': null,
          'sex': 'MALE',
          'weightKg': 12.5,
          'photoUrl': null,
          'isActive': true,
          'createdAt': '',
          'updatedAt': '',
        },
      ],
      'pagination': {'page': 1, 'limit': 20, 'total': 1, 'totalPages': 1},
    };
  }

  @override
  Future<Map<String, dynamic>> getVeterinarians({bool availableOnly = false}) async {
    return {
      'data': [
        {
          'id': 'v1',
          'userId': 'user-1',
          'specialty': 'Dermatologie',
          'bio': null,
          'isAvailableForBooking': true,
          'user': {
            'id': 'user-1',
            'email': 'vet1@test.com',
            'firstName': 'Marie',
            'lastName': 'Durand',
            'role': 'VETERINARIAN',
          },
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
  Future<Map<String, dynamic>> createAppointment({
    required String petId,
    required String appointmentType,
    required DateTime scheduledStart,
    required DateTime scheduledEnd,
    String? reason,
    String? veterinarianId,
  }) async {
    createCalled = true;
    createdPetId = petId;
    createdVetId = veterinarianId;
    createdType = appointmentType;
    return {
      'appointment': {
        'id': 'a1',
        'petId': petId,
        'clientId': 'u1',
        'veterinarianId': veterinarianId,
        'appointmentType': appointmentType,
        'status': 'PENDING',
        'scheduledStart': scheduledStart.toIso8601String(),
        'scheduledEnd': scheduledEnd.toIso8601String(),
      },
    };
  }
}

void main() {
  Future<void> pumpForm(tester, fake) async {
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
                    MaterialPageRoute(builder: (_) => const AppointmentFormScreen()),
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

  Future<void> tapNext(WidgetTester tester) async {
    await tester.ensureVisible(find.text('Suivant'));
    await tester.tap(find.text('Suivant'));
    await tester.pumpAndSettle();
  }

  testWidgets('4-step flow creates appointment with selected veterinarian', (tester) async {
    final fake = _FakeApiService();
    await pumpForm(tester, fake);

    expect(find.text('Suivant'), findsOneWidget);

    await tester.tap(find.byType(DropdownButtonFormField<String>).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rex').last);
    await tester.pumpAndSettle();
    await tapNext(tester);

    expect(find.text('Créer le rendez-vous'), findsNothing);

    await tester.tap(find.text('Choisir un vétérinaire'));
    await tester.pumpAndSettle();
    expect(find.text('Marie Durand'), findsOneWidget);
    await tester.tap(find.text('Marie Durand'));
    await tester.pumpAndSettle();

    expect(find.text('Dermatologie'), findsOneWidget);

    await tapNext(tester);
    await tapNext(tester);

    expect(find.text('Créer le rendez-vous'), findsOneWidget);

    await tester.ensureVisible(find.text('Créer le rendez-vous'));
    await tester.tap(find.text('Créer le rendez-vous'));
    await tester.pumpAndSettle();

    expect(fake.createCalled, isTrue);
    expect(fake.createdPetId, 'p1');
    expect(fake.createdVetId, 'v1');
    expect(fake.createdType, 'CONSULTATION');
    expect(find.byType(AppointmentFormScreen), findsNothing);
    expect(find.text('go'), findsOneWidget);
  });

  testWidgets('step 1 blocks forward when no pet is selected', (tester) async {
    final fake = _FakeApiService();
    await pumpForm(tester, fake);

    await tapNext(tester);

    expect(find.text('Sélectionnez un animal'), findsOneWidget);
    expect(find.text('Suivant'), findsOneWidget);
    expect(find.text('Créer le rendez-vous'), findsNothing);
  });
}