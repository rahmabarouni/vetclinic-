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
        reason: 'Le contenu du message client doit être visible côté vétérinaire');
    expect(find.text('Jean Dupont'), findsOneWidget);
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
