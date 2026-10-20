import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/notification.dart';
import '../providers/notifications_provider.dart';
import '../theme/app_theme.dart';
import '../utils/date_utils.dart' as du;

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(notificationsProvider.notifier).refresh();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(notificationsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (state.unreadCount > 0)
            IconButton(
              tooltip: 'Tout marquer comme lu',
              icon: const Icon(Icons.done_all),
              onPressed: () => ref.read(notificationsProvider.notifier).markAllRead(),
            ),
        ],
      ),
      body: _buildBody(state),
    );
  }

  Widget _buildBody(NotificationsState state) {
    switch (state.status) {
      case NotificationsStatus.initial:
      case NotificationsStatus.loading:
        return const Center(child: CircularProgressIndicator());
      case NotificationsStatus.error:
        return Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: AppColors.error),
              const SizedBox(height: 16),
              Text(state.error ?? 'Erreur inconnue'),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => ref.read(notificationsProvider.notifier).refresh(),
                child: const Text('Réessayer'),
              ),
            ],
          ),
        );
      case NotificationsStatus.loaded:
        if (state.notifications.isEmpty) {
          return const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.notifications_none, size: 64, color: Colors.grey),
                SizedBox(height: 16),
                Text('Aucune notification', style: TextStyle(fontSize: 18, color: Colors.grey)),
              ],
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: () => ref.read(notificationsProvider.notifier).refresh(),
          child: ListView.builder(
            padding: const EdgeInsets.all(8),
            itemCount: state.notifications.length,
            itemBuilder: (context, index) {
              final notification = state.notifications[index];
              return _NotificationCard(
                notification: notification,
                onTap: () => ref.read(notificationsProvider.notifier).markRead(notification.id),
                onDelete: () => ref.read(notificationsProvider.notifier).deleteNotification(notification.id),
              );
            },
          ),
        );
    }
  }
}

class _NotificationCard extends StatelessWidget {
  final AppNotification notification;
  final VoidCallback onTap;
  final VoidCallback onDelete;
  const _NotificationCard({
    required this.notification,
    required this.onTap,
    required this.onDelete,
  });

  IconData get _icon {
    switch (notification.type) {
      case 'APPOINTMENT':
        return Icons.event_available;
      case 'MESSAGE':
        return Icons.chat_bubble;
      case 'REMINDER':
        return Icons.alarm;
      default:
        return Icons.notifications;
    }
  }

  Color get _color {
    switch (notification.type) {
      case 'APPOINTMENT':
        return AppColors.primary;
      case 'MESSAGE':
        return AppColors.success;
      case 'REMINDER':
        return AppColors.accent;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final unread = !notification.isRead;
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        onTap: unread ? onTap : null,
        leading: CircleAvatar(
          backgroundColor: _color.withAlpha(26),
          child: Icon(_icon, color: _color),
        ),
        title: Text(
          notification.title,
          style: TextStyle(
            fontWeight: unread ? FontWeight.bold : FontWeight.w500,
          ),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(notification.message),
            const SizedBox(height: 2),
            Text(
              du.formatDate(notification.createdAt),
              style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
            ),
          ],
        ),
        trailing: unread
            ? Container(
                width: 10,
                height: 10,
                decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
              )
            : IconButton(
                tooltip: 'Supprimer',
                icon: const Icon(Icons.delete_outline, color: Colors.grey),
                onPressed: onDelete,
              ),
      ),
    );
  }
}
