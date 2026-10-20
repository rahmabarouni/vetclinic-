import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/conversation.dart';
import '../models/message.dart';
import '../services/api_service.dart';
import '../services/chat_ws_service.dart';
import 'auth_provider.dart';

enum ConversationsStatus { initial, loading, loaded, error }

class ConversationsState {
  final ConversationsStatus status;
  final List<Conversation> conversations;
  final String? error;

  ConversationsState({
    this.status = ConversationsStatus.initial,
    this.conversations = const [],
    this.error,
  });

  ConversationsState copyWith({
    ConversationsStatus? status,
    List<Conversation>? conversations,
    String? error,
  }) {
    return ConversationsState(
      status: status ?? this.status,
      conversations: conversations ?? this.conversations,
      error: error ?? this.error,
    );
  }
}

enum ChatStatus { initial, loading, loaded, error }

class ChatState {
  final ChatStatus status;
  final String? conversationId;
  final List<Message> messages;
  final WsConnectionStatus wsStatus;
  final String? error;

  ChatState({
    this.status = ChatStatus.initial,
    this.conversationId,
    this.messages = const [],
    this.wsStatus = WsConnectionStatus.disconnected,
    this.error,
  });

  ChatState copyWith({
    ChatStatus? status,
    String? conversationId,
    List<Message>? messages,
    WsConnectionStatus? wsStatus,
    String? error,
  }) {
    return ChatState(
      status: status ?? this.status,
      conversationId: conversationId ?? this.conversationId,
      messages: messages ?? this.messages,
      wsStatus: wsStatus ?? this.wsStatus,
      error: error ?? this.error,
    );
  }
}

class ConversationsNotifier extends StateNotifier<ConversationsState> {
  final ApiService _api;

  ConversationsNotifier(this._api) : super(ConversationsState()) {
    loadConversations();
  }

  Future<void> loadConversations() async {
    state = state.copyWith(status: ConversationsStatus.loading);
    try {
      final data = await _api.getConversations();
      final List<dynamic> items = data['data'] ?? [];
      final conversations = items.map((j) => Conversation.fromJson(j as Map<String, dynamic>)).toList();
      state = state.copyWith(status: ConversationsStatus.loaded, conversations: conversations);
    } catch (e) {
      state = state.copyWith(status: ConversationsStatus.error, error: e.toString());
    }
  }

  Future<Conversation?> createConversation({String? veterinarianId}) async {
    try {
      final data = await _api.createConversation(veterinarianId: veterinarianId);
      final conversation = Conversation.fromJson(data['conversation'] as Map<String, dynamic>);
      await loadConversations();
      return conversation;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return null;
    }
  }

  Future<void> refresh() async => loadConversations();
}

final conversationsProvider = StateNotifierProvider<ConversationsNotifier, ConversationsState>((ref) {
  return ConversationsNotifier(ref.watch(apiServiceProvider));
});

class ChatNotifier extends StateNotifier<ChatState> {
  final ApiService _api;
  final ChatWsService _ws;
  StreamSubscription<Message>? _messageSub;
  StreamSubscription<WsConnectionStatus>? _statusSub;
  StreamSubscription<String>? _errorSub;

  ChatNotifier(this._api) : _ws = ChatWsService(), super(ChatState()) {
    _statusSub = _ws.onStatusChange.listen((status) {
      state = state.copyWith(wsStatus: status);
    });
    _errorSub = _ws.onError.listen((error) {
      state = state.copyWith(error: error);
    });
  }

  Future<void> loadMessages(String conversationId) async {
    state = state.copyWith(status: ChatStatus.loading, conversationId: conversationId);
    try {
      final data = await _api.getMessages(conversationId);
      final List<dynamic> items = data['data'] ?? [];
      final messages = items.map((j) => Message.fromJson(j as Map<String, dynamic>)).toList();
      state = state.copyWith(status: ChatStatus.loaded, messages: messages);
    } catch (e) {
      state = state.copyWith(status: ChatStatus.error, error: e.toString());
    }
  }

  void connectWs(String conversationId, String token) {
    _messageSub?.cancel();
    _messageSub = _ws.onMessage.listen((message) {
      final exists = state.messages.any((m) => m.id == message.id);
      if (!exists) {
        state = state.copyWith(messages: [...state.messages, message]);
      }
    });
    _ws.connect(conversationId, token);
  }

  void sendMessage(String conversationId, {String? content}) {
    _ws.sendMessage(content: content);
  }

  void disconnect() {
    _messageSub?.cancel();
    _statusSub?.cancel();
    _errorSub?.cancel();
    _ws.disconnect();
  }

  @override
  void dispose() {
    disconnect();
    _ws.dispose();
    super.dispose();
  }
}

final chatProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  final api = ref.watch(apiServiceProvider);
  return ChatNotifier(api);
});
