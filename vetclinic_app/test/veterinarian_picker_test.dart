import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vetclinic_app/providers/auth_provider.dart';
import 'package:vetclinic_app/screens/veterinarian_picker_screen.dart';
import 'package:vetclinic_app/services/api_service.dart';

class _FakeApiService extends ApiService {
  _FakeApiService() : super(baseUrl: 'http://localhost');

  @override
  Future<Map<String, dynamic>> getVeterinarians({bool availableOnly = false}) async {
    return {
      'data': [
        {
          'id': 'vet-1',
          'userId': 'user-1',
          'specialty': 'Dermatologie',
          'bio': 'Spécialiste peau',
          'isAvailableForBooking': true,
          'user': {
            'id': 'user-1',
            'email': 'vet1@test.com',
            'firstName': 'Marie',
            'lastName': 'Durand',
            'role': 'VETERINARIAN',
          },
        },
        {
          'id': 'vet-2',
          'userId': 'user-2',
          'specialty': '',
          'bio': null,
          'isAvailableForBooking': true,
          'user': {
            'id': 'user-2',
            'email': 'vet2@test.com',
            'firstName': 'Paul',
            'lastName': 'Martin',
            'role': 'VETERINARIAN',
          },
        },
      ],
    };
  }
}

void main() {
  testWidgets('Veterinarian picker lists available veterinarians', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiServiceProvider.overrideWithValue(_FakeApiService()),
        ],
        child: const MaterialApp(home: VeterinarianPickerScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Marie Durand'), findsOneWidget);
    expect(find.text('Paul Martin'), findsOneWidget);
    expect(find.text('Dermatologie'), findsOneWidget);
    expect(find.text('Vétérinaire généraliste'), findsOneWidget);
  });
}