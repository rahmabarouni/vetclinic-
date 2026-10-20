import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/notification.dart';
import '../services/api_service.dart';
import 'auth_provider.dart';

enum NotificationsStatus { initial, loading, loaded, error }

class NotificationsState {
  final NotificationsStatus status;
  final List<AppNotification> notifications;
  final int unreadCount;
  final int total;
  final String? error;

  NotificationsState({
    this.status = NotificationsStatus.initial,
    this.notifications = const [],
    this.unreadCount = 0,
    this.total = 0,
    this.error,
  });

  NotificationsState copyWith({
    NotificationsStatus? status,
    List<AppNotification>? notifications,
    int? unreadCount,
    int? total,
    String? error,
  }) {
    return NotificationsState(
      status: status ?? this.status,
      notifications: notifications ?? this.notifications,
      unreadCount: unreadCount ?? this.unreadCount,
      total: total ?? this.total,
      error: error ?? this.error,
    );
  }
}

class NotificationsNotifier extends StateNotifier<NotificationsState> {
  final ApiService _api;

  NotificationsNotifier(this._api) : super(NotificationsState()) {
    loadNotifications();
  }

  Future<void> loadNotifications({int page = 1}) async {
    state = state.copyWith(status: NotificationsStatus.loading);
    try {
      final data = await _api.getNotifications(page: page);
      final List<dynamic> items = data['data'] ?? [];
      final notifications =
          items.map((j) => AppNotification.fromJson(j as Map<String, dynamic>)).toList();
      final pagination = data['pagination'] as Map<String, dynamic>? ?? {};
      final unread = notifications.where((n) => !n.isRead).length;
      state = state.copyWith(
        status: NotificationsStatus.loaded,
        notifications: notifications,
        unreadCount: unread,
        total: pagination['total'] ?? notifications.length,
      );
    } catch (e) {
      state = state.copyWith(status: NotificationsStatus.error, error: e.toString());
    }
  }

  Future<void> refreshUnreadCount() async {
    try {
      final count = await _api.getUnreadNotificationCount();
      state = state.copyWith(unreadCount: count);
    } catch (_) {}
  }

  Future<void> markRead(String id) async {
    final previous = state.notifications;
    state = state.copyWith(
      notifications: previous
          .map((n) => n.id == id
              ? AppNotification(
                  id: n.id,
                  recipientId: n.recipientId,
                  type: n.type,
                  title: n.title,
                  message: n.message,
                  isRead: true,
                  readAt: n.readAt,
                  createdAt: n.createdAt,
                )
              : n)
          .toList(),
      unreadCount: (state.unreadCount - 1).clamp(0, state.unreadCount),
    );
    try {
      await _api.markNotificationRead(id);
    } catch (e) {
      state = state.copyWith(error: e.toString());
      await loadNotifications();
    }
  }

  Future<void> markAllRead() async {
    try {
      await _api.markAllNotificationsRead();
      await loadNotifications();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> deleteNotification(String id) async {
    final removed = state.notifications.firstWhere((n) => n.id == id);
    state = state.copyWith(
      notifications: state.notifications.where((n) => n.id != id).toList(),
      unreadCount: removed.isRead
          ? state.unreadCount
          : (state.unreadCount - 1).clamp(0, state.unreadCount),
    );
    try {
      await _api.deleteNotification(id);
    } catch (e) {
      state = state.copyWith(error: e.toString());
      await loadNotifications();
    }
  }

  Future<void> refresh() => loadNotifications();
}

final notificationsProvider =
    StateNotifierProvider<NotificationsNotifier, NotificationsState>((ref) {
  return NotificationsNotifier(ref.watch(apiServiceProvider));
});
