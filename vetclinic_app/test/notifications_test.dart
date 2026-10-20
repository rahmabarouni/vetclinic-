import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vetclinic_app/providers/auth_provider.dart';
import 'package:vetclinic_app/screens/notifications_screen.dart';
import 'package:vetclinic_app/services/api_service.dart';
import 'package:vetclinic_app/theme/app_theme.dart';

class _FakeApiService extends ApiService {
  _FakeApiService() : super(baseUrl: 'http://localhost');

  bool markReadCalled = false;
  String? markedId;
  bool markAllCalled = false;
  bool deleteCalled = false;

  @override
  Future<Map<String, dynamic>> getNotifications({int page = 1, int limit = 20}) async {
    return {
      'data': [
        {
          'id': '11111111-1111-1111-1111-111111111111',
          'recipientId': 'u1',
          'type': 'APPOINTMENT',
          'title': 'Rendez-vous confirmé',
          'message': 'Votre rendez-vous est confirmé',
          'isRead': false,
          'createdAt': '2026-01-01T10:00:00.000Z',
        },
        {
          'id': '22222222-2222-2222-2222-222222222222',
          'recipientId': 'u1',
          'type': 'MESSAGE',
          'title': 'Nouveau message',
          'message': 'Vous avez reçu un message',
          'isRead': true,
          'createdAt': '2026-01-02T10:00:00.000Z',
        },
      ],
      'pagination': {'page': 1, 'limit': 20, 'total': 2, 'totalPages': 1},
    };
  }

  @override
  Future<void> markNotificationRead(String id) async {
    markReadCalled = true;
    markedId = id;
  }

  @override
  Future<void> markAllNotificationsRead() async {
    markAllCalled = true;
  }

  @override
  Future<void> deleteNotification(String id) async {
    deleteCalled = true;
  }
}

void main() {
  Future<void> pumpScreen(WidgetTester tester, _FakeApiService fake) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiServiceProvider.overrideWithValue(fake)],
        child: MaterialApp(theme: AppTheme.light, home: const NotificationsScreen()),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('renders notifications and marks one read on tap', (tester) async {
    final fake = _FakeApiService();
    await pumpScreen(tester, fake);

    expect(find.text('Rendez-vous confirmé'), findsOneWidget);
    expect(find.text('Nouveau message'), findsOneWidget);

    await tester.tap(find.text('Rendez-vous confirmé'));
    await tester.pumpAndSettle();

    expect(fake.markReadCalled, isTrue);
    expect(fake.markedId, '11111111-1111-1111-1111-111111111111');
  });

  testWidgets('mark all as read action is available when unread exists', (tester) async {
    final fake = _FakeApiService();
    await pumpScreen(tester, fake);

    await tester.tap(find.byIcon(Icons.done_all));
    await tester.pumpAndSettle();

    expect(fake.markAllCalled, isTrue);
  });
}
