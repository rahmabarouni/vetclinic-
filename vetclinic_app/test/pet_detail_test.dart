import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vetclinic_app/models/pet.dart';
import 'package:vetclinic_app/providers/auth_provider.dart';
import 'package:vetclinic_app/screens/pet_detail_screen.dart';
import 'package:vetclinic_app/services/api_service.dart';

class _FakeApiService extends ApiService {
  _FakeApiService() : super(baseUrl: 'http://localhost');

  @override
  Future<Map<String, dynamic>> getMedicalRecords(String petId) async {
    return {
      'medicalRecords': [
        {
          'id': 'mr-1',
          'petId': petId,
          'appointmentId': null,
          'veterinarianId': 'v1',
          'recordType': 'VACCINATION',
          'title': 'Rage',
          'description': 'Vaccin annuel contre la rage',
          'diagnosis': null,
          'createdAt': '2026-01-15T10:00:00.000Z',
          'updatedAt': '2026-01-15T10:00:00.000Z',
          'veterinarian': {
            'id': 'v1',
            'userId': 'user-1',
            'specialty': '',
            'bio': null,
            'isAvailableForBooking': true,
            'user': {
              'id': 'user-1',
              'email': 'vet@test.com',
              'firstName': 'Marie',
              'lastName': 'Durand',
              'role': 'VETERINARIAN',
            },
          },
        },
      ],
    };
  }

  @override
  Future<Map<String, dynamic>> getPetDocuments(String petId) async {
    return {
      'documents': [
        {
          'id': 'doc-1',
          'petId': petId,
          'medicalRecordId': null,
          'uploadedBy': 'user-1',
          'fileUrl': 'http://localhost/radio.jpg',
          'fileType': 'XRAY',
          'title': 'Radio patte',
          'createdAt': '2026-02-01T09:30:00.000Z',
          'updatedAt': '2026-02-01T09:30:00.000Z',
        },
      ],
    };
  }
}

final _rex = Pet(
  id: 'p1',
  ownerId: 'u1',
  name: 'Rex',
  species: 'DOG',
  breed: 'Labrador',
  birthDate: '2021-05-01',
  sex: 'MALE',
  weightKg: 12.5,
  photoUrl: null,
  isActive: true,
  createdAt: '',
  updatedAt: '',
);

void main() {
  Future<void> pumpDetail(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiServiceProvider.overrideWithValue(_FakeApiService())],
        child: MaterialApp(home: PetDetailScreen(pet: _rex)),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('Pet detail shows banner with badges', (tester) async {
    await pumpDetail(tester);

    expect(find.text('Rex'), findsWidgets);
    expect(find.text('Chien'), findsWidgets);
    expect(find.text('Mâle'), findsWidgets);
    expect(find.text('12.5 kg'), findsWidgets);
  });

  testWidgets('Pet detail shows medical history from API', (tester) async {
    await pumpDetail(tester);

    await tester.tap(find.text('Historique'));
    await tester.pumpAndSettle();

    expect(find.text('Rage'), findsOneWidget);
    expect(find.text('Vaccination'), findsOneWidget);
    expect(find.text('Dr Marie Durand'), findsOneWidget);
  });

  testWidgets('Pet detail shows documents from API', (tester) async {
    await pumpDetail(tester);

    await tester.tap(find.text('Documents'));
    await tester.pumpAndSettle();

    expect(find.text('Radio patte'), findsOneWidget);
    expect(find.textContaining('Radio'), findsWidgets);
  });
}