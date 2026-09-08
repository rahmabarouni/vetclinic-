import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../models/message.dart';

enum WsConnectionStatus { disconnected, connecting, connected }

class ChatWsService {
  WebSocketChannel? _channel;
  Timer? _reconnectTimer;
  Timer? _heartbeatTimer;
  String? _conversationId;
  String? _token;
  bool _intentionalClose = false;
  int _reconnectAttempts = 0;
  static const int _maxReconnectAttempts = 10;
  static const Duration _baseReconnectDelay = Duration(seconds: 1);

  final _messageController = StreamController<Message>.broadcast();
  final _statusController = StreamController<WsConnectionStatus>.broadcast();
  final _errorController = StreamController<String>.broadcast();

  Stream<Message> get onMessage => _messageController.stream;
  Stream<WsConnectionStatus> get onStatusChange => _statusController.stream;
  Stream<String> get onError => _errorController.stream;
  WsConnectionStatus get currentStatus => _statusController.hasListener ? WsConnectionStatus.disconnected : WsConnectionStatus.disconnected;

  void connect(String conversationId, String token) {
    _conversationId = conversationId;
    _token = token;
    _intentionalClose = false;
    _reconnectAttempts = 0;
    _doConnect();
  }

  void _doConnect() {
    if (_conversationId == null || _token == null) return;

    _statusController.add(WsConnectionStatus.connecting);
    _closeExisting();

    final uri = Uri.parse(
      'ws://10.0.2.2:3000/api/v1/ws/conversations/$_conversationId?token=$_token',
    );

    try {
      _channel = WebSocketChannel.connect(uri);

      _channel!.stream.listen(
        (data) {
          _reconnectAttempts = 0;
          _statusController.add(WsConnectionStatus.connected);
          _startHeartbeat();

          try {
            final decoded = jsonDecode(data as String) as Map<String, dynamic>;
            final type = decoded['type'] as String?;

            if (type == 'new_message') {
              final messageData = decoded['message'] as Map<String, dynamic>;
              final message = Message.fromJson(messageData);
              _messageController.add(message);
            } else if (type == 'error') {
              final error = decoded['error'] as String? ?? 'Erreur inconnue';
              _errorController.add(error);
            }
          } catch (e) {
            debugPrint('[WS] Parse error: $e');
          }
        },
        onDone: () {
          _statusController.add(WsConnectionStatus.disconnected);
          _stopHeartbeat();
          if (!_intentionalClose) {
            _scheduleReconnect();
          }
        },
        onError: (error) {
          debugPrint('[WS] Error: $error');
          _statusController.add(WsConnectionStatus.disconnected);
          _stopHeartbeat();
          if (!_intentionalClose) {
            _scheduleReconnect();
          }
        },
      );
    } catch (e) {
      debugPrint('[WS] Connection error: $e');
      _statusController.add(WsConnectionStatus.disconnected);
      if (!_intentionalClose) {
        _scheduleReconnect();
      }
    }
  }

  void _scheduleReconnect() {
    if (_reconnectAttempts >= _maxReconnectAttempts) {
      _errorController.add('Nombre maximum de tentatives de reconnexion atteint');
      return;
    }

    final delay = _baseReconnectDelay * (1 << _reconnectAttempts);
    _reconnectAttempts++;

    debugPrint('[WS] Reconnecting in ${delay.inSeconds}s (attempt $_reconnectAttempts)');

    _reconnectTimer = Timer(delay, () {
      _doConnect();
    });
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      try {
        _channel?.sink.add(jsonEncode({'type': 'ping'}));
      } catch (_) {}
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
  }

  void _closeExisting() {
    _reconnectTimer?.cancel();
    _stopHeartbeat();
    try {
      _channel?.sink.close();
    } catch (_) {}
    _channel = null;
  }

  void sendMessage({String? content, String? attachmentUrl, String? attachmentType}) {
    if (_channel == null) return;

    final payload = <String, dynamic>{};
    if (content != null && content.isNotEmpty) payload['content'] = content;
    if (attachmentUrl != null) payload['attachmentUrl'] = attachmentUrl;
    if (attachmentType != null) payload['attachmentType'] = attachmentType;

    try {
      _channel!.sink.add(jsonEncode(payload));
    } catch (e) {
      debugPrint('[WS] Send error: $e');
    }
  }

  void disconnect() {
    _intentionalClose = true;
    _closeExisting();
    _statusController.add(WsConnectionStatus.disconnected);
  }

  void dispose() {
    disconnect();
    _messageController.close();
    _statusController.close();
    _errorController.close();
  }
}
