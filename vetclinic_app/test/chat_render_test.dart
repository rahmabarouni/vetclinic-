import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vetclinic_app/models/conversation.dart';
import 'package:vetclinic_app/models/message.dart';
import 'package:vetclinic_app/models/user.dart';
import 'package:vetclinic_app/providers/auth_provider.dart';
import 'package:vetclinic_app/providers/conversations_provider.dart';
import 'package:vetclinic_app/screens/chat_screen.dart';
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
}

class _FakeAuthNotifier extends AuthNotifier {
  _FakeAuthNotifier(super.api) {
    state = AuthState(
      status: AuthStatus.authenticated,
      user: User(
        id: 'vet-user-1',
        email: 'dr.martin@vetclinic.test',
        firstName: 'Sophie',
        lastName: 'Martin',
        role: 'VETERINARIAN',
      ),
    );
  }
}

class _StubChatNotifier extends ChatNotifier {
  _StubChatNotifier(super.api);

  @override
  Future<void> loadMessages(String conversationId) async {
    state = ChatState(
      status: ChatStatus.loaded,
      conversationId: conversationId,
      messages: [
        Message(
          id: 'm1',
          conversationId: conversationId,
          senderId: 'client-1',
          content: 'hey',
          isRead: false,
          createdAt: '2026-10-20T13:16:53.786Z',
          updatedAt: '2026-10-20T13:16:53.786Z',
          sender: MessageSender(
            id: 'client-1',
            email: 'jean.dupont@email.test',
            firstName: 'Jean',
            lastName: 'Dupont',
            role: 'CLIENT',
          ),
        ),
        Message(
          id: 'm2',
          conversationId: conversationId,
          senderId: 'vet-user-1',
          content: 'bonjour',
          isRead: false,
          createdAt: '2026-10-20T13:17:00.000Z',
          updatedAt: '2026-10-20T13:17:00.000Z',
          sender: MessageSender(
            id: 'vet-user-1',
            email: 'dr.martin@vetclinic.test',
            firstName: 'Sophie',
            lastName: 'Martin',
            role: 'VETERINARIAN',
          ),
        ),
      ],
    );
  }

  @override
  void connectWs(String conversationId, String token) {}
}

void main() {
  testWidgets('ChatScreen affiche le message envoyé par le client (côté véto)',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiServiceProvider.overrideWithValue(_FakeApiService()),
          authProvider.overrideWith((ref) => _FakeAuthNotifier(ref.read(apiServiceProvider))),
          chatProvider.overrideWith((ref) => _StubChatNotifier(ref.read(apiServiceProvider))),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          home: const _ChatHost(),
        ),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('hey'), findsOneWidget,
        reason: 'Le contenu du message client doit être visible');
    expect(find.text('bonjour'), findsOneWidget,
        reason: 'Le contenu du message véto doit être visible');

    final clientText = tester.getCenter(find.text('hey'));
    final vetText = tester.getCenter(find.text('bonjour'));
    final screenCenter = tester.getCenter(find.byType(Scaffold)).dx;

    expect(clientText.dx, greaterThan(screenCenter),
        reason: 'Le message du client doit être aligné à droite');
    expect(vetText.dx, lessThan(screenCenter),
        reason: 'Le message du vétérinaire doit être aligné à gauche');

    expect(find.text('Sophie Martin'), findsOneWidget,
        reason: 'Le nom du véto s\'affiche sur ses messages (gauche)');
    expect(find.text('Jean Dupont'), findsNothing,
        reason: 'Le message client à droite n\'affiche pas son nom');
  });
}

class _ChatHost extends ConsumerWidget {
  const _ChatHost();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ChatScreen(
      conversation: Conversation(
        id: 'conv-1',
        clientId: 'client-1',
        veterinarianId: 'vet-1',
        status: 'OPEN',
        createdAt: '2026-10-20T13:00:00.000Z',
        updatedAt: '2026-10-20T13:00:00.000Z',
      ),
    );
  }
}
