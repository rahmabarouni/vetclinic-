import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Canal de notification Android.
class _Channel {
  const _Channel(this.id, this.name, this.description);
  final String id;
  final String name;
  final String description;
}

/// Affichage des notifications push reçues lorsque l'app est au premier plan.
///
/// En arrière-plan/terminé, le système Android affiche nativement la
/// notification (payload `notification`). Au premier plan, l'OS ne l'affiche
/// pas : on la reproduit ici via une notification locale, avec le même
/// titre/corps et un canal cohérent avec le type métier.
class LocalNotifications {
  LocalNotifications._();

  static const _fallbackChannel =
      _Channel('pawcare_default', 'Notifications', 'Notifications générales.');
  static const _channels = <String, _Channel>{
    'APPOINTMENT': _Channel(
      'pawcare_appointments',
      'Rendez-vous',
      'Demandes et mises à jour de rendez-vous.',
    ),
    'MESSAGE': _Channel(
      'pawcare_messages',
      'Messages',
      'Nouveaux messages.',
    ),
    'REMINDER': _Channel(
      'pawcare_reminders',
      'Rappels',
      'Rappels de rendez-vous et de soins.',
    ),
  };

  static final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  static bool _initialized = false;
  // Base élevée pour ne pas entrer en collision avec les ids (souvent 0)
  // utilisés par les notifications FCM affichées par le système.
  static int _nextId = 100000;

  /// Initialise le plugin et crée les canaux Android. Idempotent.
  static Future<void> init() async {
    if (_initialized) return;
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    );
    await _plugin.initialize(settings: settings);
    await _createChannels();
    _initialized = true;
  }

  static Future<void> _createChannels() async {
    final android = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    if (android == null) return;

    final all = <_Channel>[_fallbackChannel, ..._channels.values];
    for (final channel in all) {
      await android.createNotificationChannel(
        AndroidNotificationChannel(
          channel.id,
          channel.name,
          description: channel.description,
          importance: Importance.high,
        ),
      );
    }
  }

  /// Affiche la notification locale correspondant à un message FCM reçu au
  /// premier plan. Reprend le titre/corps du payload pour rester identique à
  /// l'affichage natif en arrière-plan.
  static Future<void> showFromRemoteMessage(RemoteMessage message) async {
    final notification = message.notification;
    final title = notification?.title ?? message.data['title'] as String?;
    final body = notification?.body ?? message.data['body'] as String?;
    if (title == null && body == null) return;

    await init();
    final channel = _channels[message.data['type']] ?? _fallbackChannel;
    await _plugin.show(
      id: _nextId++,
      title: title,
      body: body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          channel.id,
          channel.name,
          channelDescription: channel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
      ),
      payload: message.data['type'] as String?,
    );
  }
}
